import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizeUnit, splitValueUnit, normalizePartNumber } from '../../shared/normalize.js';
import { gatePart, gateSpec } from '../../shared/qualityGateway.js';
import { extractHTML, extractPlainText, extractPartNumber, extractPDF } from '../../shared/extract.js';

// JOB DE INGESTA DETERMINÍSTICO desde CrawlDocument (sin IA).
// CrawlDocument -> EXTRACCION -> ESTRUCTURACION -> NORMALIZACION ->
//   PROVENANCE/EVIDENCE -> QUALITY GATEWAY -> KNOWLEDGE CORE.
//
// Reanudable: procesa CrawlDocument en estado 'downloaded' con ingested=false, por lote.
// Idempotente: si ya existe un Document con el mismo content_hash, se omite (no duplica).
//
// Contrato de entrada:
// {
//   document_id?: string,   // ingerir un CrawlDocument concreto
//   limit?: number,         // tamaño de lote (default 10)
//   dry_run?: boolean,      // true: ejecuta SIN persistir (verificación estructural)
//   manufacturer_hint?: string  // pista MANUAL (precedencia MANUAL > INDUCIDO > GENERICO)
// }

const LIMIT_DEFAULT = 10;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;
    const limit = Math.max(1, Math.min(50, Number(body.limit) || LIMIT_DEFAULT));
    const manualHint = (body.manufacturer_hint || '').trim();

    // 1. Selección de CrawlDocument reales disponibles para ingerir.
    let docs;
    if (body.document_id) {
      const one = await base44.asServiceRole.entities.CrawlDocument.get(body.document_id).catch(() => null);
      docs = one ? [one] : [];
    } else {
      docs = await base44.asServiceRole.entities.CrawlDocument.filter(
        { state: 'downloaded', ingested: false },
        'created_date',
        limit
      );
    }

    if (!docs.length) {
      return Response.json({
        mode: dryRun ? 'dry_run' : 'publish',
        available: 0,
        note: 'No hay CrawlDocument en estado "downloaded" sin ingerir. El crawler debe producir documentos reales (dry_run:false sobre una fuente aprobada con documentos) antes de poder ingerir.'
      });
    }

    // Pre-carga de sources (INDUCED manufacturer) para evitar lookups repetidos.
    const sourceCache = new Map();
    async function getSource(sid) {
      if (!sid) return null;
      if (sourceCache.has(sid)) return sourceCache.get(sid);
      const s = await base44.asServiceRole.entities.CrawlSource.get(sid).catch(() => null);
      sourceCache.set(sid, s);
      return s;
    }

    // Idempotencia: Document ya creado con el mismo content_hash -> omitir.
    const hashes = docs.map((d) => d.content_hash).filter(Boolean);
    const existingHashes = new Set();
    if (hashes.length) {
      const dup = await base44.asServiceRole.entities.Document.filter(
        { content_hash: { $in: hashes } }, '-updated_date', 500
      );
      dup.forEach((d) => existingHashes.add(d.content_hash));
    }

    const report = [];
    let published = 0, incomplete = 0, rejected = 0, skipped = 0, errors = 0;

    for (const cd of docs) {
      try {
        if (cd.content_hash && existingHashes.has(cd.content_hash)) {
          skipped++;
          report.push({ crawl_document_id: cd.id, url: cd.url, status: 'skipped_duplicate_hash' });
          if (!dryRun) await base44.asServiceRole.entities.CrawlDocument.update(cd.id, { ingested: true });
          continue;
        }

        // 2. EXTRACCION: traer el documento real y extraer texto/estructura.
        let extracted = { extractable: false, reason: 'not fetched' };
        try {
          const res = await fetch(cd.url, { headers: { 'User-Agent': 'IndustrialpediaIngesta/1.0 (deterministic; +https://industrialpedia)' } });
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          const raw = await res.text();
          const isPdf = ct.includes('pdf') || cd.url.toLowerCase().endsWith('.pdf') || cd.type === 'pdf';
          if (isPdf) {
            extracted = extractPDF();
          } else if (ct.includes('html') || /<\/html>/i.test(raw)) {
            extracted = extractHTML(raw);
          } else {
            extracted = extractPlainText(raw);
          }
        } catch (e) {
          // Error transitorio de red: NO marca ingested (reanudable). No inventa.
          errors++;
          report.push({ crawl_document_id: cd.id, url: cd.url, status: 'fetch_error', error: e.message });
          continue;
        }

        if (!extracted.extractable) {
          // No se puede extraer de forma determinística -> INCOMPLETE (no se publica, no se inventa).
          incomplete++;
          report.push({ crawl_document_id: cd.id, url: cd.url, status: 'incomplete', reason: extracted.reason });
          if (!dryRun) {
            await base44.asServiceRole.entities.Document.create({
              title: cd.title || cd.url, file_url: cd.url, content_hash: cd.content_hash,
              document_type: 'other', status: 'incomplete'
            });
            await base44.asServiceRole.entities.CrawlDocument.update(cd.id, { ingested: true });
          }
          continue;
        }

        // 3. ESTRUCTURACION (precedencia MANUAL > INDUCIDO > GENERICO).
        const source = await getSource(cd.source_id);
        const inducedManufacturer = source?.manufacturer || source?.name || '';
        const manufacturerName = manualHint || inducedManufacturer || '';
        const partNumber = extractPartNumber(extracted.text, extracted.title);
        const description = (extracted.title || extracted.text || '').slice(0, 240);

        const specs = extracted.specTable
          .filter((r) => r.attribute && r.value)
          .map((r) => {
            const { value, unit } = splitValueUnit(r.value);
            return {
              attribute_name: r.attribute,
              attribute_canonical: r.attribute,
              original_value: r.value,
              normalized_value: value,
              original_unit: unit,
              normalized_unit: normalizeUnit(unit)
            };
          });

        const rec = {
          part_number: partNumber,
          part_number_normalized: normalizePartNumber(partNumber),
          manufacturer_name: manufacturerName,
          description,
          specs,
          raw_text: extracted.text
        };
        const gate = gatePart(rec);

        if (dryRun) {
          report.push({
            crawl_document_id: cd.id, url: cd.url,
            status: gate.state,
            part_number: rec.part_number,
            manufacturer_name: rec.manufacturer_name,
            spec_count: rec.specs.length,
            causes: gate.causes
          });
          if (gate.state === 'published') published++;
          else if (gate.state === 'incomplete') incomplete++;
          else rejected++;
          continue;
        }

        // 4/5/6/7. PUBLICACION en Knowledge Core (solo si PUBLISHED).
        if (gate.state !== 'published') {
          if (gate.state === 'incomplete') incomplete++;
          else rejected++;
          const docRec = await base44.asServiceRole.entities.Document.create({
            title: cd.title || extracted.title || cd.url, file_url: cd.url,
            content_hash: cd.content_hash, document_type: 'other', status: gate.state
          });
          await base44.asServiceRole.entities.Provenance.create({
            entity_type: 'document', entity_id: docRec.id, operation: 'reject',
            source_id: cd.source_id || '', note: `causas: ${gate.causes.join(', ')}`
          });
          await base44.asServiceRole.entities.CrawlDocument.update(cd.id, { ingested: true });
          report.push({ crawl_document_id: cd.id, status: gate.state, causes: gate.causes });
          continue;
        }

        const docRec = await base44.asServiceRole.entities.Document.create({
          title: cd.title || extracted.title || cd.url, file_url: cd.url,
          content_hash: cd.content_hash, document_type: 'datasheet', status: 'published'
        });
        const sourceRec = await base44.asServiceRole.entities.Source.create({
          document_id: docRec.id, url: cd.url, type: 'datasheet', retrieved_date: new Date().toISOString()
        });

        // Manufacturer find-or-create (no duplica).
        let manufacturerId = '';
        const manuf = await base44.asServiceRole.entities.Manufacturer.filter({ name: rec.manufacturer_name }, '-updated_date', 1);
        if (manuf.length) {
          manufacturerId = manuf[0].id;
        } else {
          const m = await base44.asServiceRole.entities.Manufacturer.create({ name: rec.manufacturer_name, status: 'active' });
          manufacturerId = m.id;
        }

        const partRec = await base44.asServiceRole.entities.Part.create({
          manufacturer_id: manufacturerId, manufacturer_name: rec.manufacturer_name,
          part_number: rec.part_number, part_number_normalized: rec.part_number_normalized,
          category: source?.name || '', description: rec.description, validation_state: 'published'
        });

        const partEvidence = await base44.asServiceRole.entities.Evidence.create({
          document_id: docRec.id, part_id: partRec.id, raw_text: rec.raw_text
        });
        await base44.asServiceRole.entities.Provenance.create({
          entity_type: 'part', entity_id: partRec.id, operation: 'extract',
          source_id: sourceRec.id, rule_id: 'extract.html', note: 'ingesta determinística desde CrawlDocument'
        });

        let specsPublished = 0;
        for (const s of rec.specs) {
          const sg = gateSpec(s);
          const specRec = await base44.asServiceRole.entities.Specification.create({
            part_id: partRec.id, attribute_name: s.attribute_name, attribute_canonical: s.attribute_canonical,
            original_value: s.original_value, normalized_value: s.normalized_value,
            original_unit: s.original_unit, normalized_unit: s.normalized_unit,
            source_id: sourceRec.id, evidence_id: '', validation_state: sg.state
          });
          if (sg.pass) {
            const ev = await base44.asServiceRole.entities.Evidence.create({
              document_id: docRec.id, part_id: partRec.id, specification_id: specRec.id,
              raw_text: `${s.attribute_name}: ${s.original_value}`
            });
            await base44.asServiceRole.entities.Specification.update(specRec.id, { evidence_id: ev.id, validation_state: 'published' });
            await base44.asServiceRole.entities.Provenance.create({
              entity_type: 'specification', entity_id: specRec.id, operation: 'normalize',
              source_id: sourceRec.id, rule_id: 'normalize.valueUnit', note: 'normalización determinística valor/unidad'
            });
            specsPublished++;
          }
        }

        await base44.asServiceRole.entities.CrawlDocument.update(cd.id, { ingested: true, state: 'ingested' });
        published++;
        report.push({
          crawl_document_id: cd.id, url: cd.url, status: 'published',
          document_id: docRec.id, source_id: sourceRec.id, part_id: partRec.id,
          manufacturer_id: manufacturerId, part_number: rec.part_number,
          specs_published: specsPublished, evidence_id: partEvidence.id
        });
      } catch (e) {
        errors++;
        report.push({ crawl_document_id: cd.id, url: cd.url, status: 'error', error: e.message });
      }
    }

    return Response.json({
      mode: dryRun ? 'dry_run' : 'publish',
      available: docs.length,
      published, incomplete, rejected, skipped, errors,
      report
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}