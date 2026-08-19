import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { extractPDF, extractStructuredSpecs } from '../../shared/pdfExtract.js';
import { extractHTML, extractPlainText, extractTextSpecs, findPageFor } from '../../shared/extract.js';
import { extractCandidates, selectPartNumber } from '../../shared/knowledgeBuilder.js';
import { normalizePartNumber, normalizeUnit, splitValueUnit } from '../../shared/normalize.js';
import { gatePart, gateSpec } from '../../shared/qualityGateway.js';
import { isTechnicalSpecification } from '../../shared/semanticResolver.js';

function manufacturerFrom(discovery, query, url, title, knownManufacturers = []) {
  if (discovery.manufacturer_name) return discovery.manufacturer_name;
  const corpus = `${title || ''} ${url || ''}`.toLowerCase();

  // Primero usamos una marca conocida explícitamente demostrada por la fuente.
  const known = knownManufacturers
    .filter((m) => m && String(m).name)
    .sort((a, b) => String(b.name).length - String(a.name).length)
    .find((m) => corpus.includes(String(m.name).toLowerCase()));
  if (known) return known.name;

  // Solo una fuente oficial puede demostrar fabricante por su propio dominio.
  // En un distribuidor NO usamos el dominio del distribuidor como fabricante.
  if (discovery.source_trust === 'official') {
    try {
      const host = new URL(url).hostname.replace(/^www\./i, '');
      const stem = host.split('.')[0].replace(/[-_]+/g, ' ').trim();
      if (stem && !['www','docs','support','download','catalog'].includes(stem.toLowerCase())) {
        return stem.split(/\s+/).map((x) => x ? x[0].toUpperCase() + x.slice(1) : x).join(' ');
      }
    } catch {}
  }
  return '';
}

