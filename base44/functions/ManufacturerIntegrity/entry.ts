import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// INDUSTRIALPEDIA — Manufacturer Integrity
// Deterministic detector only. Never updates Part or Manufacturer.
// Classification: AUTO_REPAIR | NEEDS_REVIEW | IGNORE

const CLASS = Object.freeze({
  AUTO_REPAIR: 'AUTO_REPAIR',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  IGNORE: 'IGNORE'
});

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleUpperCase('en-US')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function prefixMatch(text: string, alias: string): boolean {
  if (!text || !alias) return false;
  return text === alias || text.startsWith(alias + ' ');
}

function aliasesFor(m: any, configured: Record<string, string[]>): string[] {
  const raw = [m.name, m.slug, ...(configured[m.id] || []), ...(configured[normalize(m.name)] || [])];
  return [...new Set(raw.map(normalize).filter(Boolean))];
}

function chooseLongestUniquePrefix(text: string, manufacturers: any[], configured: Record<string, string[]>) {
  const matches: Array<{ manufacturer: any; alias: string }> = [];
  for (const manufacturer of manufacturers) {
    for (const alias of aliasesFor(manufacturer, configured)) {
      if (prefixMatch(text, alias)) matches.push({ manufacturer, alias });
    }
  }
  if (!matches.length) return { status: 'none' as const, matches: [] as any[] };
  matches.sort((a, b) => b.alias.length - a.alias.length || a.manufacturer.id.localeCompare(b.manufacturer.id));
  const longest = matches[0].alias.length;
  const best = matches.filter((x) => x.alias.length === longest);
  const manufacturerIds = [...new Set(best.map((x) => x.manufacturer.id))];
  if (manufacturerIds.length !== 1) return { status: 'ambiguous' as const, matches: best };
  return { status: 'unique' as const, match: best[0], matches: best };
}

function textField(part: any) {
  // Current schema does not expose `name`; support it if present without assuming it.
  // Description is intentionally NOT treated as equivalent evidence for AUTO_REPAIR.
  if (typeof part.name === 'string' && part.name.trim()) return { value: part.name, field: 'name' };
  if (typeof part.title === 'string' && part.title.trim()) return { value: part.title, field: 'title' };
  return { value: '', field: null };
}

export default async function (req: Request) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(500, Number(body.limit) || 500));
  const skip = Math.max(0, Number(body.skip) || 0);
  const configuredAliases = body.aliases && typeof body.aliases === 'object' ? body.aliases : {};

  const manufacturers = await base44.asServiceRole.entities.Manufacturer.filter({}, 'name', 500);
  const parts = await base44.asServiceRole.entities.Part.filter({}, 'created_date', limit, skip);
  const byId = new Map(manufacturers.map((m: any) => [m.id, m]));

  const results: any[] = [];
  const counts = { AUTO_REPAIR: 0, NEEDS_REVIEW: 0, IGNORE: 0 };

  for (const part of parts) {
    const current = part.manufacturer_id ? byId.get(part.manufacturer_id) : null;
    const field = textField(part);
    const normalizedName = normalize(field.value);

    if (!normalizedName) {
      const classification = CLASS.IGNORE;
      counts[classification]++;
      results.push({
        part_id: part.id,
        before: { manufacturer_id: part.manufacturer_id || null, manufacturer_name: part.manufacturer_name || null },
        after: null,
        classification,
        evidence: { reason: 'NO_NAME_FIELD_AVAILABLE', source_field: null },
        risks: ['No exact name/title field exists; description is not promoted to repair evidence.']
      });
      continue;
    }

    const resolution = chooseLongestUniquePrefix(normalizedName, manufacturers, configuredAliases);

    if (resolution.status === 'none') {
      const classification = current ? CLASS.NEEDS_REVIEW : CLASS.IGNORE;
      counts[classification]++;
      results.push({
        part_id: part.id,
        before: { manufacturer_id: part.manufacturer_id || null, manufacturer_name: part.manufacturer_name || null },
        after: null,
        classification,
        evidence: { source_field: field.field, normalized_name: normalizedName, reason: 'NO_MANUFACTURER_PREFIX_MATCH' },
        risks: current ? ['Current manufacturer cannot be independently confirmed from the name prefix.'] : []
      });
      continue;
    }

    if (resolution.status === 'ambiguous') {
      const classification = CLASS.NEEDS_REVIEW;
      counts[classification]++;
      results.push({
        part_id: part.id,
        before: { manufacturer_id: part.manufacturer_id || null, manufacturer_name: part.manufacturer_name || null },
        after: null,
        classification,
        evidence: {
          source_field: field.field,
          normalized_name: normalizedName,
          reason: 'LONGEST_PREFIX_NOT_UNIQUE',
          candidates: resolution.matches.map((x: any) => ({ manufacturer_id: x.manufacturer.id, manufacturer: x.manufacturer.name, alias: x.alias }))
        },
        risks: ['Ambiguous resolution: no deterministic repair.']
      });
      continue;
    }

    const target = resolution.match.manufacturer;
    if (current && current.id === target.id) {
      const classification = CLASS.IGNORE;
      counts[classification]++;
      results.push({
        part_id: part.id,
        before: { manufacturer_id: part.manufacturer_id, manufacturer_name: part.manufacturer_name || null },
        after: null,
        classification,
        evidence: { source_field: field.field, normalized_name: normalizedName, matched_alias: resolution.match.alias, resolved_manufacturer: target.name, reason: 'CURRENT_MANUFACTURER_ALREADY_MATCHES' },
        risks: []
      });
      continue;
    }

    // Unique longest prefix to an existing Manufacturer is sufficient for a proposed repair.
    const classification = CLASS.AUTO_REPAIR;
    counts[classification]++;
    results.push({
      part_id: part.id,
      before: { manufacturer_id: part.manufacturer_id || null, manufacturer_name: part.manufacturer_name || null },
      after: { manufacturer_id: target.id, manufacturer_name: target.name },
      classification,
      evidence: { source_field: field.field, normalized_name: normalizedName, matched_alias: resolution.match.alias, resolved_manufacturer: target.name, reason: 'UNIQUE_LONGEST_PREFIX_MATCH' },
      risks: ['Proposal only. This function performs no UPDATE. Apply only through a separately reviewed workflow.']
    });
  }

  return Response.json({
    mode: 'dry-run',
    policy: 'NO_UPDATES_NO_MANUFACTURER_DELETES_NO_HISTORY_TOUCH',
    counts,
    total: results.length,
    results,
    data_limits: {
      part_schema_name_field: 'name/title if present at runtime',
      current_schema_note: 'Current Part schema does not define name or title, so records without one are intentionally not auto-repaired.',
      aliases: 'Canonical Manufacturer.name + slug + optional request aliases; all normalized deterministically with Unicode-aware normalization.'
    }
  });
}
