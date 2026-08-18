import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizePartNumber, looksLikePartNumber, tokenize, scorePart, rankComparator } from '../../shared/searchRules.js';

const DEFAULT_STATES = ['published'];
const ALLOWED_STATES = ['published', 'validated', 'incomplete'];
const SCAN_LIMIT = 500;

function pushGrp(m, k, v) { (m[k] = m[k] || []).push(v); }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const q = String(body.q || '').trim();
    const filters = body.filters || {};
    const limit = Math.min(parseInt(body.limit, 10) || 25, 100);
    const offset = parseInt(body.offset, 10) || 0;

    // Estados de validación: por defecto solo PUBLICADO.
    let states = DEFAULT_STATES;
    if (Array.isArray(filters.validation_states) && filters.validation_states.length) {
      states = filters.validation_states.filter((s) => ALLOWED_STATES.includes(s));
      if (!states.length) states = DEFAULT_STATES;
    }
    const stateQuery = { $in: states };

    const base = { validation_state: stateQuery };
    if (Array.isArray(filters.manufacturers) && filters.manufacturers.length) {
      base.manufacturer_name = { $in: filters.manufacturers };
    }
    if (Array.isArray(filters.categories) && filters.categories.length) {
      base.category = { $in: filters.categories };
    }

    // 1) Coincidencias estructurales exactas ($or sobre campos indexados).
    const orClauses = [];
    if (q) {
      orClauses.push({ part_number: q });
      const qNorm = normalizePartNumber(q);
      if (qNorm) orClauses.push({ part_number_normalized: qNorm });
      orClauses.push({ manufacturer_name: q });
      orClauses.push({ category: q });
    }

    let candidates = [];
    if (orClauses.length) {
      try {
        candidates = await base44.asServiceRole.entities.Part.filter(
          { ...base, $or: orClauses }, '-updated_date', 1000
        );
      } catch (e) { candidates = []; }
    }

    // 2) Para texto libre (no número de parte), scan acotado + filtro en código
    //    (la plataforma no expone $regex; este scan está limitado y respeta filtros).
    const isPartNo = looksLikePartNumber(q);
    const tokens = tokenize(q);
    if (q && !isPartNo && tokens.length) {
      try {
        const scan = await base44.asServiceRole.entities.Part.filter(base, '-updated_date', SCAN_LIMIT);
        const seen = new Set(candidates.map((c) => c.id));
        for (const p of scan) {
          if (!seen.has(p.id)) { candidates.push(p); seen.add(p.id); }
        }
      } catch (e) { /* sin candidatos adicionales */ }
    }

    // 3) Modo exploración: solo filtros, sin texto.
    if (!q && ((filters.manufacturers && filters.manufacturers.length) || (filters.categories && filters.categories.length))) {
      try {
        candidates = await base44.asServiceRole.entities.Part.filter(base, '-updated_date', 1000);
      } catch (e) { candidates = []; }
    }

    // 4) Cargar especificaciones y evidencia para los candidatos ($in, una llamada cada uno).
    const ids = candidates.map((c) => c.id);
    const specsByPart = {};
    const evidenceByPart = {};
    if (ids.length) {
      try {
        const specs = await base44.asServiceRole.entities.Specification.filter(
          { part_id: { $in: ids } }, '-updated_date', 2000
        );
        specs.forEach((s) => pushGrp(specsByPart, s.part_id, s));
        // Knowledge Core search: include the technical attribute/value text in scoring.
        // This is deterministic and uses only structured Specification records; no AI.
        if (q && !isPartNo && tokens.length) {
          for (const s of specs) {
            const attr = String(s.attribute_canonical || s.attribute_name || '').toLowerCase();
            const value = String(s.normalized_value || s.original_value || '').toLowerCase();
            const unit = String(s.normalized_unit || s.original_unit || '').toLowerCase();
            const haystack = `${attr} ${value} ${unit}`;
            if (tokens.some((t) => haystack.includes(t))) {
              s.__search_text_match = true;
            }
          }
        }
      } catch (e) { /* sin specs */ }
      try {
        const ev = await base44.asServiceRole.entities.Evidence.filter(
          { part_id: { $in: ids } }, '-updated_date', 2000
        );
        ev.forEach((e) => pushGrp(evidenceByPart, e.part_id, e));
      } catch (e) { /* sin evidencia */ }
    }

    // 5) Scoring + filtros derivados de specs.
    let scored = candidates.map((p) => {
      const specs = specsByPart[p.id] || [];
      const { score, match } = scorePart(p, q, specs);
      return { part: p, specs, evidence: evidenceByPart[p.id] || [], score, match };
    });

    if (filters.has_specification === true) {
      scored = scored.filter((r) => r.specs.length > 0);
    }
    if (Array.isArray(filters.specs) && filters.specs.length) {
      scored = scored.filter((r) => filters.specs.every((f) =>
        r.specs.some((s) => s.attribute_canonical === f.attribute_canonical &&
          String(s.normalized_value) === String(f.value))
      ));
    }
    if (q) scored = scored.filter((r) => r.score > 0 || r.specs.some((s) => s.__search_text_match));

    scored.sort(rankComparator);

    const total = scored.length;
    const page = scored.slice(offset, offset + limit);

    // 6) Facetas desde el conjunto completo (pre-paginación).
    const mfCounts = {};
    const catCounts = {};
    scored.forEach((r) => {
      if (r.part.manufacturer_name) mfCounts[r.part.manufacturer_name] = (mfCounts[r.part.manufacturer_name] || 0) + 1;
      if (r.part.category) catCounts[r.part.category] = (catCounts[r.part.category] || 0) + 1;
    });

    const unique = (arr) => [...new Set(arr.filter(Boolean))];
    const results = page.map((r) => ({
      id: r.part.id,
      part_number: r.part.part_number,
      manufacturer_name: r.part.manufacturer_name,
      category: r.part.category,
      subcategory: r.part.subcategory,
      description: r.part.description,
      image_url: r.part.image_url,
      validation_state: r.part.validation_state,
      match: r.match,
      score: r.score,
      has_evidence: r.evidence.length > 0,
      evidence_count: r.evidence.length,
      source_ids: unique(r.specs.map((s) => s.source_id)),
      spec_count: r.specs.length,
      top_specs: r.specs.slice(0, 4).map((s) => ({
        attribute: s.attribute_canonical || s.attribute_name,
        value: s.normalized_value || s.original_value,
        unit: s.normalized_unit || s.original_unit,
        validated: s.validation_state === 'published' || s.validation_state === 'validated'
      }))
    }));

    return Response.json({
      q,
      total,
      offset,
      limit,
      states,
      results,
      facets: {
        manufacturers: Object.entries(mfCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        categories: Object.entries(catCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}