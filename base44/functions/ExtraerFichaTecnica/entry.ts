import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { waitUntil } from 'base44:runtime';
import { extractPDF, extractStructuredSpecs } from '../../shared/pdfExtract.js';
import { extractHTML, extractPlainText, extractTextSpecs, findPageFor } from '../../shared/extract.js';
import { extractCandidates, selectPartNumber } from '../../shared/knowledgeBuilder.js';
import { normalizePartNumber, normalizeUnit, splitValueUnit } from '../../shared/normalize.js';
import { isTechnicalSpecification } from '../../shared/semanticResolver.js';
import { detectComponentType, groupSpecsByTemplate } from '../../shared/fichaTemplates.js';
import { gateSpec } from '../../shared/qualityGateway.js';

// EXTRAER FICHA TÉCNICA — construye la ficha Industrialpedia directamente desde
// una fuente encontrada por Google (página oficial, distribuidor o datasheet PDF).
// NO inventa especificaciones: extrae datos técnicos reales con evidencia.
// Devuelve la ficha inmediatamente; la alimentación del Knowledge Core ocurre
// de forma asíncrona (waitUntil) para no bloquear al usuario.
//
// Contrato:
// { url, query, manufacturer_hint?, part_number_hint? }
// Devuelve la ficha con specs [{attribute, value, unit, evidence, verified}]

