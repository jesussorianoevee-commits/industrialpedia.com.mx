import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizeUnit, splitValueUnit, normalizePartNumber } from '../../shared/normalize.js';

// JOB DE INGESTA DETERMINÍSTICO (sin IA).
// Flujo: DOCUMENTO → PARSEO → EXTRACCIÓN (por mapa) → NORMALIZACIÓN →
//        EVIDENCE/PROVENANCE → QUALITY GATEWAY → PUBLICACIÓN EN KNOWLEDGE CORE.
//
// Contrato de entrada:
// {
//   file_url?: string,        // documento real subido (CSV o JSON). Si se omite, usar `data`.
//   data?: array | string,    // registros inline (array de objetos) o texto CSV (para dry-run/directo).
//   document_title?: string,
//   source_url?: string,      // URL original de la fuente (para la entidad Source).
//   manufacturer?: string,    // hint MANUAL de fabricante (precedencia MANUAL > GENÉRICO).
//   category?: string,
//   map: {                    // mapeo determinístico de campos. Genérico: ningún fabricante es caso especial.
//     part_number: string,    // requerido: columna/clave del número de parte.
//     manufacturer?: string,  // opcional: columna/clave del fabricante (si no, usa `manufacturer`).
//     description?: string,
//     category?: string,
//     specs?: { <colOclave>: { attribute?: string, unit?: string } }
//   },
//   dry_run?: boolean         // true: ejecuta todo el pipeline SIN persistir (verificación estructural).
// }

function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    if (!rows[r].some((x) => x.trim() !== '') && rows[r].length === 1) continue;
    const o = {};
    header.forEach((h, i) => { o[h] = (rows[r][i] || '').trim(); });
    out.push(o);
  }
  return out;
}

function asRecords(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    return data.records || data.parts || data.items || data.data || [];
  }
  return [];
}

async function loadRecords(body) {
  if (Array.isArray(body.data) || (body.data && typeof body.data === 'object')) {
    return asRecords(body.data);
  }
  if (typeof body.data === 'string' && body.data.trim()) {
    const t = body.data.trim();
    if (t[0] === '{' || t[0] === '[') return asRecords(JSON.parse(t));
    return parseCSV(t);
  }
  if (body.file_url) {
    const res = await fetch(body.file_url);
    const text = await res.text();
    const t = text.trim();
    if (t[0] === '{' || t[0] === '[') return asRecords(JSON.parse(t));
    if (body.file_url.toLowerCase().endsWith('.json')) return asRecords(JSON.parse(t));
    return parseCSV(t);
  }
  return [];
}