async function refreshIndex(base44, partId) {
  const part = await base44.asServiceRole.entities.Part.get(partId);
  const specs = await base44.asServiceRole.entities.Specification.filter({ part_id: partId }, '-updated_date', 2000).catch(() => []);
  const evidence = await base44.asServiceRole.entities.Evidence.filter({ part_id: partId }, '-updated_date', 2000).catch(() => []);
  const specText = specs.map((s) => [s.attribute_canonical || s.attribute_name || '', s.normalized_value || s.original_value || '', s.normalized_unit || s.original_unit || ''].join(' ')).join(' | ');
  const searchText = [part.part_number, part.part_number_normalized, part.manufacturer_name, part.category, part.description, specText].filter(Boolean).join(' ');
  const payload = { part_id: part.id, part_number: part.part_number || '', part_number_normalized: part.part_number_normalized || '', manufacturer_name: part.manufacturer_name || '', category: part.category || '', description: part.description || '', search_text: searchText, spec_text: specText, validation_state: part.validation_state || 'published', evidence_count: evidence.length, source_count: new Set(specs.map((s) => s.source_id).filter(Boolean)).size, spec_count: specs.length };
  const existing = await base44.asServiceRole.entities.SearchIndex.filter({ part_id: partId }, 'updated_date', 1).catch(() => []);
  if (existing.length) await base44.asServiceRole.entities.SearchIndex.update(existing[0].id, payload);
  else await base44.asServiceRole.entities.SearchIndex.create(payload);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const discoveryId = String(body.discovery_id || '');
    const query = String(body.query || '').trim();
    if (!discoveryId) return Response.json({ error: 'discovery_id required' }, { status: 400 });

    const discovery = await base44.asServiceRole.entities.DiscoveryIndex.get(discoveryId);
    if (!discovery) return Response.json({ error: 'discovery not found' }, { status: 404 });
    if (discovery.part_id) return Response.json({ status: 'already_materialized', part_id: discovery.part_id });
    if (!discovery.source_url) return Response.json({ status: 'no_source_url' });

    const existingByUrl = await base44.asServiceRole.entities.Source.filter({ url: discovery.source_url }, '-updated_date', 1).catch(() => []);
    if (existingByUrl.length) {
      const docs = await base44.asServiceRole.entities.Document.filter({ source_id: existingByUrl[0].id }, '-updated_date', 1).catch(() => []);
      const parts = docs.length ? await base44.asServiceRole.entities.Part.filter({ part_number_normalized: discovery.candidate_part_number_normalized }, '-updated_date', 1).catch(() => []) : [];
      if (parts.length) {
        await base44.asServiceRole.entities.DiscoveryIndex.update(discoveryId, { part_id: parts[0].id, document_id: docs[0]?.id || '' });
        return Response.json({ status: 'already_materialized', part_id: parts[0].id, document_id: docs[0]?.id || '' });
      }
    }

    const res = await fetch(discovery.source_url, { redirect: 'follow', headers: { 'User-Agent': 'Industrialpedia/1.0 deterministic product ingestion', 'Accept': 'application/pdf,text/html,*/*' } });
    if (!res.ok) throw new Error(`source_http_${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isPdf = ct.includes('pdf') || /\.pdf(?:$|[?#])/i.test(discovery.source_url);
    let extracted;
    if (isPdf) extracted = await extractPDF(bytes);
    else {
      const raw = new TextDecoder().decode(bytes);
      extracted = ct.includes('html') || /<html/i.test(raw) ? extractHTML(raw) : extractPlainText(raw);
    }
    if (!extracted?.extractable) throw new Error(extracted?.reason || 'source_not_extractable');

    const candidates = extractCandidates(extracted.text, extracted.pages || [], extracted.blocks || [], extracted.tables || []);
    let selected = null;
    if (discovery.candidate_part_number_normalized) {
      selected = candidates.find((c) => normalizePartNumber(c.text) === discovery.candidate_part_number_normalized) || null;
    }
    if (!selected) {
      const sel = selectPartNumber(candidates, null);
      if (sel.demonstrated) selected = sel.candidate;
    }
    // Para una búsqueda exacta de Part Number, la propia consulta puede demostrar
    // identidad únicamente si la fuente encontrada contiene ese PN de forma literal.
    // Esto evita rechazar páginas de producto cuyo extractor HTML no haya creado
    // un candidato estructurado, sin adjudicar un PN diferente por frecuencia.
    if (!selected && discovery.candidate_part_number_normalized) {
      const wanted = normalizePartNumber(discovery.candidate_part_number_normalized);
      const corpus = `${extracted.title || ''} ${extracted.text || ''}`;
      if (normalizePartNumber(corpus).includes(wanted)) {
        selected = {
          text: discovery.candidate_part_number || query,
          context_text: extracted.title || query,
          page: 1,
          bbox: null,
          label_relation: 'source_literal'
        };
      }
    }
    if (!selected) throw new Error('part_number_not_demonstrated_in_source');

    const partNumber = selected.text.trim();
    const knownManufacturers = await base44.asServiceRole.entities.Manufacturer.list('-updated_date', 1000).catch(() => []);
    const manufacturer = manufacturerFrom(discovery, query, discovery.source_url, extracted.title || discovery.title, knownManufacturers);
    if (!manufacturer) throw new Error('manufacturer_not_demonstrated');

    const rawSpecs = isPdf
      ? extractStructuredSpecs(extracted)
      : ((extracted.specTable && extracted.specTable.length) ? extracted.specTable : extractTextSpecs(extracted.text));
    const specs = rawSpecs.filter((r) => r.attribute && r.value).map((r) => {
      const { value, unit } = splitValueUnit(r.value);
      const page = Number.isFinite(Number(r.page)) ? Number(r.page) : findPageFor(r.value, extracted.pages || []);
      const semantic = isTechnicalSpecification(r.attribute, r.value);
      return { attribute_name: r.attribute, attribute_canonical: r.attribute, original_value: r.value, normalized_value: value, original_unit: unit, normalized_unit: normalizeUnit(unit), page, evidence_text: `${r.attribute}: ${r.value}`, evidence_bbox: r.bbox || null, semantic_role: semantic.role, semantic_reason: semantic.reason };
    });

    const rec = { part_number: partNumber, part_number_normalized: normalizePartNumber(partNumber), manufacturer_name: manufacturer, description: (extracted.title || extracted.text || '').slice(0, 500), specs };
    const pg = gatePart(rec);
    if (pg.state === 'rejected') throw new Error(`part_quality_rejected:${(pg.causes || []).join('|')}`);

    let manufacturerId = '';
    const manufacturers = await base44.asServiceRole.entities.Manufacturer.filter({ name: manufacturer }, 'updated_date', 1).catch(() => []);
    manufacturerId = manufacturers.length ? manufacturers[0].id : (await base44.asServiceRole.entities.Manufacturer.create({ name: manufacturer, website: (() => { try { return new URL(discovery.source_url).origin; } catch { return ''; } })(), status: 'active' })).id;

    const documentRec = await base44.asServiceRole.entities.Document.create({ title: extracted.title || discovery.title || partNumber, file_url: discovery.source_url, document_type: isPdf ? 'datasheet' : 'other', status: 'published' });
    const sourceRec = await base44.asServiceRole.entities.Source.create({ document_id: documentRec.id, url: discovery.source_url, type: isPdf ? 'datasheet' : 'website', retrieved_date: new Date().toISOString() });
    await base44.asServiceRole.entities.Document.update(documentRec.id, { source_id: sourceRec.id });

    const partRec = await base44.asServiceRole.entities.Part.create({ manufacturer_id: manufacturerId, manufacturer_name: manufacturer, part_number: rec.part_number, part_number_normalized: rec.part_number_normalized, category: '', description: rec.description, validation_state: 'published' });
    const partEvidence = await base44.asServiceRole.entities.Evidence.create({ document_id: documentRec.id, part_id: partRec.id, raw_text: selected.context_text || selected.text, page: Number.isFinite(Number(selected.page)) ? selected.page : null, bbox: selected.bbox || null, rule_id: selected.label_relation === 'table_header' ? 'PN.TABLE_HEADER_BINDING.v1' : 'PN.EXPLICIT_SOURCE.v1' });
    await base44.asServiceRole.entities.DemonstratedFact.create({ part_id: partRec.id, document_id: documentRec.id, source_id: sourceRec.id, value: rec.part_number, derivation: selected.label_relation === 'table_header' ? 'explicit_part_number_table_header' : 'explicit_source_candidate', grammar_id: '', grammar_version: 0, evidence_id: partEvidence.id });
    await base44.asServiceRole.entities.Provenance.create({ entity_type: 'part', entity_id: partRec.id, operation: 'extract', source_id: sourceRec.id, rule_id: selected.label_relation === 'table_header' ? 'PN.TABLE_HEADER_BINDING.v1' : 'PN.EXPLICIT_SOURCE.v1', note: 'materialized from discovered source; deterministic extraction' });

    let publishedSpecs = 0;
    for (const s of specs) {
      const sg = gateSpec(s);
      const specRec = await base44.asServiceRole.entities.Specification.create({ part_id: partRec.id, attribute_name: s.attribute_name, attribute_canonical: s.attribute_canonical, original_value: s.original_value, normalized_value: s.normalized_value, original_unit: s.original_unit, normalized_unit: s.normalized_unit, source_id: sourceRec.id, validation_state: sg.state });
      if (!sg.pass) continue;
      const ev = await base44.asServiceRole.entities.Evidence.create({ document_id: documentRec.id, part_id: partRec.id, specification_id: specRec.id, raw_text: s.evidence_text, page: s.page || null, bbox: s.evidence_bbox || null, rule_id: 'SPEC.TECHNICAL_ATTRIBUTE_VALUE.v1' });
      await base44.asServiceRole.entities.Specification.update(specRec.id, { evidence_id: ev.id, validation_state: 'published' });
      await base44.asServiceRole.entities.Provenance.create({ entity_type: 'specification', entity_id: specRec.id, operation: 'validate', source_id: sourceRec.id, rule_id: 'SPEC.TECHNICAL_ATTRIBUTE_VALUE.v1', note: 'deterministic extraction from discovered source' });
      publishedSpecs++;
    }

    await refreshIndex(base44, partRec.id);
    await base44.asServiceRole.entities.DiscoveryIndex.update(discoveryId, { candidate_part_number: rec.part_number, candidate_part_number_normalized: rec.part_number_normalized, manufacturer_name: manufacturer, part_id: partRec.id, document_id: documentRec.id, discovery_state: 'verified', last_seen: new Date().toISOString() });
    return Response.json({ status: 'materialized', part_id: partRec.id, document_id: documentRec.id, part_number: rec.part_number, manufacturer, spec_count: publishedSpecs });
  } catch (error) {
    return Response.json({ status: 'failed', error: error?.message || String(error) }, { status: 422 });
  }
}