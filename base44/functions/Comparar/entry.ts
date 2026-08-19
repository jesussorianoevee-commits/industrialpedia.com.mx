import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

function norm(v: any) {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function numberFrom(v: any) {
  const m = String(v ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function compatibleState(base: any, candidate: any) {
  const b = numberFrom(base.normalized_value || base.original_value);
  const c = numberFrom(candidate.normalized_value || candidate.original_value);
  if (b !== null && c !== null) {
    const unitB = norm(base.normalized_unit || base.original_unit);
    const unitC = norm(candidate.normalized_unit || candidate.original_unit);
    if (unitB && unitC && unitB !== unitC) return 'not_comparable';
    if (b === c) return 'equal';
    return 'different';
  }
  const bv = norm(base.normalized_value || base.original_value);
  const cv = norm(candidate.normalized_value || candidate.original_value);
  if (!bv || !cv) return 'missing';
  return bv === cv ? 'equal' : 'different';
}

function canonicalKey(s: any) {
  return norm(s.attribute_canonical || s.attribute_name || s.attribute);
}

function scoreCandidate(baseSpecs: any[], candidateSpecs: any[]) {
  const map = new Map(candidateSpecs.map((s: any) => [canonicalKey(s), s]));
  let equal = 0, different = 0, missing = 0, notComparable = 0;
  const differences: any[] = [];
  for (const b of baseSpecs) {
    const key = canonicalKey(b);
    if (!key) continue;
    const c = map.get(key);
    if (!c) { missing++; differences.push({ attribute: b.attribute_name || b.attribute, state: 'missing', base: b.normalized_value || b.original_value || '', candidate: '' }); continue; }
    const state = compatibleState(b, c);
    if (state === 'equal') equal++;
    else if (state === 'different') different++;
    else if (state === 'not_comparable') notComparable++;
    else missing++;
    if (state !== 'equal') differences.push({ attribute: b.attribute_name || b.attribute, state, base: b.normalized_value || b.original_value || '', candidate: c.normalized_value || c.original_value || '' });
  }
  const evidence = candidateSpecs.filter((s: any) => s.evidence || s.source_id).length;
  const state = different === 0 && missing === 0 && notComparable === 0 && equal > 0
    ? 'compatible'
    : equal > 0 && different <= Math.max(1, Math.floor(equal / 2))
      ? 'review'
      : 'insufficient';
  return { state, equal, different, missing, not_comparable: notComparable, evidence, differences };
}

async function loadSpecs(base44: any, partId: string) {
  return base44.asServiceRole.entities.Specification.filter({ part_id: partId }, '-updated_date', 500).catch(() => []);
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const partId = String(body.part_id || '').trim();
    if (!partId) return Response.json({ error: 'part_id required' }, { status: 400 });

    const base = await base44.asServiceRole.entities.Part.get(partId);
    if (!base) return Response.json({ error: 'part not found' }, { status: 404 });
    const baseSpecs = await loadSpecs(base44, partId);
    const usableBaseSpecs = baseSpecs.filter((s: any) => s.validation_state !== 'rejected');

    // El comparador sólo puede evaluar compatibilidad si la ficha base tiene
    // especificaciones del Knowledge Core ya validadas/publicadas. basic_specs
    // no son suficientes para una decisión técnica.
    const verifiedBaseSpecs = usableBaseSpecs.filter((s: any) => ['validated', 'published'].includes(s.validation_state));
    if (!verifiedBaseSpecs.length) {
      return Response.json({
        base: { id: base.id, part_number: base.part_number, manufacturer_name: base.manufacturer_name, category: base.category, description: base.description, specs: [], image_url: base.image_url || '' },
        compatibility_evaluable: false,
        reason: 'La ficha base no tiene especificaciones verificadas en Knowledge Core. basic_specs no se utilizan para evaluar compatibilidad.',
        candidates_found: 0,
        candidates_considered: 0,
        alternatives: [],
        decision: { state: 'not_evaluable', message: 'Compatibilidad no evaluable: la ficha base sólo tiene datos de baja confianza.' }
      });
    }

    const baseSpecKeys = new Set(verifiedBaseSpecs.map(canonicalKey).filter(Boolean));
    const baseCategory = norm(base.category);
    const basePart = norm(base.part_number);

    async function materializeCandidate(r: any, sourceGroup: string) {
      try {
        if (!r.part_id) return null;
        const p = await base44.asServiceRole.entities.Part.get(r.part_id).catch(() => null);
        if (!p || norm(p.part_number) === basePart || p.validation_state === 'rejected') return null;
        const specs = await loadSpecs(base44, p.id);
        const candidateSpecs = specs.filter((s: any) => s.validation_state !== 'rejected' && baseSpecKeys.has(canonicalKey(s)));
        if (!candidateSpecs.length) return null;
        const comparison = scoreCandidate(verifiedBaseSpecs, candidateSpecs);
        return { part_number: p.part_number, manufacturer_name: p.manufacturer_name, product_name: p.description || p.part_number, image_url: p.image_url || r.image_url || '', source: { url: r.source_url || r.product_url || '', domain: r.source_url || '' }, specs: candidateSpecs, comparison, source_group: sourceGroup };
      } catch { return null; }
    }

    // 1) Knowledge Core verificado: primero, ordenado por requisitos cumplidos.
    const kcParts = await base44.asServiceRole.entities.Part.filter({ validation_state: { $in: ['validated', 'published'] } }, '-updated_date', 200).catch(() => []);
    const kcCandidates = await Promise.all(kcParts.filter((p: any) => norm(p.part_number) !== basePart && (!baseCategory || !p.category || norm(p.category) === baseCategory)).map((p: any) => materializeCandidate({ part_id: p.id, image_url: p.image_url }, 'knowledge_core')));

    // 2) DiscoveryIndex: candidatos descubiertos previamente con evidencia de fuente.
    const discoveries = await base44.asServiceRole.entities.DiscoveryIndex.filter({ discovery_state: { $in: ['discovered', 'pending_verification', 'verified'] } }, '-last_seen', 200).catch(() => []);
    const discoveryCandidates = await Promise.all(discoveries.filter((d: any) => norm(d.candidate_part_number) !== basePart && d.part_id).map((d: any) => materializeCandidate(d, 'discovery')));

    // 3) Sólo al final hacemos descubrimiento web en vivo.
    const queryTerms = [base.manufacturer_name, base.category, base.description].filter(Boolean).join(' ');
    const searchQuery = `${queryTerms} ${base.part_number} compatible industrial component alternative technical specifications`;
    let search = { google_results: [] as any[] };
    try {
      const fn = await base44.functions.invoke('BuscarGoogle', { query: searchQuery });
      search = fn.data || search;
    } catch { /* los grupos persistidos siguen disponibles */ }

    const liveCandidates = (search.google_results || [])
      .filter((r: any) => norm(r.part_number) !== basePart)
      .filter((r: any, i: number, arr: any[]) => arr.findIndex((x: any) => norm(x.url) === norm(r.url)) === i)
      .slice(0, 8);

    const extracted = await Promise.all(liveCandidates.map(async (r: any) => {
      try {
        const res = await base44.functions.invoke('ExtraerFichaTecnica', {
          url: r.url,
          query: base.part_number,
          manufacturer_hint: r.manufacturer_name || '',
          part_number_hint: r.part_number || '',
          source_type: r.source_type,
          source_content: r.raw_content || r.snippet || '',
          image_url: r.image_url || ''
        });
        const ficha = res.data;
        if (!ficha?.found || !ficha.part_number) return null;
        const candidateSpecs = Array.isArray(ficha.specs) ? ficha.specs : [];
        const comparison = scoreCandidate(verifiedBaseSpecs, candidateSpecs);
        return {
          part_number: ficha.part_number,
          manufacturer_name: ficha.manufacturer_name || r.manufacturer_name || '',
          product_name: ficha.product_name || r.product_name || r.title || ficha.part_number,
          image_url: ficha.image_url || r.image_url || '',
          source: ficha.source || { url: r.url },
          specs: candidateSpecs,
          comparison
        };
      } catch { return null; }
    }));

    const liveValid = extracted.filter(Boolean) as any[];
    liveValid.sort((a, b) => b.comparison.equal - a.comparison.equal || b.comparison.evidence - a.comparison.evidence);

    const groupSort = (list: any[]) => list.filter(Boolean).sort((a, b) =>
      b.comparison.equal - a.comparison.equal || b.comparison.different - a.comparison.different || b.comparison.evidence - a.comparison.evidence
    );
    const orderedGroups = [groupSort(kcCandidates), groupSort(discoveryCandidates), groupSort(liveValid)];
    const selected = orderedGroups.flat().slice(0, 3);
    const valid = orderedGroups.flat();

    return Response.json({
      base: {
        id: base.id,
        part_number: base.part_number,
        manufacturer_name: base.manufacturer_name,
        category: base.category,
        description: base.description,
        specs: usableBaseSpecs,
        image_url: base.image_url || ''
      },
      candidates_found: valid.length,
      candidates_considered: candidates.length,
      alternatives: selected,
      decision: selected.length === 0
        ? { state: 'insufficient', message: 'No se encontraron alternativas con evidencia técnica suficiente.' }
        : selected.some((x: any) => x.comparison.state === 'compatible')
          ? { state: 'compatible_found', message: 'Se encontraron alternativas que coinciden con los atributos técnicos disponibles.' }
          : { state: 'review_required', message: 'Se encontraron candidatos, pero existen diferencias o datos faltantes que requieren revisión técnica.' }
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