// Quality Gateway determinístico. NO relaja reglas para conseguir un resultado.
function qualityGate(rec) {
  const causes = [];
  if (!rec.part_number) causes.push('missing part_number');
  if (!rec.manufacturer_name) causes.push('missing manufacturer');
  if (causes.length === 0) return { pass: true, state: 'published' };
  return { pass: false, state: 'rejected', causes };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // Operación administrativa (publica en Knowledge Core).
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;
    const map = body.map || {};
    if (!map.part_number) {
      return Response.json({ error: 'map.part_number es requerido (contrato de ingesta)' }, { status: 400 });
    }

    const records = await loadRecords(body);
    const manufacturerHint = body.manufacturer || '';
    const categoryHint = body.category || '';

    // Estructuración + normalización + quality gateway (en memoria).
    const built = [];
    for (const r of records) {
      const partNumber = String(r[map.part_number] || '').trim();
      const manufacturerName = (map.manufacturer ? String(r[map.manufacturer] || '').trim() : '') || manufacturerHint;
      const description = map.description ? String(r[map.description] || '').trim() : '';
      const category = (map.category ? String(r[map.category] || '').trim() : '') || categoryHint;

      const specs = [];
      if (map.specs) {
        for (const [col, cfg] of Object.entries(map.specs)) {
          const raw = r[col];
          if (raw === undefined || raw === null || String(raw).trim() === '') continue;
          const { value, unit } = splitValueUnit(raw);
          specs.push({
            attribute_name: col,
            attribute_canonical: (cfg && cfg.attribute) || col,
            original_value: String(raw).trim(),
            normalized_value: value,
            original_unit: (cfg && cfg.unit) || unit,
            normalized_unit: normalizeUnit((cfg && cfg.unit) || unit)
          });
        }
      }

      const rec = {
        part_number: partNumber,
        part_number_normalized: normalizePartNumber(partNumber),
        manufacturer_name: manufacturerName,
        description,
        category,
        specs,
        raw_text: JSON.stringify(r)
      };
      const gate = qualityGate(rec);
      built.push({ rec, gate });
    }

    const published = built.filter((b) => b.gate.pass);
    const rejected = built.filter((b) => !b.gate.pass);

    if (dryRun) {
      // Verificación estructural: NO persiste nada. Demuestra el ciclo sin datos ficticios.
      return Response.json({
        mode: 'dry_run',
        parsed_records: records.length,
        would_publish: published.length,
        would_reject: rejected.length,
        preview: published.slice(0, 5).map((b) => ({
          part_number: b.rec.part_number,
          part_number_normalized: b.rec.part_number_normalized,
          manufacturer_name: b.rec.manufacturer_name,
          category: b.rec.category,
          description: b.rec.description,
          spec_count: b.rec.specs.length,
          specs: b.rec.specs
        })),
        rejections: rejected.map((b) => ({ causes: b.gate.causes, raw: b.rec.raw_text }))
      });
    }

    // --- Publicación real en Knowledge Core (persistencia) ---
    // Documento + Source (una vez por ingesta).
    const documentRec = await base44.asServiceRole.entities.Document.create({
      title: body.document_title || `Ingesta ${new Date().toISOString()}`,
      file_url: body.file_url || '',
      document_type: 'catalog',
      status: 'published'
    });
    let sourceId = '';
    if (body.source_url) {
      const sourceRec = await base44.asServiceRole.entities.Source.create({
        document_id: documentRec.id,
        url: body.source_url,
        type: 'datasheet',
        retrieved_date: new Date().toISOString()
      });
      sourceId = sourceRec.id;
    }

    // Idempotencia: no duplicar partes ya existentes (mismo part_number + manufacturer).
    const pns = published.map((b) => b.rec.part_number).filter(Boolean);
    let existing = new Set();
    if (pns.length) {
      const dup = await base44.asServiceRole.entities.Part.filter({ part_number: { $in: pns } }, '-updated_date', 500);
      dup.forEach((p) => existing.add(`${p.part_number}|${p.manufacturer_name}`));
    }

    let created = 0, skipped = 0, rejectedCreated = 0;
    const report = [];

    for (const b of published) {
      const key = `${b.rec.part_number}|${b.rec.manufacturer_name}`;
      if (existing.has(key)) { skipped++; report.push({ part_number: b.rec.part_number, status: 'skipped_duplicate' }); continue; }

      const partRec = await base44.asServiceRole.entities.Part.create({
        manufacturer_name: b.rec.manufacturer_name,
        part_number: b.rec.part_number,
        part_number_normalized: b.rec.part_number_normalized,
        category: b.rec.category,
        description: b.rec.description,
        validation_state: 'published'
      });

      // Evidence a nivel parte (evidencia documental del registro completo).
      const partEvidence = await base44.asServiceRole.entities.Evidence.create({
        document_id: documentRec.id,
        part_id: partRec.id,
        raw_text: b.rec.raw_text
      });

      await base44.asServiceRole.entities.Provenance.create({
        entity_type: 'part', entity_id: partRec.id,
        operation: 'extract', source_id: sourceId, note: 'ingesta determinística por mapa'
      });

      for (const s of b.rec.specs) {
        const specRec = await base44.asServiceRole.entities.Specification.create({
          part_id: partRec.id,
          attribute_name: s.attribute_name,
          attribute_canonical: s.attribute_canonical,
          original_value: s.original_value,
          normalized_value: s.normalized_value,
          original_unit: s.original_unit,
          normalized_unit: s.normalized_unit,
          source_id: sourceId,
          validation_state: 'published'
        });
        // Evidence a nivel spec (respalda el valor; sin esto la spec NO se considera verificada).
        await base44.asServiceRole.entities.Evidence.create({
          document_id: documentRec.id,
          part_id: partRec.id,
          specification_id: specRec.id,
          raw_text: `${s.attribute_name}: ${s.original_value}`
        });
        await base44.asServiceRole.entities.Provenance.create({
          entity_type: 'specification', entity_id: specRec.id,
          operation: 'extract', source_id: sourceId, note: 'normalización determinística'
        });
      }
      created++;
      report.push({ part_number: b.rec.part_number, manufacturer: b.rec.manufacturer_name, status: 'published', specs: b.rec.specs.length });
    }

    // Rechazos: se registran (no se publican) para trazabilidad de fallos.
    for (const b of rejected) {
      await base44.asServiceRole.entities.Provenance.create({
        entity_type: 'part', entity_id: '',
        operation: 'reject', source_id: sourceId,
        note: `causas: ${b.gate.causes.join(', ')} · ${b.rec.raw_text}`
      });
      rejectedCreated++;
      report.push({ status: 'rejected', causes: b.gate.causes });
    }

    return Response.json({
      mode: 'publish',
      document_id: documentRec.id,
      source_id: sourceId,
      parsed_records: records.length,
      published: created,
      skipped_duplicates: skipped,
      rejected: rejectedCreated,
      report
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}