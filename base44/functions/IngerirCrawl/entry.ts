import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizeUnit, splitValueUnit, normalizePartNumber } from '../../shared/normalize.js';
import { gatePart, gateSpec } from '../../shared/qualityGateway.js';
import { extractHTML, extractPlainText, extractTextSpecs, findPageFor } from '../../shared/extract.js';
import { extractPDF, extractStructuredSpecs } from '../../shared/pdfExtract.js';
import { extractCandidates, selectPartNumber, selectPartNumbers, selectSpecificationsForPart } from '../../shared/knowledgeBuilder.js';
import { isTechnicalSpecification } from '../../shared/semanticResolver.js';
import { validateDownloadedDocument } from '../../shared/documentIntegrity.js';
import { autoTranslatePart } from '../../shared/autoTranslatePart.ts';

// PIPELINE MASIVO DE INGESTA DETERMINÍSTICA (sin IA) desde CrawlDocument.
// Cola (IngestionTask) -> extraccion PDF/HTML -> estructuracion -> normalizacion ->
//   provenance/evidence -> quality gateway -> knowledge core -> (indexado por Buscar).
//
// Reanudable, idempotente, fallo aislado (retry+backoff), concurrencia controlada.
// 1 documento y 1,000 documentos usan el mismo pipeline (solo cambia el numero de invocaciones).
//
// Contrato:
// {
//   enqueue?: boolean,       // true: crear IngestionTask para CrawlDocument pendientes (default true)
//   limit?: number,          // max tareas a procesar por invocacion (default 20)
//   concurrency?: number,    // paralelismo (default 3)
//   max_attempts?: number,   // reintentos por documento (default 3)
//   backoff_ms?: number,     // backoff base entre reintentos (default 5000)
//   dry_run?: boolean,
//   rebuild?: boolean,         // true: reprocesar tareas históricas cuyo Document ya no está publicado
//   manufacturer_hint?: string  // pista MANUAL (precedencia MANUAL > INDUCIDO > GENERICO)
// }

const LIMIT_DEFAULT = 20, CONC_DEFAULT = 3, MAX_ATT_DEFAULT = 3, BACKOFF_DEFAULT = 5000;
const STALE_MS = 10 * 60 * 1000;

async function refreshSearchIndexForPart(base44, partId) {
  const part = await base44.asServiceRole.entities.Part.get(partId);
  if (!part) return;
  const specs = await base44.asServiceRole.entities.Specification.filter({ part_id: partId }, '-updated_date', 2000).catch(() => []);
  const evidence = await base44.asServiceRole.entities.Evidence.filter({ part_id: partId }, '-updated_date', 2000).catch(() => []);
  const specText = specs.map((s) => [s.attribute_canonical || s.attribute_name || '', s.normalized_value ?? s.original_value ?? '', s.normalized_unit ?? s.original_unit ?? ''].join(' ')).join(' | ');
  const searchText = [part.part_number || '', part.part_number_normalized || '', part.manufacturer_name || '', part.category || '', part.subcategory || '', part.description || '', specText].join(' ').replace(/\\s+/g, ' ').trim();
  const payload = {
    part_id: part.id, part_number: part.part_number || '', part_number_normalized: part.part_number_normalized || '',
    manufacturer_name: part.manufacturer_name || '', category: part.category || '', subcategory: part.subcategory || '',
    description: part.description || '', search_text: searchText, spec_text: specText,
    validation_state: part.validation_state || 'processed', evidence_count: evidence.length,
    source_count: new Set(specs.map((s) => s.source_id).filter(Boolean)).size, spec_count: specs.length
  };
  const existing = await base44.asServiceRole.entities.SearchIndex.filter({ part_id: part.id }, 'updated_date', 1).catch(() => []);
  if (existing.length) await base44.asServiceRole.entities.SearchIndex.update(existing[0].id, payload);
  else await base44.asServiceRole.entities.SearchIndex.create(payload);
}

