// Ported verbatim from the Supabase Edge Function `industrialpedia-structural-extractor-v1`
// (project stwwywzuzbkyoecjujeh, version 3). Same deterministic, zero-AI PDF geometry
// extraction logic — only the request/response wrapper changed (see main.ts), not this file.
import { getDocumentProxy } from "npm:unpdf";

export const EXTRACTOR_VERSION = "structural-extractor-v1-generic-2026-09-10";

type F = { text: string; x: number; y: number; w: number; h: number };
type C = { text: string; x: number; colIndex: number };
type R = { y: number; cells: C[] };
type G = { rows: R[]; columnCenters: number[] };

async function frags(u: string, p: number): Promise<F[]> {
  const r = await fetch(u);
  if (!r.ok) throw Error("fetch " + r.status);
  const d = await getDocumentProxy(new Uint8Array(await r.arrayBuffer())), pg = await d.getPage(p), ct = await pg.getTextContent(), o: F[] = [];
  for (const i of ct.items as any[]) {
    if (!(i.str ?? "").trim()) continue;
    const t = i.transform ?? [1, 0, 0, 1, 0, 0];
    o.push({ text: String(i.str), x: +t[4], y: +t[5], w: Math.abs(+(i.width ?? 0)), h: Math.abs(+(i.height ?? t[3] ?? 0)) });
  }
  return o;
}
function assign(x: number, cs: number[]) { let b = 0; for (let i = 1; i < cs.length; i++) if (Math.abs(cs[i] - x) < Math.abs(cs[b] - x)) b = i; return b }
function grid(fs: F[]): G {
  const bands: F[][] = []; let last: number | null = null;
  for (const f of [...fs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    if (last === null || Math.abs(last - f.y) > 1) { bands.push([f]); last = f.y } else bands[bands.length - 1].push(f);
  }
  const xs = [...fs].sort((a, b) => a.x - b.x).map(f => f.x), cs: number[] = [];
  for (const x of xs) { const i = cs.findIndex(c => Math.abs(c - x) <= 2); if (i < 0) cs.push(x); else cs[i] = (cs[i] + x) / 2 }
  cs.sort((a, b) => a - b);
  return { rows: bands.map(b => ({ y: Math.max(...b.map(f => f.y)), cells: b.sort((a, b) => a.x - b.x).map(f => ({ text: f.text, x: f.x, colIndex: assign(f.x, cs) })) })), columnCenters: cs };
}
const norm = (s: string) => s.replace(/[^\d.]/g, ""), texts = (r: R) => r.cells.map(c => c.text);
function row(g: G, label: string) { return g.rows.find(r => r.cells.some(c => c.text.replace(/\s+/g, "") === label)) ?? null }
function region(fs: F[], firstRow: string, lastRow: string) {
  const ys = fs.filter(f => [firstRow, lastRow].includes(f.text.replace(/\s+/g, ""))).map(f => f.y);
  if (ys.length < 2) return { ok: false as const, reason: "row labels missing" };
  const lo = Math.min(...ys), hi = Math.max(...ys);
  return { ok: true as const, yMin: lo, yMax: hi, frags: fs.filter(f => f.y >= lo - 1 && f.y <= hi + 1) };
}
function calibrate(g: G, anchors: { rowLabel: string; expectedValue: string }[]) {
  let inter: Set<number> | null = null; const per: any = {};
  for (const a of anchors) {
    const r = row(g, a.rowLabel);
    if (!r) return { ok: false as const, reason: "missing " + a.rowLabel, perAnchor: per };
    const cols = r.cells.filter(c => norm(c.text) === a.expectedValue).map(c => c.colIndex);
    per[a.rowLabel] = cols;
    if (!cols.length) return { ok: false as const, reason: "missing value", perAnchor: per };
    const s = new Set(cols);
    inter = inter === null ? s : new Set([...inter].filter(i => s.has(i)));
  }
  const out = [...(inter ?? new Set<number>())];
  return out.length === 1 ? { ok: true as const, colIndex: out[0], perAnchor: per } : { ok: false as const, reason: out.length ? "ambiguous" : "empty", perAnchor: per };
}
function hasExpected(cells: string[], v: string) { if (v === "—") return cells.some(x => x === "—" || x === "–" || x === "-"); return cells.some(x => norm(x) === v) }
function sharedBlock(g: G, modelPattern: string, tokens: string[], weight: string, weightXMin: number) {
  const re = new RegExp(modelPattern);
  const ms = g.rows.map(r => ({ r, m: r.cells.find(c => re.test(c.text) && c.x > 100)?.text })).filter(x => x.m) as any[];
  const sel = tokens.map(t => ms.find(x => x.m === t)).filter(Boolean);
  const a = g.rows.find(r => r.cells.some(c => c.text === weight && c.x > weightXMin));
  if (sel.length !== tokens.length || !a) return { pass: false, reason: "missing" };
  const ys = sel.map((x: any) => x.r.y), top = Math.max(...ys), bottom = Math.min(...ys);
  const intr = ms.filter((x: any) => x.r.y <= top && x.r.y >= bottom && !tokens.includes(x.m)).map((x: any) => x.m);
  return { pass: a.y <= top && a.y >= bottom && !intr.length, models: sel.map((x: any) => x.m), top, bottom, anchorY: a.y, intruders: intr };
}
function modelRecords(rg: any, cfg: any) {
  const fs: F[] = rg.frags, re = new RegExp(cfg.model_pattern);
  const models = fs.filter(f => re.test(f.text) && f.x >= cfg.model_x_min && f.x <= cfg.model_x_max).sort((a, b) => b.y - a.y);
  const recs: any[] = [];
  for (const m of models) {
    const near = fs.filter(f => Math.abs(f.y - m.y) <= 1.5).sort((a, b) => a.x - b.x);
    const at = (loHi: [number, number]) => near.find(f => f.x >= loHi[0] && f.x <= loHi[1])?.text ?? null;
    const fields: any = {};
    for (const cf of (cfg.column_fields || [])) fields[cf.name] = at([cf.x_min, cf.x_max]);
    let weight: any = null;
    if (cfg.weight_groups?.length) {
      const pg = cfg.weight_groups.find((g2: any) => g2.models.includes(m.text));
      if (pg) {
        const wf = cfg.weight_field;
        const w = wf ? near.find(f => f.text === pg.weight_value && f.x >= wf.x_min && f.x <= wf.x_max) : null;
        const ys = pg.models.map((p: string) => models.find(x => x.text === p)?.y).filter((x: any) => x !== undefined);
        const wAnywhere = fs.find(f => f.text === pg.weight_value && wf && f.x >= wf.x_min && f.x <= wf.x_max && f.y <= Math.max(...ys) && f.y >= Math.min(...ys));
        const chosen = w || wAnywhere;
        if (chosen && chosen.y <= Math.max(...ys) && chosen.y >= Math.min(...ys)) weight = { value: pg.weight_value, unit: cfg.weight_unit || "g", scope: "configuration_group", models: pg.models, anchor_y: chosen.y, geometry_verified: true };
      }
    }
    let seal: string | null = null;
    if (cfg.seal_field) { const sf = cfg.seal_field; seal = near.find(f => f.x >= sf.x_min && f.x <= sf.x_max && (!sf.pattern || new RegExp(sf.pattern).test(f.text)))?.text ?? null }
    recs.push({ part_number: m.text, row_y: m.y, seal, fields, weight, weight_resolution: weight ? { status: "emitted", reason: "geometrically_verified_shared_anchor" } : { status: "omitted", reason: "no_geometrically_verified_weight_anchor_for_this_configuration_group" }, evidence: { page: cfg.page, source_url: cfg.document_url, row_y: m.y } });
  }
  return recs;
}
async function test(cfg: any) {
  const checks: any[] = [];
  const add = (id: string, name: string, pass: boolean, detail: any) => checks.push({ id, name, pass, detail });
  const fs = await frags(cfg.document_url, cfg.page);
  add("C1", "TextItem con geometria X/Y", fs.length > 0 && fs.every(f => Number.isFinite(f.x) && Number.isFinite(f.y)), { fragments: fs.length });
  if (cfg.printed_page) add("C0", "pagina PDF = pagina impresa esperada", fs.some(f => f.text.replace(/\s+/g, "") === cfg.printed_page), { found: cfg.printed_page });
  const rg = region(fs, cfg.first_row, cfg.last_row);
  add("C1b", "region derivada de first_row..last_row", rg.ok, rg.ok ? { y_min: rg.yMin, y_max: rg.yMax, items: rg.frags.length } : rg);
  if (!rg.ok) return { version: EXTRACTOR_VERSION, family_code: cfg.family_code, result: "FAIL", checks };
  const g = grid(rg.frags), cal = calibrate(g, cfg.anchors || []);
  add("C2", "interseccion de anclas conocidas identifica una sola columna", cal.ok, cal);
  for (const kr of (cfg.known_rows || [])) {
    const r = row(g, kr.row_label), ta = r ? texts(r) : [], missing = (kr.expected_cells || []).filter((x: string) => !hasExpected(ta, x));
    add("C3:" + kr.row_label, "fila conocida con valores esperados", !!r && !missing.length, { found: ta, missing });
  }
  if (cfg.dash_check) {
    const a = row(g, cfg.dash_check.with_dash), b = row(g, cfg.dash_check.without_dash);
    const dash = (t: string[]) => t.some(x => x === "—" || x === "–" || x === "-");
    add("C4b", "fila con guion vs fila sin guion, distinguibles", !!a && !!b && dash(texts(a)) && !dash(texts(b)), { a: a ? texts(a) : null, b: b ? texts(b) : null });
  }
  if (cfg.weight_groups?.length) {
    const results = cfg.weight_groups.map((wg: any) => ({ group: wg.models, ...sharedBlock(g, cfg.model_pattern, wg.models, wg.weight_value, cfg.weight_field?.x_min ?? 0) }));
    add("C6", "cada grupo de peso compartido pertenece a un bloque logico contiguo", results.every((r: any) => r.pass), { groups: results });
  }
  const bad: any[] = [];
  for (const r of g.rows) for (const c of r.cells) if (assign(c.x, g.columnCenters) !== c.colIndex) bad.push(c);
  add("C7", "asignacion de columnas coherente en toda la rejilla", !bad.length, { cells_checked: g.rows.reduce((n, r) => n + r.cells.length, 0), misassigned: bad });
  const passed = checks.filter(c => c.pass).length;
  return { version: EXTRACTOR_VERSION, family_code: cfg.family_code, contract: "structural_extractor_generic_acceptance", document: cfg.document_url, pdf_page: cfg.page, result: passed === checks.length ? "PASS" : "FAIL", passed, total: checks.length, checks, grid_summary: { rows: g.rows.length, columns: g.columnCenters.length }, scope: { writes_to_database: false } };
}

export async function runExtractor(body: any) {
  const cfg = body.config;
  if (!cfg || !cfg.document_url || !cfg.page || !cfg.first_row || !cfg.last_row || !cfg.model_pattern) {
    return { status: 400, json: { error: "invalid_config", required: ["document_url", "page", "first_row", "last_row", "model_pattern"] } };
  }
  const fs = await frags(cfg.document_url, cfg.page);
  const rg = region(fs, cfg.first_row, cfg.last_row);
  if (!rg.ok) return { status: 422, json: { version: EXTRACTOR_VERSION, error: rg.reason } };
  if (body.mode === "records") return { status: 200, json: { version: EXTRACTOR_VERSION, mode: "records", family_code: cfg.family_code, document: cfg.document_url, page: cfg.page, record_count: modelRecords(rg, cfg).length, records: modelRecords(rg, cfg) } };
  if (body.mode === "dump") { const g = grid(rg.frags); return { status: 200, json: { version: EXTRACTOR_VERSION, mode: "dump", rows: g.rows, columns: g.columnCenters } } }
  return { status: 200, json: await test(cfg) };
}
