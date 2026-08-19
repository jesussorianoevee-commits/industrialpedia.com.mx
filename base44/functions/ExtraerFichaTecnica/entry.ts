import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { waitUntil, secrets } from 'base44:runtime';
import { extractPDF, extractStructuredSpecs } from '../../shared/pdfExtract.js';
import { extractAdjacentSpecs, extractCompactSpecs, extractHTML, extractPlainText, extractTextSpecs, extractValueFirstSpecs, findPageFor, isUsableExternalImageUrl, sanitizeExtractedPair, stripMarkdownNoise } from '../../shared/extract.js';
import { extractCandidates, selectPartNumber } from '../../shared/knowledgeBuilder.js';
import { normalizePartNumber, normalizeUnit, splitValueUnit } from '../../shared/normalize.js';
import { isTechnicalSpecification } from '../../shared/semanticResolver.js';
import { detectComponentType, groupSpecsByTemplate } from '../../shared/fichaTemplates.js';
import { gateSpec } from '../../shared/qualityGateway.js';
import { deriveProductIdentity } from '../../shared/productIdentity.js';
import { selectBestImage } from '../../shared/imageResolver.js';

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

// Fusión determinística de contenido secundario (Tavily raw_content / Extract).
// Sólo alimenta candidatos; el Semantic Resolver + Quality Gateway siguen decidiendo.
function mergeFallbackContent(extracted: any, content: string) {
  const fallback = extractPlainText(content);
  if (!fallback?.text) return;
  if (fallback.text.length > (extracted.text || '').length) extracted.text = fallback.text;
  if (fallback.specTable?.length) {
    const merged = [...(extracted.specTable || []), ...fallback.specTable];
    const seen = new Set();
    extracted.specTable = merged.filter((s: any) => {
      const key = `${String(s.attribute || '').trim().toLowerCase()}|${String(s.value || '').trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// Tavily Extract: adquisición de contenido renderizado (bypassa shells/SPA y
// bloqueos de bots). Devuelve el contenido textual de la URL, o '' si no disponible.
async function tavilyExtractContent(url: string): Promise<string> {
  const apiKey = String(secrets.get('Apy_Tavly') || '').trim().replace(/^["']|["']$/g, '').trim();
  if (!apiKey) return '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ urls: url, extract_depth: 'advanced', format: 'markdown', timeout: 20 }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const hit = results.find((r: any) => r && (r.raw_content || r.content || r.text)) || null;
    return String(hit?.raw_content || hit?.content || hit?.text || '');
  } catch { return ''; }
}

// Construye specs a partir de un objeto extracted, aplicando Semantic Resolver +
// Quality Gateway. Reutilizable para la extracción inicial y el fallback.
function buildSpecs(extracted: any, isPdf: boolean, url: string, consultationDate: string) {
  const rawSpecs = isPdf
    ? extractStructuredSpecs(extracted)
    : [
        ...(Array.isArray(extracted.specTable) ? extracted.specTable : []),
        ...extractAdjacentSpecs(extracted.text),
        ...extractTextSpecs(extracted.text),
        ...extractCompactSpecs(`${extracted.title || ''} ${extracted.text || ''}`),
        ...extractValueFirstSpecs(`${extracted.title || ''} ${extracted.text || ''}`)
      ]
        // Frontera única de calidad: normaliza/rechaza Markdown, URLs, assets,
        // navegación y código ANTES del Semantic Resolver. Esto evita que una
        // imagen como "![APC logo](//.../logo.svg)" se fragmente en atributo/valor
        // y llegue a la ficha como si fuera una especificación técnica.
        .map((r: any) => {
          const clean = sanitizeExtractedPair(r.attribute, r.value);
          return clean ? { ...r, attribute: clean.attribute, value: clean.value } : null;
        })
        .filter(Boolean)
        .filter((r: any, i: number, arr: any[]) => {
          const key = `${String(r.attribute || '').trim().toLowerCase()}|${String(r.value || '').trim().toLowerCase()}`;
          return arr.findIndex((x: any) => `${String(x.attribute || '').trim().toLowerCase()}|${String(x.value || '').trim().toLowerCase()}` === key) === i;
        });
  return rawSpecs.filter((r: any) => r.attribute && r.value).map((r: any) => {
    const { value, unit } = splitValueUnit(r.value);
    const page = Number.isFinite(Number(r.page)) ? Number(r.page) : findPageFor(r.value, extracted.pages || []);
    const semantic = isTechnicalSpecification(r.attribute, r.value);
    const builtSpec = {
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
    return { ...builtSpec, gate_passed: gateSpec(builtSpec).pass };
  });
}

// Piso determinístico de datos básicos: si la extracción completa no logra
// especificaciones aceptadas por el Quality Gateway (páginas SPA, shells, PDFs
// no parseables), la ficha aún muestra los datos técnicos mínimos encontrados en
// el contenido de la fuente. Así cualquier refacción buscada tiene su ficha.
const BASIC_BLOCK = /(?:catalog|folder|page|figure|table|revision|document|literature|scale|warranty|shipping|price|precio|gtin|careers|blog|news|contact|login|register|search|menu|home)/i;
function computeBasicSpecs(sourceContent: string, extractedText: string) {
  const clean = stripMarkdownNoise(`${extractedText || ''}\n${sourceContent || ''}`);
  const merged = [
    ...extractAdjacentSpecs(clean),
    ...extractTextSpecs(clean),
    ...((extractPlainText(clean).specTable) || []),
    ...extractCompactSpecs(clean),
    ...extractValueFirstSpecs(clean)
  ];
  const seen = new Set<string>();
  const out: any[] = [];
  for (const s of merged) {
    const attr = String(s.attribute || '').trim().slice(0, 60);
    const val = String(s.value || '').trim().slice(0, 80);
    if (!attr || !val || !/\d/.test(val)) continue;
    const cleanPair = sanitizeExtractedPair(attr, val);
    if (!cleanPair) continue;
    if (BASIC_BLOCK.test(cleanPair.attribute)) continue;
    // basic_specs es sólo una vista rápida de datos técnicos encontrados.
    // Nunca debe convertirse en un cajón de datos corporativos/documentales.
    if (!isTechnicalSpecification(attr, val).ok) continue;
    const key = `${attr}|${val}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ attribute: attr, value: val });
    if (out.length >= 6) break;
  }
  return out;
}