async function pool(items, n, worker) {
  let i = 0; const out = new Array(items.length);
  async function run() { while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx]); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return out;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;
    const rebuild = !!body.rebuild;
    const enqueue = body.enqueue !== false;
    const limit = Math.max(1, Math.min(100, Number(body.limit) || LIMIT_DEFAULT));
    const concurrency = Math.max(1, Math.min(8, Number(body.concurrency) || CONC_DEFAULT));
    const maxAttempts = Math.max(1, Number(body.max_attempts) || MAX_ATT_DEFAULT);
    const backoffMs = Math.max(0, Number(body.backoff_ms) || BACKOFF_DEFAULT);
    const manualHint = (body.manufacturer_hint || '').trim();
    const manualPN = (body.part_number_hint || '').trim();
    const t0 = Date.now();

    // 1. COLA: encolar CrawlDocument pendientes como IngestionTask (idempotente: no duplica).
    let enqueued = 0;
    if (enqueue && !dryRun) {
      const pending = await base44.asServiceRole.entities.CrawlDocument.filter(
        { state: 'downloaded', ingested: false }, 'created_date', 200
      );
      if (pending.length) {
        const ids = pending.map((d) => d.id);
        const existing = await base44.asServiceRole.entities.IngestionTask.filter(
          { crawl_document_id: { $in: ids } }, 'created_date', 500
        );
        const have = new Set(existing.map((t) => t.crawl_document_id));
        for (const d of pending) {
          if (have.has(d.id)) continue;
          await base44.asServiceRole.entities.IngestionTask.create({
            crawl_document_id: d.id, source_id: d.source_id || '', url: d.url,
            content_hash: d.content_hash || '', state: 'queued', attempts: 0, max_attempts: maxAttempts
          });
          enqueued++;
        }
      }
    }

    // 2. Seleccion de tareas: cola normal + reconstrucción explícita de tareas históricas.
    const now = Date.now();
    const candidates = await base44.asServiceRole.entities.IngestionTask.list('created_date', 500);
    const candidateDocuments = rebuild
      ? await base44.asServiceRole.entities.Document.filter({ id: { $in: candidates.map((t) => t.document_id).filter(Boolean) } }, 'updated_date', 500).catch(() => [])
      : [];
    const documentById = new Map(candidateDocuments.map((d) => [d.id, d]));
    const eligible = candidates.filter((t) => {
      if (t.state === 'queued') return true;
      if (t.state === 'failed' && (t.attempts || 0) < (t.max_attempts || maxAttempts)) {
        const last = t.last_attempt_date ? Date.parse(t.last_attempt_date) : 0;
        return (now - last) >= backoffMs * Math.pow(2, (t.attempts || 1) - 1);
      }
      if (t.state === 'processing') {
        const last = t.last_attempt_date ? Date.parse(t.last_attempt_date) : 0;
        return (now - last) >= STALE_MS;
      }
      if (rebuild && t.document_id) {
        const d = documentById.get(t.document_id);
        // rebuild es una operación explícita de reconstrucción: permite reprocesar
        // documentos históricos incluso si quedaron published con datos de una versión
        // anterior del pipeline. La idempotencia normal permanece intacta cuando
        // rebuild=false.
        return !!d;
      }
      return false;
    }).slice(0, limit);

    if (!eligible.length) {
      return Response.json({
        mode: dryRun ? 'dry_run' : 'publish', enqueued,
        selected: 0, metrics: { total: 0, processed: 0, published: 0, incomplete: 0, rejected: 0, failed: 0, retries: 0, time_ms: Date.now() - t0, pending: candidates.filter((t) => t.state === 'queued').length },
        note: 'No hay IngestionTask pendientes. Ejecuta el crawler (dry_run:false) sobre una fuente aprobada con documentos, o invoca con enqueue:true.'
      });
    }

    // cache de fuentes (fabricante INDUCED).
    const sourceCache = new Map();
    async function getSource(sid) {
      if (!sid) return null;
      if (sourceCache.has(sid)) return sourceCache.get(sid);
      const s = await base44.asServiceRole.entities.CrawlSource.get(sid).catch(() => null);
      sourceCache.set(sid, s); return s;
    }
    // grammar INDUCIDA activa (Manufacturer Knowledge Builder, validada fuera de muestra).
    const grammarCache = new Map();
    async function loadActiveGrammar(sid, manufacturer) {
      const key = sid || manufacturer || '';
      if (!key) return null;
      if (grammarCache.has(key)) return grammarCache.get(key);
      let g = null;
      const filt = sid ? { source_id: sid } : { manufacturer };
      const list = await base44.asServiceRole.entities.PartNumberGrammar.filter({ ...filt, status: 'active' }, '-version', 1).catch(() => []);
      if (list && list.length) g = list[0];
      grammarCache.set(key, g); return g;
    }

    // Idempotencia: solo un Document realmente publicado bloquea una reconstrucción.
    // Los Documents incompletos/rechazados son históricos y deben poder reconstruirse
    // desde su documento original cuando rebuild=true.
    const hashes = eligible.map((t) => t.content_hash).filter(Boolean);
    const publishedHashes = new Set();
    if (hashes.length) {
      const dup = await base44.asServiceRole.entities.Document.filter({ content_hash: { $in: hashes }, status: 'published' }, 'updated_date', 500);
      dup.forEach((d) => publishedHashes.add(d.content_hash));
    }

    let processed = 0, published = 0, incomplete = 0, rejected = 0, failed = 0, retries = 0;
    const report = [];

    async function processTask(task) {
      if (!rebuild && task.content_hash && publishedHashes.has(task.content_hash)) {
        if (!dryRun) await base44.asServiceRole.entities.IngestionTask.update(task.id, { state: 'skipped' });
        report.push({ task_id: task.id, url: task.url, status: 'skipped_duplicate_hash' }); processed++; return;
      }
      if (!dryRun) {
        await base44.asServiceRole.entities.IngestionTask.update(task.id, {
          state: 'processing', attempts: (task.attempts || 0) + 1, last_attempt_date: new Date().toISOString()
        });
      }
      try {
        // EXTRACCION
        const res = await fetch(task.url, { headers: { 'User-Agent': 'IndustrialpediaIngesta/1.0 (deterministic)' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const payload = new Uint8Array(await res.arrayBuffer());
        const integrity = await validateDownloadedDocument({ bytes: payload, contentType: ct, url: task.url });
        if (!integrity.valid) {
          const reason = 'document_integrity_failed: ' + integrity.errors.join(',');
          if (!dryRun) await base44.asServiceRole.entities.IngestionTask.update(task.id, { state: 'failed', last_error: reason, checkpoint: 'document_integrity' });
          report.push({ task_id: task.id, url: task.url, status: 'quarantined', content_hash: integrity.content_hash, byte_length: integrity.byte_length, errors: integrity.errors });
          processed++; failed++;
          return;
        }
        const isPdf = integrity.detected_pdf;
        let extracted;
        if (isPdf) {
          extracted = await extractPDF(payload);
        } else {
          const raw = new TextDecoder().decode(payload);
          extracted = /<\/html>/i.test(raw) || ct.includes('html') ? extractHTML(raw) : extractPlainText(raw);
        }
        if (!extracted.extractable) throw new Error(extracted.reason || 'not extractable');

        // ESTRUCTURACION (MANUAL > INDUCIDO > GENERICO)
        const source = await getSource(task.source_id);
        const manufacturerName = manualHint || (source && source.manufacturer) || '';
        // KNOWLEDGE BUILDER: candidatos con contexto + selección por precedencia (MANUAL > INDUCIDO > directo).
        // El GENÉRICO ya NO adjudica part_number: sólo detecta candidatos; el significado lo demuestra
        // una etiqueta positiva en el documento o una grammar activa validada fuera de muestra.
        const idCandidates = extractCandidates(extracted.text, extracted.pages, extracted.blocks || [], extracted.tables || []);
        // Discovery Index: persistir candidatos encontrados aunque todavía no puedan
        // publicarse en Knowledge Core. Esto permite que BUSCAR descubra una refacción
        // antes de que Quality Gateway haya demostrado todas sus especificaciones.
        if (!dryRun && idCandidates.length) {
          const discoveryCandidates = idCandidates
            .filter((c) => /^[A-Za-z0-9][A-Za-z0-9/_.-]{1,39}$/.test(String(c.text || '').trim()));
          for (const c of discoveryCandidates) {
            const pn = String(c.text || '').trim();
            const pnNorm = normalizePartNumber(pn);
            const confidence = c.label_type === 'positive' || c.in_title || c.label_relation === 'table_header' ? 0.95 : 0.55;
            const existing = await base44.asServiceRole.entities.DiscoveryIndex.filter({
              candidate_part_number_normalized: pnNorm,
              source_url: task.url
            }, 'updated_date', 1).catch(() => []);
            const payload = {
              candidate_part_number: pn,
              candidate_part_number_normalized: pnNorm,
              manufacturer_name: manufacturerName,
              source_url: task.url,
              document_url: task.url,
              source_type: isPdf ? 'datasheet' : 'website',
              title: extracted.title || '',
              description: (extracted.title || extracted.text || '').slice(0, 240),
              search_text: [pn, manufacturerName, extracted.title || '', (extracted.text || '').slice(0, 1200)].filter(Boolean).join(' '),
              discovery_state: 'discovered',
              confidence,
              last_seen: new Date().toISOString(),
              document_id: task.document_id || ''
            };
            if (existing.length) await base44.asServiceRole.entities.DiscoveryIndex.update(existing[0].id, payload);
            else await base44.asServiceRole.entities.DiscoveryIndex.create(payload);
          }
        }
        if (!dryRun && idCandidates.length) {
          await base44.asServiceRole.entities.CandidateIdentifier.bulkCreate(
            idCandidates.slice(0, 60).map((c) => ({
              source_id: task.source_id || '', manufacturer: manufacturerName,
              crawl_document_id: task.crawl_document_id || '', url: task.url,
              candidate_text: c.text, format_sig: c.format_sig, page: c.page, line_index: c.line_index,
              label: c.label || '', label_type: c.label_type, in_title: !!c.in_title
            }))
          );
        }
        const grammar = await loadActiveGrammar(task.source_id, manufacturerName);
        const manualCandidate = manualPN
          ? idCandidates.find((c) => normalizePartNumber(c.text) === normalizePartNumber(manualPN))
          : null;
        const tableSelections = !manualPN ? selectPartNumbers(idCandidates, grammar) : [];
        const sel = manualPN
          ? (manualCandidate
            ? { value: manualPN, demonstrated: true, reason: 'manual_verified_against_document', role: 'PART_NUMBER', candidate: manualCandidate, grammar_id: '' }
            : { value: '', demonstrated: false, reason: 'manual_hint_not_found_in_document', role: 'UNKNOWN', candidate: null, grammar_id: '' })
          : (tableSelections.length ? tableSelections[0] : selectPartNumber(idCandidates, grammar));
        const partNumber = sel.value;
        const description = (extracted.title || extracted.text || '').slice(0, 240);
        const rawSpecs = isPdf
          ? extractStructuredSpecs(extracted)
          : ((extracted.specTable && extracted.specTable.length) ? extracted.specTable : extractTextSpecs(extracted.text));
        const specs = rawSpecs.filter((r) => r.attribute && r.value).map((r) => {
          const { value, unit } = splitValueUnit(r.value);
          const page = Number.isFinite(Number(r.page)) ? Number(r.page) : findPageFor(r.value, extracted.pages);
          const semantic = isTechnicalSpecification(r.attribute, r.value);
          return {
            attribute_name: r.attribute, attribute_canonical: r.attribute,
            original_value: r.value, normalized_value: value,
            original_unit: unit, normalized_unit: normalizeUnit(unit),
            page,
            evidence_text: r.attribute + ': ' + r.value,
            evidence_bbox: r.bbox || null,
            evidence_context: r.context || '',
            semantic_role: semantic.role,
            semantic_reason: semantic.reason
          };
        });

        const partCandidate = sel.candidate;
        const rec = {
          part_number: partNumber, part_number_normalized: normalizePartNumber(partNumber),
          manufacturer_name: manufacturerName, description, specs, raw_text: extracted.text,
          part_demonstration: sel.demonstrated && partCandidate
            ? {
                role: sel.role || 'PART_NUMBER',
                candidate_text: partCandidate.text,
                evidence_text: partCandidate.context_text || partCandidate.text,
                page: partCandidate.page,
                rule_id: sel.reason === 'explicit_part_number_label' ? 'PN.EXPLICIT_LABEL.v1'
                  : sel.reason === 'explicit_part_number_table_header' ? 'PN.TABLE_HEADER_BINDING.v1'
                  : sel.reason === 'active_grammar' ? 'PN.ACTIVE_GRAMMAR.v1'
                  : sel.reason === 'contextual_identity_corroborrated' ? 'PN.CONTEXTUAL_CORROBORATED.v1'
                  : sel.reason === 'manual_verified_against_document' ? 'PN.MANUAL_VERIFIED.v1'
                  : ''
              }
            : null
        };
        const gate = gatePart(rec);
        const multiPartDocument = tableSelections.length > 1;

        if (dryRun) {
          // En multi-Part, el dry-run debe validar la misma relación Part -> Specification
          // que usaría apply, pero exclusivamente en memoria. Esto permite auditar la
          // aplicabilidad real antes de cualquier escritura.
          const partPlans = multiPartDocument
            ? tableSelections.map((partSel) => ({
                selection: partSel,
                applicableSpecs: selectSpecificationsForPart(rec.specs, partSel.candidate)
              }))
            : [];
          const applicabilityMissing = partPlans.filter((p) => p.applicableSpecs.length === 0);

          processed++;
          if (multiPartDocument) {
            if (applicabilityMissing.length) incomplete++; else published++;
            report.push({
              task_id: task.id,
              url: task.url,
              status: applicabilityMissing.length ? 'multi_part_pending_applicability' : 'multi_part_ready',
              manufacturer: rec.manufacturer_name,
              extracted_spec_count: rec.specs.length,
              table_part_count: tableSelections.length,
              parts: partPlans.map((p) => ({
                part_number: p.selection.value,
                part_marking: p.selection.candidate?.part_marking || '',
                page: p.selection.candidate?.page || null,
                row_index: p.selection.candidate?.row_index ?? null,
                applicable_spec_count: p.applicableSpecs.length,
                applicable_specs: p.applicableSpecs.map((s) => ({
                  attribute_name: s.attribute_name,
                  original_value: s.original_value,
                  page: s.page || null
                }))
              })),
              missing_applicability_parts: applicabilityMissing.map((p) => p.selection.value),
              causes: applicabilityMissing.length ? ['family_part_applicability_incomplete'] : []
            });
            return;
          }

          if (gate.state === 'published') published++; else if (gate.state === 'incomplete') incomplete++; else rejected++;
          report.push({ task_id: task.id, url: task.url, status: gate.state, part_number: rec.part_number, manufacturer: rec.manufacturer_name, spec_count: rec.specs.length, table_part_count: tableSelections.length, table_parts: tableSelections.map((s) => s.value), causes: gate.causes });
          return;
        }

        if (multiPartDocument) {
          const partPlans = tableSelections.map((partSel) => ({
            selection: partSel,
            applicableSpecs: selectSpecificationsForPart(rec.specs, partSel.candidate)
          }));
          const applicabilityMissing = partPlans.filter((p) => p.applicableSpecs.length === 0);

          // No publicar parcialmente: si siquiera un Part no tiene una relación de
          // aplicabilidad demostrada, todo el documento permanece INCOMPLETE.
          if (applicabilityMissing.length) {
            const existingDoc = rebuild && task.document_id ? documentById.get(task.document_id) : null;
            const docRec = existingDoc || await base44.asServiceRole.entities.Document.create({
              title: extracted.title || task.url, file_url: task.url, content_hash: task.content_hash, document_type: 'datasheet', status: 'incomplete'
            });
            if (existingDoc) await base44.asServiceRole.entities.Document.update(existingDoc.id, {
              title: extracted.title || task.url, file_url: task.url, content_hash: task.content_hash,
              document_type: 'datasheet', status: 'incomplete'
            });
            await base44.asServiceRole.entities.Provenance.create({
              entity_type: 'document', entity_id: docRec.id, operation: 'reject', source_id: task.source_id || '',
              note: 'family_part_applicability_incomplete: no explicit part-number/version evidence for every detected Part'
            });
            for (const p of applicabilityMissing) await base44.asServiceRole.entities.Provenance.create({
              entity_type: 'candidate_part', entity_id: docRec.id, operation: 'reject', source_id: task.source_id || '',
              rule_id: 'PN.TABLE_HEADER_BINDING.v1',
              note: `candidate=${p.selection.value}; applicable_specs=0; no explicit part-number/version applicability evidence`
            });
            await base44.asServiceRole.entities.IngestionTask.update(task.id, {
              state: 'incomplete', document_id: docRec.id,
              last_error: 'family_part_applicability_incomplete'
            });
            await base44.asServiceRole.entities.CrawlDocument.update(task.crawl_document_id, { ingested: true }).catch(() => {});
            incomplete++;
            processed++;
            report.push({
              task_id: task.id, url: task.url, status: 'multi_part_pending_applicability',
              document_id: docRec.id, part_count: tableSelections.length,
              parts: partPlans.map((p) => ({ part_number: p.selection.value, applicable_spec_count: p.applicableSpecs.length, page: p.selection.candidate?.page, row_index: p.selection.candidate?.row_index }))
            });
            return;
          }

          const existingDoc = rebuild && task.document_id ? documentById.get(task.document_id) : null;
          const docRec = existingDoc || await base44.asServiceRole.entities.Document.create({
            title: extracted.title || task.url, file_url: task.url, content_hash: task.content_hash, document_type: 'datasheet', status: 'published'
          });
          if (existingDoc) await base44.asServiceRole.entities.Document.update(existingDoc.id, {
            title: extracted.title || task.url, file_url: task.url, content_hash: task.content_hash,
            document_type: 'datasheet', status: 'published'
          });
          const existingSource = existingDoc?.source_id
            ? await base44.asServiceRole.entities.Source.get(existingDoc.source_id).catch(() => null)
            : null;
          const sourceRec = existingSource || await base44.asServiceRole.entities.Source.create({
            document_id: docRec.id, url: task.url, type: 'datasheet', retrieved_date: new Date().toISOString()
          });
          if (!existingDoc?.source_id || !existingSource) await base44.asServiceRole.entities.Document.update(docRec.id, { source_id: sourceRec.id });
          const manuf = await base44.asServiceRole.entities.Manufacturer.filter({ name: rec.manufacturer_name }, 'updated_date', 1);
          const manufacturerId = manuf.length ? manuf[0].id : (await base44.asServiceRole.entities.Manufacturer.create({ name: rec.manufacturer_name, status: 'active' })).id;

                const createdParts = [];
          for (const plan of partPlans) {
            const partCandidate = plan.selection.candidate;
            const partRecData = {
              part_number: plan.selection.value,
              part_number_normalized: normalizePartNumber(plan.selection.value),
              manufacturer_name: rec.manufacturer_name,
              description,
              specs: plan.applicableSpecs,
              raw_text: extracted.text,
              part_demonstration: {
                role: 'PART_NUMBER', candidate_text: partCandidate.text,
                evidence_text: partCandidate.context_text || partCandidate.text,
                page: partCandidate.page,
                rule_id: 'PN.TABLE_HEADER_BINDING.v1'
              }
            };
            const partGate = gatePart(partRecData);
            if (partGate.state !== 'published') throw new Error(`multi_part_gate_failed:${plan.selection.value}:${partGate.causes.join('|')}`);

            const partRec = await base44.asServiceRole.entities.Part.create({
              manufacturer_id: manufacturerId, manufacturer_name: rec.manufacturer_name,
              part_number: partRecData.part_number, part_number_normalized: partRecData.part_number_normalized,
              // category is intentionally preserved from demonstrated source metadata only.
              // Never write the CrawlSource display name as a product category.
              category: '', description: partRecData.description, validation_state: 'published'
            });
            await autoTranslatePart(base44, partRec);
            const partEv = await base44.asServiceRole.entities.Evidence.create({
              document_id: docRec.id, part_id: partRec.id,
              raw_text: partCandidate.context_text || partCandidate.text,
              page: Number.isFinite(Number(partCandidate.page)) ? partCandidate.page : null,
              bbox: partCandidate.bbox || null, rule_id: 'PN.TABLE_HEADER_BINDING.v1'
            });
            await base44.asServiceRole.entities.Provenance.create({
              entity_type: 'part', entity_id: partRec.id, operation: 'extract', source_id: sourceRec.id,
              rule_id: 'PN.TABLE_HEADER_BINDING.v1', note: `orderable_part_table row=${partCandidate.row_index}; part_marking=${partCandidate.part_marking || ''}`
            });
            await base44.asServiceRole.entities.DemonstratedFact.create({
              part_id: partRec.id, document_id: docRec.id, source_id: sourceRec.id,
              value: partRecData.part_number, derivation: 'explicit_part_number_table_header',
              grammar_id: '', grammar_version: 0, evidence_id: partEv.id
            });

            let specsPublished = 0;
            for (const s of plan.applicableSpecs) {
              const sg = gateSpec(s);
              const specRec = await base44.asServiceRole.entities.Specification.create({
                part_id: partRec.id, attribute_name: s.attribute_name, attribute_canonical: s.attribute_canonical,
                original_value: s.original_value, normalized_value: s.normalized_value,
                original_unit: s.original_unit, normalized_unit: s.normalized_unit,
                source_id: sourceRec.id, validation_state: sg.state
              });
              if (!sg.pass) continue;
              const ev = await base44.asServiceRole.entities.Evidence.create({
                document_id: docRec.id, part_id: partRec.id, specification_id: specRec.id,
                raw_text: s.evidence_text, page: s.page || null, bbox: s.evidence_bbox || null,
                rule_id: 'SPEC.TECHNICAL_ATTRIBUTE_VALUE.v1'
              });
              await base44.asServiceRole.entities.Specification.update(specRec.id, { evidence_id: ev.id, validation_state: 'published' });
              await base44.asServiceRole.entities.Provenance.create({
                entity_type: 'specification', entity_id: specRec.id, operation: 'validate', source_id: sourceRec.id,
                rule_id: 'SPEC.TECHNICAL_ATTRIBUTE_VALUE.v1',
                note: 'applicability demonstrated by explicit part-number/version relation in source document'
              });
              specsPublished++;
            }
            await refreshSearchIndexForPart(base44, partRec.id);
            createdParts.push({ part_id: partRec.id, part_number: partRecData.part_number, specs_published: specsPublished });
          }

          await base44.asServiceRole.entities.IngestionTask.update(task.id, {
            state: 'published', document_id: docRec.id, part_id: createdParts[0]?.part_id || '',
            specs_published: createdParts.reduce((n, p) => n + p.specs_published, 0), last_error: ''
          });
          await base44.asServiceRole.entities.CrawlDocument.update(task.crawl_document_id, { ingested: true, state: 'ingested' }).catch(() => {});
          published++;
          processed++;
          report.push({ task_id: task.id, url: task.url, status: 'published', document_id: docRec.id, part_count: createdParts.length, parts: createdParts });
          return;
        }

        if (gate.state !== 'published') {
          if (gate.state === 'incomplete') incomplete++; else rejected++;
          const existingDoc = rebuild && task.document_id ? documentById.get(task.document_id) : null;
          const docRec = existingDoc || await base44.asServiceRole.entities.Document.create({
            title: extracted.title || task.url, file_url: task.url, content_hash: task.content_hash, document_type: 'other', status: gate.state
          });
          if (existingDoc) {
            await base44.asServiceRole.entities.Document.update(existingDoc.id, {
              title: extracted.title || task.url, file_url: task.url, content_hash: task.content_hash,
              document_type: 'other', status: gate.state
            });
          }
          await base44.asServiceRole.entities.Provenance.create({ entity_type: 'document', entity_id: docRec.id, operation: 'reject', source_id: task.source_id || '', note: 'causas: ' + gate.causes.join(', ') });
          // Observaciones pendientes: el part_number no pudo demostrarse (sin grammar activa ni etiqueta positiva).
          for (const c of idCandidates) {
            if (c.label_type === 'positive') continue;
            await base44.asServiceRole.entities.PendingObservation.create({
              document_id: docRec.id, source_id: task.source_id || '', manufacturer: manufacturerName,
              candidate_text: c.text, page: c.page, line_index: c.line_index,
              label: c.label || '', label_type: c.label_type, grammar_id: sel.grammar_id || '',
              missing_link: c.label_type === 'negative' ? 'etiqueta negativa (no part_number)' : 'sin etiqueta positiva ni grammar activa'
            });
          }
          await base44.asServiceRole.entities.IngestionTask.update(task.id, { state: gate.state, document_id: docRec.id, last_error: gate.causes.join(', ') });
          await base44.asServiceRole.entities.CrawlDocument.update(task.crawl_document_id, { ingested: true }).catch(() => {});
          report.push({ task_id: task.id, url: task.url, status: gate.state, causes: gate.causes });
          return;
        }

        // PUBLICACION en Knowledge Core (cadena PART->SPEC->PROVENANCE->EVIDENCE->DOCUMENT->SOURCE)
        const existingDoc = rebuild && task.document_id ? documentById.get(task.document_id) : null;
        const docRec = existingDoc || await base44.asServiceRole.entities.Document.create({
          title: extracted.title || task.url, file_url: task.url, content_hash: task.content_hash, document_type: 'datasheet', status: 'published'
        });
        if (existingDoc) {
          await base44.asServiceRole.entities.Document.update(existingDoc.id, {
            title: extracted.title || task.url, file_url: task.url, content_hash: task.content_hash,
            document_type: 'datasheet', status: 'published'
          });
        }
        const existingSource = existingDoc?.source_id
          ? await base44.asServiceRole.entities.Source.get(existingDoc.source_id).catch(() => null)
          : null;
        const sourceRec = existingSource || await base44.asServiceRole.entities.Source.create({
          document_id: docRec.id, url: task.url, type: 'datasheet', retrieved_date: new Date().toISOString()
        });
        if (!existingDoc?.source_id || !existingSource) {
          await base44.asServiceRole.entities.Document.update(docRec.id, { source_id: sourceRec.id });
        }
        let manufacturerId = '';
        const manuf = await base44.asServiceRole.entities.Manufacturer.filter({ name: rec.manufacturer_name }, 'updated_date', 1);
        manufacturerId = manuf.length ? manuf[0].id : (await base44.asServiceRole.entities.Manufacturer.create({ name: rec.manufacturer_name, status: 'active' })).id;

        const partRec = await base44.asServiceRole.entities.Part.create({
          manufacturer_id: manufacturerId, manufacturer_name: rec.manufacturer_name,
          part_number: rec.part_number, part_number_normalized: rec.part_number_normalized,
          // category is intentionally blank here: CrawlSource.name is a source identity,
          // not demonstrated product taxonomy. Canonical classification remains downstream/shadow.
          category: '', description: rec.description, validation_state: 'published'
        });
        await autoTranslatePart(base44, partRec);
        const partEv = await base44.asServiceRole.entities.Evidence.create({
          document_id: docRec.id,
          part_id: partRec.id,
          raw_text: partCandidate?.context_text || rec.raw_text.slice(0, 8000),
          page: Number.isFinite(Number(partCandidate?.page)) ? partCandidate.page : null,
          bbox: partCandidate?.bbox || null,
          rule_id: sel.reason === 'explicit_part_number_label' ? 'PN.EXPLICIT_LABEL.v1'
            : sel.reason === 'explicit_part_number_table_header' ? 'PN.TABLE_HEADER_BINDING.v1'
            : sel.reason === 'active_grammar' ? 'PN.ACTIVE_GRAMMAR.v1'
            : sel.reason === 'contextual_identity_corroborrated' ? 'PN.CONTEXTUAL_CORROBORATED.v1'
            : sel.reason === 'manual_verified_against_document' ? 'PN.MANUAL_VERIFIED.v1' : ''
        });
        await base44.asServiceRole.entities.Provenance.create({ entity_type: 'part', entity_id: partRec.id, operation: 'extract', source_id: sourceRec.id, rule_id: 'extract.' + (isPdf ? 'pdf' : 'html'), note: 'ingesta deterministica batch' });
        // DemonstratedFact: el part_number fue demostrado (etiqueta directa, grammar activa o MANUAL).
        if (sel.demonstrated) {
          await base44.asServiceRole.entities.DemonstratedFact.create({
            part_id: partRec.id, document_id: docRec.id, source_id: sourceRec.id,
            value: rec.part_number, derivation: sel.reason,
            grammar_id: sel.grammar_id || '', grammar_version: (grammar && grammar.version) ? grammar.version : 0,
            evidence_id: partEv.id
          });
        }

        let specsPublished = 0;
        for (const s of rec.specs) {
          const sg = gateSpec(s);
          const specRec = await base44.asServiceRole.entities.Specification.create({
            part_id: partRec.id, attribute_name: s.attribute_name, attribute_canonical: s.attribute_canonical,
            original_value: s.original_value, normalized_value: s.normalized_value,
            original_unit: s.original_unit, normalized_unit: s.normalized_unit,
            source_id: sourceRec.id, validation_state: sg.state
          });
          if (sg.pass) {
            const ev = await base44.asServiceRole.entities.Evidence.create({
              document_id: docRec.id,
              part_id: partRec.id,
              specification_id: specRec.id,
              raw_text: s.evidence_text,
              page: s.page || null,
              bbox: s.evidence_bbox || null,
              rule_id: 'SPEC.TECHNICAL_ATTRIBUTE_VALUE.v1'
            });
            await base44.asServiceRole.entities.Specification.update(specRec.id, { evidence_id: ev.id, validation_state: 'published' });
            await base44.asServiceRole.entities.Provenance.create({ entity_type: 'specification', entity_id: specRec.id, operation: 'validate', source_id: sourceRec.id, rule_id: 'SPEC.TECHNICAL_ATTRIBUTE_VALUE.v1', note: 'resolucion semantica deterministica + normalizacion de valor/unidad' });
            specsPublished++;
          }
        }
        await refreshSearchIndexForPart(base44, partRec.id);
        await base44.asServiceRole.entities.IngestionTask.update(task.id, { state: 'published', document_id: docRec.id, part_id: partRec.id, specs_published: specsPublished, last_error: '' });
        await base44.asServiceRole.entities.CrawlDocument.update(task.crawl_document_id, { ingested: true, state: 'ingested' }).catch(() => {});
        published++; processed++;
        report.push({ task_id: task.id, url: task.url, status: 'published', document_id: docRec.id, part_id: partRec.id, manufacturer_id: manufacturerId, part_number: rec.part_number, derivation: sel.reason, specs_published: specsPublished, evidence_id: partEv.id });
      } catch (e) {
        // FALLO AISLADO: registrar error, incrementar retry; FAILED al agotar intentos.
        const attempts = (task.attempts || 0) + 1;
        const isFailed = attempts >= maxAttempts;
        if (isFailed) failed++; else retries++;
        if (!dryRun) {
          await base44.asServiceRole.entities.IngestionTask.update(task.id, {
            state: isFailed ? 'failed' : 'queued', attempts, last_error: (e && e.message) || String(e),
            checkpoint: 'fetch/extract'
          });
        }
        report.push({ task_id: task.id, url: task.url, status: isFailed ? 'failed' : 'retry', attempts, error: (e && e.message) || String(e) });
        processed++;
      }
    }

    await pool(eligible, concurrency, processTask);

    const metrics = {
      total: eligible.length, processed, published, incomplete, rejected, failed, retries,
      time_ms: Date.now() - t0,
      pending: candidates.filter((t) => t.state === 'queued').length
    };
    return Response.json({ mode: dryRun ? 'dry_run' : 'publish', enqueued, selected: eligible.length, metrics, report });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}