const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'IndustrialpediaFicha/1.0 (deterministic technical extraction)', 'Accept': 'application/pdf,text/html,*/*' }
    });
  } finally { clearTimeout(timer); }
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function safeText(s: string, max = 500) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function feedKnowledgeCore(base44: any, ficha: any, url: string, isPdf: boolean) {
  try {
    const pn = ficha.part_number;
    const pnNorm = normalizePartNumber(pn);
    if (!pn) return { queued: false, reason: 'no_part_number' };

    // CatalogProduct: capa de catálogo propia. Idempotente por product_url + PN.
    const existingCatalog = await base44.asServiceRole.entities.CatalogProduct.filter(
      { part_number_normalized: pnNorm, product_url: url }, 'updated_date', 1
    ).catch(() => []);
    // CatalogProduct consume únicamente contenido que haya pasado el Quality Gateway.
    // Nunca materializar el texto crudo del PDF en description/search_text.
    const catalogSpecs = Array.isArray(ficha.specs) ? ficha.specs.filter((s: any) => gateSpec(s).pass) : [];
    const catalogDescription = safeText(ficha.product_name || pn, 1000);
    const catalogPayload = {
      manufacturer_name: ficha.manufacturer_name || '',
      part_number: pn,
      part_number_normalized: pnNorm,
      name: ficha.product_name || pn,
      description: catalogDescription,
      image_url: ficha.image_url || '',
      product_url: url,
      datasheet_url: isPdf ? url : '',
      source_type: ficha.source_type === 'official' ? 'official' : 'distributor',
      source_domain: hostOf(url),
      source_provider: 'google',
      catalog_state: 'identified',
      search_text: [pn, ficha.manufacturer_name, ficha.product_name, catalogSpecs.map((s: any) => `${s.attribute} ${s.original_value}`).join(' ')].filter(Boolean).join(' '),
      last_seen: new Date().toISOString()
    };
    let catalogId = '';
    if (existingCatalog.length) {
      await base44.asServiceRole.entities.CatalogProduct.update(existingCatalog[0].id, catalogPayload);
      catalogId = existingCatalog[0].id;
    } else {
      const created = await base44.asServiceRole.entities.CatalogProduct.create(catalogPayload);
      catalogId = created.id;
    }

    // DiscoveryIndex: índice de descubrimiento. Idempotente por candidate PN + source_url.
    const existingDiscovery = await base44.asServiceRole.entities.DiscoveryIndex.filter(
      { candidate_part_number_normalized: pnNorm, source_url: url }, 'updated_date', 1
    ).catch(() => []);
    const discoveryPayload = {
      candidate_part_number: pn,
      candidate_part_number_normalized: pnNorm,
      manufacturer_name: ficha.manufacturer_name || '',
      source_url: url,
      document_url: url,
      source_type: isPdf ? 'datasheet' : 'website',
      title: ficha.product_name || '',
      description: safeText(ficha.description, 500),
      discovery_state: 'discovered',
      confidence: 0.6,
      last_seen: new Date().toISOString(),
      part_id: existingCatalog[0]?.part_id || ''
    };
    let discoveryId = '';
    if (existingDiscovery.length) {
      await base44.asServiceRole.entities.DiscoveryIndex.update(existingDiscovery[0].id, discoveryPayload);
      discoveryId = existingDiscovery[0].id;
    } else {
      const d = await base44.asServiceRole.entities.DiscoveryIndex.create(discoveryPayload);
      discoveryId = d.id;
    }
    if (catalogId && discoveryId) {
      await base44.asServiceRole.entities.CatalogProduct.update(catalogId, { discovery_id: discoveryId }).catch(() => {});
    }
    return { queued: true, catalog_id: catalogId, discovery_id: discoveryId };
  } catch (e) {
    return { queued: false, reason: String(e?.message || e) };
  }
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const url = String(body.url || '').trim();
    const query = String(body.query || '').trim();
    const manufacturerHint = String(body.manufacturer_hint || '').trim();
    const partNumberHint = String(body.part_number_hint || '').trim();
    if (!url) return Response.json({ error: 'url required' }, { status: 400 });

    // 1) Adquisición de la fuente.
    const res = await fetchWithTimeout(url);
    if (!res.ok) return Response.json({ found: false, error: `source_http_${res.status}`, url }, { status: 502 });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isPdf = ct.includes('pdf') || /\.pdf(?:$|[?#])/i.test(url);

    // 2) Extracción determinística (mismo pipeline que IngerirCrawl).
    let extracted: any;
    try {
      if (isPdf) extracted = await extractPDF(bytes);
      else {
        const raw = new TextDecoder().decode(bytes);
        extracted = /<\/html>/i.test(raw) || ct.includes('html') ? extractHTML(raw) : extractPlainText(raw);
      }
    } catch (e) {
      return Response.json({ found: false, error: `extraction_failed: ${e?.message || e}`, url }, { status: 422 });
    }
    if (!extracted?.extractable) return Response.json({ found: false, error: extracted?.reason || 'source_not_extractable', url }, { status: 422 });

    // 3) Part Number: pista manual > candidatos estructurados > literal en la fuente.
    const candidates = extractCandidates(extracted.text, extracted.pages || [], extracted.blocks || [], extracted.tables || []);
    let selectedCandidate: any = null;
    let partNumber = '';
    let derivation = '';
    if (partNumberHint) {
      const manual = candidates.find((c: any) => normalizePartNumber(c.text) === normalizePartNumber(partNumberHint));
      if (manual) {
        selectedCandidate = manual;
        partNumber = partNumberHint;
        derivation = 'manual_verified_against_document';
      } else if (normalizePartNumber(extracted.text).includes(normalizePartNumber(partNumberHint))) {
        partNumber = partNumberHint;
        derivation = 'manual_hint_literal_in_source';
      }
    }
    if (!partNumber) {
      const sel = selectPartNumber(candidates, null);
      if (sel.demonstrated && sel.candidate) {
        selectedCandidate = sel.candidate;
        partNumber = sel.value;
        derivation = sel.reason;
      }
    }
    if (!partNumber && query && normalizePartNumber(extracted.text).includes(normalizePartNumber(query)) && /[\d]/.test(query) && /[A-Za-z]/.test(query)) {
      partNumber = query;
      derivation = 'query_literal_in_source';
    }

    // 4) Especificaciones técnicas con evidencia.
    const rawSpecs = isPdf
      ? extractStructuredSpecs(extracted)
      : ((extracted.specTable && extracted.specTable.length) ? extracted.specTable : extractTextSpecs(extracted.text));
    const consultationDate = new Date().toISOString();
    const specs = rawSpecs.filter((r: any) => r.attribute && r.value).map((r: any) => {
      const { value, unit } = splitValueUnit(r.value);
      const page = Number.isFinite(Number(r.page)) ? Number(r.page) : findPageFor(r.value, extracted.pages || []);
      const semantic = isTechnicalSpecification(r.attribute, r.value);
      return {
        attribute_name: safeText(r.attribute, 100),
        attribute: safeText(r.attribute, 100),
        original_value: safeText(r.value, 120),
        normalized_value: value,
        original_unit: unit,
        normalized_unit: normalizeUnit(unit),
        page: page || null,
        evidence_text: `${r.attribute}: ${r.value}`,
        semantic_role: semantic.role,
        evidence: {
          source_url: url,
          page: page || null,
          raw_text: safeText(`${r.attribute}: ${r.value}`, 200),
          consultation_date: consultationDate,
          document_type: isPdf ? 'datasheet' : 'website'
        },
        verified: false
      };
    });

    // 5) Fabricante: pista manual > marca de la consulta > derivación de dominio (solo si official).
    const host = hostOf(url);
    let manufacturer = manufacturerHint;
    if (!manufacturer) {
      const brandTokens = String(query || '').split(/\s+/).filter((t) => t.length >= 3 && /[a-z]/i.test(t) && !/^\d/.test(t));
      const qBrand = brandTokens.find((t) => safeText(`${extracted.title || ''} ${extracted.text || ''}`, 2000).toLowerCase().includes(t.toLowerCase()));
      if (qBrand) manufacturer = qBrand;
    }
    if (!manufacturer && extracted.title) {
      // Último recurso: si la fuente es oficial, el dominio demuestra el fabricante.
      const stem = host.split('.')[0];
      if (stem && !['www', 'docs', 'support', 'download', 'catalog', 'shop'].includes(stem.toLowerCase())) {
        manufacturer = stem.charAt(0).toUpperCase() + stem.slice(1);
      }
    }

    // 6) Chequeo Knowledge Core: ¿esta pieza ya está verificada en nuestra base?
    let kcPartId: string | null = null;
    let kcVerifiedSpecs: any[] = [];
    if (partNumber) {
      try {
        const parts = await base44.asServiceRole.entities.Part.filter(
          { part_number_normalized: normalizePartNumber(partNumber) },
          '-updated_date', 1
        );
        if (parts.length) {
          kcPartId = parts[0].id;
          const kcSpecs = await base44.asServiceRole.entities.Specification.filter({ part_id: kcPartId }, '-updated_date', 500);
          kcVerifiedSpecs = kcSpecs
            .filter((s: any) => s.validation_state === 'published' || s.validation_state === 'validated')
            .map((s: any) => ({
              attribute_name: s.attribute_name,
              attribute: s.attribute_name,
              original_value: s.original_value,
              normalized_value: s.normalized_value,
              original_unit: s.original_unit,
              normalized_unit: s.normalized_unit,
              verified: true,
              evidence: { knowledge_core_part_id: kcPartId, source_id: s.source_id }
            }));
        }
      } catch { /* KC queda como secundario */ }
    }

    // 7) Tipo de componente + agrupación por plantilla.
    const typeCorpus = `${extracted.title || ''} ${partNumber} ${manufacturer} ${specs.map((s) => s.attribute_name).join(' ')}`;
    const template = detectComponentType(typeCorpus);
    const { grouped, others } = groupSpecsByTemplate(specs, template);

    // 8) Imagen: si no vino en la ficha, intentar og:image del HTML.
    let imageUrl = '';
    if (!isPdf) {
      const raw = new TextDecoder().decode(bytes.slice(0, 50000));
      const m = raw.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || raw.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (m) imageUrl = m[1];
    }

    const ficha = {
      found: true,
      source: {
        url,
        domain: host,
        source_type: body.source_type || 'cse_configured',
        is_pdf: isPdf,
        title: safeText(extracted.title, 300),
        retrieved_date: consultationDate
      },
      part_number: partNumber,
      part_number_normalized: partNumber ? normalizePartNumber(partNumber) : '',
      manufacturer_name: manufacturer,
      product_name: safeText(extracted.title, 300) || partNumber,
      description: safeText(extracted.text, 800),
      image_url: imageUrl,
      component_type: template.type,
      component_type_label: template.label,
      specs,
      specs_grouped: grouped,
      specs_other: others,
      part_derivation: derivation,
      already_in_knowledge_core: Boolean(kcPartId),
      knowledge_core_part_id: kcPartId,
      knowledge_core_verified_specs: kcVerifiedSpecs,
      evidence_note: kcVerifiedSpecs.length
        ? 'Algunas especificaciones ya están verificadas en Knowledge Core; el resto fueron encontradas en la fuente y aún no están verificadas.'
        : 'Todos los datos mostrados fueron encontrados en la fuente. Aún no están verificados en Knowledge Core.'
    };

    // 9) Alimentación asíncrona del Knowledge Core (no bloquea la respuesta).
    waitUntil(feedKnowledgeCore(base44, ficha, url, isPdf));

    return Response.json(ficha);
  } catch (error) {
    return Response.json({ found: false, error: error?.message || String(error) }, { status: 500 });
  }
}