async function feedKnowledgeCore(base44: any, ficha: any, url: string, isPdf: boolean) {
  try {
    const pn = ficha.part_number;
    const pnNorm = normalizePartNumber(pn);
    if (!pn) return { queued: false, reason: 'no_part_number' };

    // Persistencia principal: la ficha encontrada se materializa como Part + Specification
    // en estado PROCESSED/PENDIENTE, nunca como verificada automáticamente.
    let partId = '';
    try {
      const existingParts = await base44.asServiceRole.entities.Part.filter({ part_number_normalized: pnNorm }, 'updated_date', 1).catch(() => []);
      if (existingParts.length) {
        partId = existingParts[0].id;
        // Completa datos faltantes del Part existente sin degradar información
        // previamente almacenada. Esto permite que fichas históricas reciban
        // la imagen demostrada por una nueva fuente sin crear otro Part.
        const partPatch: any = {};
        const oldImgConfidence = Number(existingParts[0].image_confidence || 0);
        const newImgConfidence = Number(ficha.image_confidence || 0);
        if (ficha.image_url && (!existingParts[0].image_url || newImgConfidence >= oldImgConfidence)) {
          partPatch.image_url = ficha.image_url;
          partPatch.image_source_url = ficha.image_source_url || url;
          partPatch.image_method = ficha.image_method || '';
          partPatch.image_confidence = newImgConfidence;
        }
        if (!existingParts[0].manufacturer_name && ficha.manufacturer_name) partPatch.manufacturer_name = ficha.manufacturer_name;
        if (!existingParts[0].description && ficha.product_name) partPatch.description = safeText(ficha.product_name, 1000);
        if (Object.keys(partPatch).length) {
          await base44.asServiceRole.entities.Part.update(partId, partPatch).catch(() => {});
        }
      } else {
        const createdPart = await base44.asServiceRole.entities.Part.create({
          manufacturer_name: ficha.manufacturer_name || '',
          part_number: pn,
          part_number_normalized: pnNorm,
          category: ficha.component_type || '',
          description: safeText(ficha.product_name || pn, 1000),
          image_url: ficha.image_url || '',
          image_source_url: ficha.image_source_url || '',
          image_method: ficha.image_method || '',
          image_confidence: ficha.image_confidence || 0,
          validation_state: 'processed'
        });
        partId = createdPart.id;
      }

      let documentId = '';
      let sourceId = '';
      const existingSources = await base44.asServiceRole.entities.Source.filter({ url }, '-retrieved_date', 1).catch(() => []);
      if (existingSources.length) {
        sourceId = existingSources[0].id;
        documentId = existingSources[0].document_id || '';
      } else {
        const documentRec = await base44.asServiceRole.entities.Document.create({
          title: ficha.product_name || pn,
          file_url: url,
          document_type: isPdf ? 'datasheet' : 'other',
          status: 'processed'
        });
        documentId = documentRec.id;
        const sourceRec = await base44.asServiceRole.entities.Source.create({
          document_id: documentId,
          url,
          type: isPdf ? 'datasheet' : 'website',
          retrieved_date: new Date().toISOString()
        });
        sourceId = sourceRec.id;
        await base44.asServiceRole.entities.Document.update(documentId, { source_id: sourceId }).catch(() => {});
      }

      // Mismo patron que IngerirCrawl: processed -> Quality Gateway PASS -> published
      // directo, sin estado intermedio 'validated' y sin aprobacion humana. Las specs
      // que no pasan el Gateway se registran igual (para trazabilidad futura) pero
      // quedan en el estado que determine gateSpec (incomplete/rejected), nunca published.
      for (const s of Array.isArray(ficha.specs) ? ficha.specs : []) {
        const sg = gateSpec(s);
        const existingSpecs = await base44.asServiceRole.entities.Specification.filter({
          part_id: partId, attribute_name: s.attribute_name, source_id: sourceId
        }, '-updated_date', 1).catch(() => []);
        if (!existingSpecs.length) {
          const specRec = await base44.asServiceRole.entities.Specification.create({
            part_id: partId,
            attribute_name: s.attribute_name,
            attribute_canonical: s.attribute_canonical || s.attribute_name,
            original_value: s.original_value,
            normalized_value: s.normalized_value,
            original_unit: s.original_unit,
            normalized_unit: s.normalized_unit,
            source_id: sourceId,
            validation_state: sg.state
          });
          if (sg.pass) {
            const evidence = await base44.asServiceRole.entities.Evidence.create({
              document_id: documentId,
              part_id: partId,
              specification_id: specRec.id,
              raw_text: s.evidence_text,
              page: s.page || undefined,
              rule_id: 'SPEC.TECHNICAL_ATTRIBUTE_VALUE.v1'
            });
            await base44.asServiceRole.entities.Specification.update(specRec.id, { evidence_id: evidence.id, validation_state: 'published' });
            await base44.asServiceRole.entities.Provenance.create({
              entity_type: 'specification', entity_id: specRec.id, operation: 'validate', source_id: sourceId,
              rule_id: 'SPEC.TECHNICAL_ATTRIBUTE_VALUE.v1',
              note: 'deterministic extraction from discovered source; quality gateway pass'
            }).catch(() => {});
          }
        }
      }
    } catch (persistError) {
      // La ficha visual no se pierde si falla la persistencia.
    }

    // CatalogProduct: capa de catálogo propia. Idempotente por product_url + PN.
    const existingCatalog = await base44.asServiceRole.entities.CatalogProduct.filter(
      { part_number_normalized: pnNorm, product_url: url }, 'updated_date', 1
    ).catch(() => []);
    // CatalogProduct consume únicamente contenido que haya pasado el Quality Gateway.
    // Nunca materializar el texto crudo del PDF en description/search_text.
    const catalogSpecs = Array.isArray(ficha.specs) ? ficha.specs : [];
    const catalogDescription = safeText(ficha.product_name || pn, 1000);
    const catalogPayload = {
      manufacturer_name: ficha.manufacturer_name || '',
      part_number: pn,
      part_number_normalized: pnNorm,
      name: ficha.product_name || pn,
      description: catalogDescription,
      image_url: ficha.image_url || '',
      image_source_url: ficha.image_source_url || '',
      image_method: ficha.image_method || '',
      image_confidence: ficha.image_confidence || 0,
      product_url: url,
      datasheet_url: isPdf ? url : '',
      source_type: ficha.source_type === 'official' ? 'official' : 'distributor',
      source_domain: hostOf(url),
      source_provider: 'tavily',
      catalog_state: 'identified',
      search_text: [pn, ficha.manufacturer_name, ficha.product_name, catalogSpecs.map((s: any) => `${s.attribute} ${s.original_value}`).join(' ')].filter(Boolean).join(' '),
      last_seen: new Date().toISOString(),
      part_id: partId
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
      image_url: ficha.image_url || '',
      image_method: ficha.image_method || '',
      image_confidence: ficha.image_confidence || 0,
      discovery_state: 'discovered',
      confidence: 0.6,
      last_seen: new Date().toISOString(),
      part_id: partId
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
    return { queued: true, part_id: partId, catalog_id: catalogId, discovery_id: discoveryId };
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
    const sourceContent = String(body.source_content || '').trim();
    const imageUrlHint = String(body.image_url || '').trim();
    if (!url) return Response.json({ error: 'url required' }, { status: 400 });

    // 1) Adquisición de la fuente. Algunos fabricantes bloquean el fetch directo
    // (403/SPA shells). Si falla, se construye la ficha desde el contenido que
    // Tavily ya obtuvo (source_content) y/o desde Tavily Extract, para que toda
    // refacción buscada tenga su ficha técnica.
    let bytes: Uint8Array | null = null;
    let ct = '';
    let isPdf = /\.pdf(?:$|[?#])/i.test(url);
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        ct = (res.headers.get('content-type') || '').toLowerCase();
        bytes = new Uint8Array(await res.arrayBuffer());
        isPdf = ct.includes('pdf') || isPdf;
      }
    } catch { bytes = null; }

    // 2) Extracción determinística (mismo pipeline que IngerirCrawl).
    let extracted: any = null;
    if (bytes) {
      try {
        if (isPdf) extracted = await extractPDF(bytes);
        else {
          const raw = new TextDecoder().decode(bytes);
          extracted = /<\/html>/i.test(raw) || ct.includes('html') ? extractHTML(raw) : extractPlainText(raw);
        }
      } catch { extracted = null; }
    }

    // 2b) Fallback de adquisición: si el fetch falló o la extracción no fue
    //     extraíble, usar el contenido de Tavily (source_content / Extract).
    if (!extracted || !extracted.extractable) {
      let content = sourceContent || '';
      if (!content) content = await tavilyExtractContent(url);
      if (content) extracted = extractPlainText(content);
    }
    if (!extracted?.extractable) return Response.json({ found: false, error: 'source_not_extractable', url }, { status: 422 });

    // Algunas páginas industriales son shells/SPA y su HTML directo no contiene
    // la ficha renderizada. Tavily ya obtuvo el contenido de la página; úsalo como
    // evidencia de adquisición secundaria, sin saltarnos el Quality Gateway.
    if (sourceContent) mergeFallbackContent(extracted, sourceContent);

    // 3) Part Number: pista manual > candidatos estructurados > literal en la fuente.
    const candidates = extractCandidates(extracted.text, extracted.pages || [], extracted.blocks || [], extracted.tables || []);
    // Una URL puede ser un catálogo/familia con varios productos. En ese caso
    // ningún PN debe "ganar" por frecuencia y arrastrar las especificaciones de
    // todos los productos a una sola ficha. Solo una pista explícita del usuario
    // (part_number_hint) puede resolver la ambigüedad.
    const explicitPnCandidates = [...new Map(
      candidates
        .filter((c: any) => c.label_type === 'positive' || c.label_relation === 'table_header')
        .map((c: any) => [normalizePartNumber(c.text), c])
    ).values()].filter((c: any) => normalizePartNumber(c.text));
    const ambiguousMultiProductSource = !partNumberHint && explicitPnCandidates.length > 1;
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
    if (!partNumber && !ambiguousMultiProductSource) {
      const sel = selectPartNumber(candidates, null);
      if (sel.demonstrated && sel.candidate) {
        selectedCandidate = sel.candidate;
        partNumber = sel.value;
        derivation = sel.reason;
      }
    }
    if (!partNumber && !ambiguousMultiProductSource && query && normalizePartNumber(extracted.text).includes(normalizePartNumber(query)) && /[\d]/.test(query) && /[A-Za-z]/.test(query)) {
      partNumber = query;
      derivation = 'query_literal_in_source';
    }

    if (ambiguousMultiProductSource) {
      derivation = 'ambiguous_multi_product_source';
    }

    // 4) Especificaciones técnicas con evidencia. Semantic Resolver + Quality Gateway.
    //    buildSpecs devuelve TODAS las specs extraídas con flag gate_passed:
    //    las que pasan el Gateway se persisten como published; las que no, como incomplete.
    const consultationDate = new Date().toISOString();
    let allBuiltSpecs = buildSpecs(extracted, isPdf, url, consultationDate);
    // Una ficha sólo debe mostrar candidatos que sean técnicamente reconocibles.
    // Los pares documentales/corporativos (Website, Industry, Company size,
    // Headquarters, Type, Specialties, etc.) se conservan en la adquisición para
    // trazabilidad, pero NO se presentan como "especificaciones".
    let specs = ambiguousMultiProductSource ? [] : allBuiltSpecs.filter((s: any) => s.gate_passed);
    let unverifiedSpecs = ambiguousMultiProductSource ? [] : allBuiltSpecs.filter((s: any) =>
      !s.gate_passed && isTechnicalSpecification(s.attribute_name, s.original_value).ok
    );

    // 4b) Fallback de adquisición: si la fuente era un shell/SPA y source_content
    //     no aportó specs aceptadas, obtener el contenido renderizado vía Tavily
    //     Extract y re-extraer. Todo candidato sigue pasando Semantic Resolver + Gateway.
    let tavilyExtractUsed = false;
    if (specs.length === 0 && !ambiguousMultiProductSource) {
      const richer = await tavilyExtractContent(url);
      if (richer && richer.length > (extracted.text || '').length) {
        mergeFallbackContent(extracted, richer);
        allBuiltSpecs = buildSpecs(extracted, isPdf, url, consultationDate);
        specs = allBuiltSpecs.filter((s: any) => s.gate_passed);
        unverifiedSpecs = allBuiltSpecs.filter((s: any) =>
          !s.gate_passed && isTechnicalSpecification(s.attribute_name, s.original_value).ok
        );
        tavilyExtractUsed = specs.length > 0;
      }
    }

    // 5) Fabricante: pista manual > derivación de identidad desde contenido > dominio (solo si official).
    //    Nunca se deriva manufacturer_name desde tokens de la consulta: un token como
    //    "balero" o "neum" encontrado en el contenido NO es evidencia de fabricante.
    //    deriveProductIdentity ya valida fabricantes contra una lista conocida y exige
    //    que aparezcan en el contenido. El dominio solo cuenta como evidencia para
    //    fuentes oficiales (no distribuidores): mouser.com no hace que el fabricante sea "Mouser".
    const host = hostOf(url);
    let manufacturer = manufacturerHint;
    // La pista manual (manufacturer_hint del frontend) puede venir contaminada
    // por tokens de consulta. La validamos: si no aparece en el contenido, se descarta.
    if (manufacturer) {
      const contentText = safeText(`${extracted.title || ''} ${extracted.text || ''}`, 3000).toLowerCase();
      const mfrLower = String(manufacturer).toLowerCase();
      if (!contentText.includes(mfrLower)) {
        manufacturer = '';
      }
    }
    if (!manufacturer && extracted.title) {
      // Último recurso: si la fuente es oficial, el dominio demuestra el fabricante.
      // Solo para fuentes oficiales: un distribuidor (Mouser, DigiKey, etc.) no es
      // el fabricante del producto.
      const sourceType = String(body.source_type || '').toLowerCase();
      if (sourceType === 'official') {
        const stem = host.split('.')[0];
        if (stem && !['www', 'docs', 'support', 'download', 'catalog', 'shop', 'store', 'products'].includes(stem.toLowerCase())) {
          manufacturer = stem.charAt(0).toUpperCase() + stem.slice(1);
        }
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

    // 8) Imagen: resolver dedicado que recopila candidatos de JSON-LD Product,
    //    HTML <img>, og:image y Markdown; valida contra logos/banners/iconos
    //    y selecciona el de mayor evidencia de pertenecer al producto.
    let htmlContent = '';
    if (!isPdf && bytes) {
      htmlContent = new TextDecoder().decode(bytes.slice(0, 500000));
    }
    const resolvedImage = selectBestImage({
      html: htmlContent,
      markdown: sourceContent || '',
      tavily_image_url: imageUrlHint,
      product_context: {
        manufacturer: manufacturer || '',
        partNumber: partNumber || '',
        query,
        source_url: url
      }
    });
    let imageUrl = resolvedImage?.image_url || '';

    const productIdentity = deriveProductIdentity({
      title: safeText(extracted.title, 300),
      text: extracted.text,
      query,
      manufacturer_hint: manufacturer,
      part_number_hint: partNumber,
      source_url: url,
      component_type: template.type,
      component_type_label: template.label
    });

    const ficha = {
      found: true,
      ambiguous_source: ambiguousMultiProductSource,
      source: {
        url,
        domain: host,
        source_type: body.source_type || 'cse_configured',
        is_pdf: isPdf,
        title: safeText(extracted.title, 300),
        retrieved_date: consultationDate
      },
      part_number: partNumber || productIdentity.part_number,
      part_number_normalized: (partNumber || productIdentity.part_number) ? normalizePartNumber(partNumber || productIdentity.part_number) : '',
      manufacturer_name: manufacturer || productIdentity.manufacturer,
      product_name: productIdentity.short_description,
      product_identity: productIdentity,
      description: productIdentity.source_title || safeText(extracted.title, 300) || '',
      image_url: imageUrl,
      image_method: resolvedImage?.method || '',
      image_confidence: resolvedImage?.confidence || 0,
      image_source_url: resolvedImage?.source_url || url,
      component_type: template.type,
      component_type_label: template.label,
      specs,
      unverified_specs: unverifiedSpecs,
      basic_specs: ambiguousMultiProductSource ? [] : computeBasicSpecs(sourceContent, extracted.text),
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
    // waitUntil mantiene vivo el trabajo después de devolver la ficha al usuario.
    // Los IDs de persistencia no se conocen todavía; el estado se marca como queued.
    waitUntil(
      feedKnowledgeCore(base44, ficha, url, isPdf).catch(() => ({ queued: false }))
    );
    ficha.persistence = {
      saved: false,
      queued: true,
      part_id: '',
      catalog_id: '',
      discovery_id: ''
    };

    return Response.json(ficha);
  } catch (error) {
    return Response.json({ found: false, error: error?.message || String(error) }, { status: 500 });
  }
}