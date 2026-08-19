import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizePartNumber } from '../../shared/searchRules.js';

function norm(v: any) { return String(v ?? '').trim().toLowerCase(); }
function tokens(v: any) { return norm(v).split(/[^a-z0-9]+/).filter(Boolean); }

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const q = String(body.q || '').trim();
    if (q.length < 2) return Response.json({ suggestions: [] });
    const qt = tokens(q);
    const qn = normalizePartNumber(q);
    const out = new Map<string, any>();

    // 1) Knowledge Core: mayor confianza.
    const parts = await base44.asServiceRole.entities.Part.list('-updated_date', 2000).catch(() => []);
    for (const p of parts) {
      const fields = [p.part_number, p.manufacturer_name, p.title, p.description, p.category].filter(Boolean).join(' ');
      const text = norm(fields);
      const pn = norm(p.part_number);
      const exact = qn && normalizePartNumber(p.part_number || '') === qn;
      const prefix = pn.startsWith(norm(q));
      const all = qt.length && qt.every((t) => text.includes(t));
      if (!exact && !prefix && !all) continue;
      const label = p.part_number || p.title || p.manufacturer_name;
      if (!label) continue;
      out.set(`pn:${norm(label)}`, { text: label, part_number: p.part_number || '', manufacturer: p.manufacturer_name || '', type: 'knowledge_core', score: exact ? 300 : prefix ? 250 : 200 });
    }

    // 2) DiscoveryIndex: resultados descubiertos previamente.
    const discoveries = await base44.asServiceRole.entities.DiscoveryIndex.filter(
      { discovery_state: { $in: ['discovered', 'pending_verification', 'verified'] } }, '-last_seen', 3000
    ).catch(() => []);
    for (const d of discoveries) {
      const fields = [d.candidate_part_number, d.manufacturer_name, d.title, d.description].filter(Boolean).join(' ');
      const text = norm(fields);
      const pn = norm(d.candidate_part_number);
      const exact = qn && normalizePartNumber(d.candidate_part_number || '') === qn;
      const prefix = pn.startsWith(norm(q));
      const all = qt.length && qt.every((t) => text.includes(t));
      if (!exact && !prefix && !all) continue;
      const label = d.candidate_part_number || d.title || d.manufacturer_name;
      if (!label) continue;
      const key = `pn:${norm(label)}`;
      if (!out.has(key)) out.set(key, { text: label, part_number: d.candidate_part_number || '', manufacturer: d.manufacturer_name || '', type: 'discovery', score: exact ? 200 : prefix ? 150 : 100, image: d.image_url || '' });
    }

    // 3) Manufacturers: útil para completar nombres de fabricante.
    const manufacturers = await base44.asServiceRole.entities.Manufacturer.list('name', 1000).catch(() => []);
    for (const m of manufacturers) {
      const name = String(m.name || '').trim();
      if (!name || !norm(name).startsWith(norm(q))) continue;
      const key = `m:${norm(name)}`;
      if (!out.has(key)) out.set(key, { text: name, part_number: '', manufacturer: name, type: 'manufacturer', score: 80 });
    }

    const suggestions = [...out.values()]
      .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text))
      .slice(0, 8);
    return Response.json({ suggestions });
  } catch (e) {
    return Response.json({ suggestions: [], error: e?.message || String(e) }, { status: 200 });
  }
}
