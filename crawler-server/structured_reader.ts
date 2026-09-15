// Ported from the Supabase Edge Function `industrialpedia-deterministic-structured-reader-v1`
// (v22, "deterministic-structured-reader-v20"): deterministic HTML/PDF spec extraction with
// alias matching and plausibility checks. Originally called over HTTP (with an internal
// shared-secret header) by industrialpedia-bearing-enrichment-worker-v3; ported here as a
// plain in-process function since both now run in the same crawler-server process — no
// network hop, no auth header needed.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { getDocumentProxy, extractText } from "npm:unpdf";

const VERSION = "deterministic-structured-reader-v20-vps-port";

const clean = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
const norm = (x: unknown) =>
  clean(x).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9²³µμΩω°%/]+/g, " ").replace(/\s+/g, " ").trim();
const nid = (x: unknown) => clean(x).toUpperCase().replace(/[\s._/-]+/g, "");

// Prefiere un numero inmediatamente seguido de una unidad real (mismo ancla que unit()) en
// vez de tomar ciegamente el primer numero del texto — evita que citas a normas/estandares
// (ej. "...DIN 1343) 330 l/min") capturen el numero de la norma en vez del valor real.
function num(x: string): string | null {
  const s = clean(x);
  const withUnit = s.match(/([+-]?\d+(?:[.,]\d+)?)\s*[A-Za-zµμΩω°%/²³]+\b/);
  if (withUnit) return String(Number(withUnit[1].replace(",", ".")));
  const m = s.match(/[+-]?\d+(?:[.,]\d+)?/);
  return m ? String(Number(m[0].replace(",", "."))) : null;
}
function unit(x: string): string | null {
  return clean(x).match(/\d+(?:[.,]\d+)?\s*([A-Za-zµμΩω°%/²³]+)\b/)?.[1]?.toLowerCase() || null;
}

function htmlText(h: string): string {
  return h
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:tr|div|p|li|dt|dd|h[1-6])>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#x2F;/gi, "/")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\|\s*/g, " | ")
    .split(/\r?\n/).map(clean).filter(Boolean).join("\n");
}

function htmlRows(h: string): string[][] {
  const rows: string[][] = [];
  for (const rm of h.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = [];
    for (const cm of rm[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) cells.push(clean(htmlText(cm[1]).replace(/\n/g, " ")));
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

function htmlPairs(h: string): any[] {
  const out: any[] = [];
  for (const cells of htmlRows(h)) {
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const label = clean(cells[i]), value = clean(cells[i + 1]);
      if (label && value && label.length <= 120 && value.length <= 180) out.push({ label, value, page: "1", parser: "html_tr_td" });
    }
  }
  return out;
}

function htmlGroup4Pairs(h: string): any[] {
  const out: any[] = [];
  for (const cells of htmlRows(h)) {
    for (let i = 0; i + 3 < cells.length; i += 4) {
      const symbol = clean(cells[i]), value = clean(cells[i + 1]), u = clean(cells[i + 2]), description = clean(cells[i + 3]);
      if (!symbol || !value || !u || !description) continue;
      if (symbol.length > 20 || description.length > 180) continue;
      if (!/^[A-Za-z][A-Za-z0-9₀-₁₂₃₄₅₆₇₈₉*()\-./]*$/.test(symbol)) continue;
      if (!/^[-+]?\d[\d,.]*(?:\s*[-–]\s*\d[\d,.]*)?$/.test(value.replace(/,/g, ""))) continue;
      if (!/^(mm|cm|m|in|ft|um|µm|nm|n|kn|mn|kg|g|mg|v|kv|mv|a|ma|ka|w|kw|hz|khz|mhz|rpm|min|s|ms|us|°c|°f|pa|kpa|mpa|bar|psi|l|ml|%)$/i.test(norm(u)) && u !== "-") continue;
      out.push({ label: description, value: `${value} ${u}`.trim(), page: "1", parser: "html_group4", source_symbol: symbol, source_unit: u, source_description: description });
    }
  }
  return out;
}

function htmlBearingDimensionPairs(h: string, family: string): any[] {
  const out: any[] = [];
  if (family !== "deep_groove_ball_bearing") return out;
  for (const cells of htmlRows(h)) {
    const symbol = clean(cells[0]);
    if (symbol !== "d" && symbol !== "D" && symbol !== "B") continue;
    let metric: string | null = null;
    for (const cell of cells.slice(1).reverse()) {
      const m = clean(cell).match(/([-+]?\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i);
      if (m) { metric = `${m[1]} ${m[2]}`; break; }
    }
    if (!metric) continue;
    const map: any = { d: "bore diameter", D: "outside diameter", B: "width" };
    out.push({ label: map[symbol], value: metric, page: "1", parser: "html_bearing_symbol", source_symbol: symbol, source_row: cells });
  }
  return out;
}

function linePairs(t: string, page: number): any[] {
  const a: any[] = [];
  for (const z of t.split(/\r?\n/)) {
    const l = z.trim();
    if (!l || l.length > 260) continue;
    const m = l.match(/^(.{2,120}?)\s*[:：]\s*(.{1,150})$/) || l.match(/^([A-Za-z][A-Za-z0-9À-ÿ()/,.\-\s]{2,110}?)\s{2,}(.{1,150})$/);
    if (m) a.push({ label: clean(m[1]), value: clean(m[2]), page: String(page), parser: "line_pair" });
  }
  return a;
}

const UI_NOISE = new Set(["compare", "add to list", "add to my list", "share", "print", "download", "back", "next", "previous", "home", "menu", "search", "login", "sign in", "sign up"]);
function isUiNoise(x: string): boolean {
  const n = norm(x);
  return !n || UI_NOISE.has(n) || n.length <= 2;
}

function nextLinePairs(t: string, page: number): any[] {
  const lines = t.split(/\r?\n/).map(clean).filter(Boolean);
  const a: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i];
    if (label.length < 2 || label.length > 120 || isUiNoise(label) || !/[A-Za-zÀ-ÿ]/.test(label) || /^[\d+\-.,%\s]+$/.test(label)) continue;
    for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
      const value = lines[j];
      if (isUiNoise(value)) continue;
      if (value.length < 1 || value.length > 180) break;
      if (!num(value)) continue;
      a.push({ label, value, page: String(page), parser: j === i + 1 ? "next_line_pair" : "next_line_pair_skipped_ui" });
      break;
    }
  }
  return a;
}

function aliasPrefixPairs(t: string, page: number, aliasRows: any[]): any[] {
  const lines = t.split(/\r?\n/).map(clean).filter(Boolean);
  const a: any[] = [];
  const sorted = [...aliasRows].filter((x) => x.norm).sort((x, y) => y.norm.length - x.norm.length);
  for (const line of lines) {
    const nl = norm(line);
    if (!nl || line.length > 260 || isUiNoise(line)) continue;
    for (const al of sorted) {
      if (nl === al.norm) continue;
      if (!nl.startsWith(al.norm + " ")) continue;
      const rawPrefix = line.slice(0, Math.min(line.length, al.label.length));
      const value = clean(line.slice(rawPrefix.length));
      if (!value || value.length > 180) continue;
      a.push({ label: al.label, value, page: String(page), parser: "alias_prefix_match", alias_property_code: al.code });
      break;
    }
  }
  return a;
}

function mergePairs(...groups: any[][]): any[] {
  const out: any[] = [], seen = new Set<string>();
  for (const x of groups.flat()) {
    const k = `${norm(x.label)}|${clean(x.value)}|${x.page}|${x.parser || ""}`;
    if (!x.label || !x.value || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

async function pdfPairs(buf: ArrayBuffer, aliasRows: any[]) {
  const d = await getDocumentProxy(new Uint8Array(buf));
  const z: any = await extractText(d, { mergePages: false });
  const pages = Array.isArray(z.text) ? z.text.map(String) : [String(z.text || "")];
  const pairs: any[] = [];
  for (let i = 0; i < pages.length; i++) {
    pairs.push(...linePairs(pages[i], i + 1));
    pairs.push(...aliasPrefixPairs(pages[i], i + 1, aliasRows));
  }
  return { plain: pages.join("\n"), pairs, pages, line_pairs_count: pairs.length, alias_prefix_pairs_count: pairs.filter((x) => x.parser === "alias_prefix_match").length };
}

async function fetchAndParse(url: string, aliasRows: any[], diagnostic = false, family = "") {
  const r = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "IndustrialpediaAcquisitionEngine/1.3", Accept: "text/html,application/xhtml+xml,application/pdf,application/json;q=0.9,*/*;q=0.5" },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) return { error: `http_${r.status}`, status: r.status };
  const ab = await r.arrayBuffer();
  const ct = r.headers.get("content-type") || "";
  const prefix = new TextDecoder().decode(ab.slice(0, 8));
  if (/pdf/i.test(ct) || prefix.startsWith("%PDF-")) {
    const z = await pdfPairs(ab, aliasRows);
    return {
      ok: true, url: r.url || url, plain: z.plain, pairs: z.pairs, pages: z.pages, mode: "pdf",
      html_pairs_count: 0, html_group4_pairs_count: 0, html_bearing_symbol_pairs_count: 0,
      line_pairs_count: z.line_pairs_count, next_line_pairs_count: 0, alias_prefix_pairs_count: z.alias_prefix_pairs_count,
      diagnostic_lines: diagnostic ? z.pages.flatMap((p: string, i: number) => p.split(/\r?\n/).map((line: string, n: number) => ({ page: i + 1, line: n + 1, text: line }))) : undefined,
    };
  }
  const raw = new TextDecoder().decode(ab), text = htmlText(raw);
  const hp = htmlPairs(raw), hg = htmlGroup4Pairs(raw), hb = htmlBearingDimensionPairs(raw, family), lp = linePairs(text, 1), np = nextLinePairs(text, 1);
  return {
    ok: true, url: r.url || url, plain: text, pairs: mergePairs(hb, hp, hg, lp, np), pages: [raw], mode: "html",
    html_pairs_count: hp.length, html_group4_pairs_count: hg.length, html_bearing_symbol_pairs_count: hb.length,
    line_pairs_count: lp.length, next_line_pairs_count: np.length, alias_prefix_pairs_count: 0,
    diagnostic_lines: diagnostic ? text.split(/\r?\n/).map((line: string, n: number) => ({ page: 1, line: n + 1, text: line })) : undefined,
  };
}

function resolveOrientation(left: string, right: string, aliasRows: any[]) {
  const l = norm(left), r = norm(right);
  const f = aliasRows.find((z) => l === z.norm || l.startsWith(z.norm + " "));
  if (f) return { alias: f, label: left, value: right, orientation: "label_to_value" };
  const rev = aliasRows.find((z) => r === z.norm || r.startsWith(z.norm + " "));
  if (rev) return { alias: rev, label: right, value: left, orientation: "value_to_label" };
  return null;
}

const isNumericDefinition = (d: any) => d?.data_type === "number" || d?.semantic_data_type === "measure" || d?.semantic_data_type === "count";
const UNIT_WORDS = new Set(["a", "ma", "ka", "v", "mv", "kv", "w", "kw", "mw", "hz", "khz", "mhz", "ghz", "ohm", "kohm", "mohm", "ω", "mm", "cm", "m", "km", "in", "inch", "inches", "ft", "um", "µm", "nm", "bar", "mbar", "pa", "kpa", "mpa", "psi", "rpm", "r/min", "deg", "degree", "degrees", "c", "f", "°c", "°f", "%", "n", "kn", "n·m", "l", "ml", "l/min", "ml/min", "s", "ms", "us", "µs", "min", "h", "kg", "g", "mg"]);
function hasRealWord(v: string): boolean {
  const s = clean(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const tokens = s.match(/[a-z]+(?:[-'][a-z]+)*/g) || [];
  for (const token of tokens) {
    if (UNIT_WORDS.has(token)) continue;
    if (token.length >= 2) return true;
  }
  return false;
}

export type StructuredReaderInput = { part_number: string; family_code: string; source_url: string; diagnostic?: boolean };

export async function runStructuredReader(sb: SupabaseClient, input: StructuredReaderInput) {
  const mpn = clean(input.part_number), family = clean(input.family_code), url = clean(input.source_url), diagnostic = input.diagnostic === true;
  if (!mpn || !family || !url) return { error: "part_number_family_source_url_required" };

  const { data: aliases, error: ae } = await sb.from("spec_attribute_aliases").select("alias_normalized,property_code").eq("family_code", family).eq("active", true);
  if (ae) throw ae;
  if (!aliases?.length) return { status: "needs_review", reason: "family_has_no_active_spec_aliases", family_code: family };

  const aliasRows = (aliases || []).map((a: any) => ({ norm: norm(a.alias_normalized), code: a.property_code, label: a.alias_normalized })).filter((a: any) => a.norm).sort((a: any, b: any) => b.norm.length - a.norm.length);
  const propertyCodes = [...new Set((aliases || []).map((a: any) => a.property_code).filter(Boolean))];
  const { data: definitions, error: de } = await sb.from("spec_property_definitions").select("property_code,data_type,semantic_data_type,canonical_unit").in("property_code", propertyCodes).eq("active", true);
  if (de) throw de;
  const definitionByCode = new Map((definitions || []).map((d: any) => [d.property_code, d]));

  let p: any;
  try {
    p = await fetchAndParse(url, aliasRows, diagnostic, family);
  } catch (e) {
    return { status: "needs_review", reason: "structured_fetch_or_parse_failed", message: e instanceof Error ? e.message : String(e) };
  }
  if (p.error) return { status: "needs_review", reason: p.error, http_status: p.status, source_url: url };

  if (!nid(p.plain).includes(nid(mpn))) {
    return {
      status: "needs_review", reason: "structured_identity_not_found", source_url: p.url, parser_mode: p.mode,
      html_pairs_count: p.html_pairs_count, html_group4_pairs_count: p.html_group4_pairs_count, html_bearing_symbol_pairs_count: p.html_bearing_symbol_pairs_count,
      line_pairs_count: p.line_pairs_count, next_line_pairs_count: p.next_line_pairs_count, alias_prefix_pairs_count: p.alias_prefix_pairs_count,
      diagnostic_lines: diagnostic ? p.diagnostic_lines : undefined,
    };
  }
  if (diagnostic) {
    return {
      status: "diagnostic_raw_extraction", part_number: mpn, family_code: family, source_url: p.url, parser_mode: p.mode,
      raw_text_length: p.plain.length, pages_count: p.pages.length, line_pairs_count: p.line_pairs_count, html_group4_pairs_count: p.html_group4_pairs_count,
      html_bearing_symbol_pairs_count: p.html_bearing_symbol_pairs_count, next_line_pairs_count: p.next_line_pairs_count, alias_prefix_pairs_count: p.alias_prefix_pairs_count,
      pairs_total: p.pairs.length, diagnostic_lines: p.diagnostic_lines,
    };
  }

  const specs: any[] = [], unknown: any[] = [], seen = new Set<string>(), plausibilityCache = new Map<string, any>();
  let forwardMatches = 0, reverseMatches = 0, rejectedAliasMatches = 0, datatypeRejected = 0, plausibilityRejected = 0;
  const categoricalRejected: any[] = [];

  for (const x of p.pairs) {
    const left = clean(x.label), right = clean(x.value);
    if (!left || !right) continue;
    const match = resolveOrientation(left, right, aliasRows);
    if (!match) {
      const la = aliasRows.some((z: any) => left === z.norm || left.startsWith(z.norm + " "));
      const ra = aliasRows.some((z: any) => right === z.norm || right.startsWith(z.norm + " "));
      if (la || ra) rejectedAliasMatches++;
      const k = `${norm(left)}|${right}`;
      if (!unknown.some((u) => u.key === k)) unknown.push({ key: k, label: left, value: right, page: x.page, parser: x.parser || null });
      continue;
    }
    const def = definitionByCode.get(match.alias.code);
    if (!def) {
      datatypeRejected++;
      unknown.push({ key: `missing_definition|${match.alias.code}|${match.value}|${x.page}`, label: match.label, value: match.value, page: x.page, parser: x.parser || null, reason: "property_definition_missing" });
      continue;
    }
    if (isNumericDefinition(def)) {
      const n = num(match.value);
      if (n === null) {
        datatypeRejected++;
        unknown.push({ key: `numeric_requires_number|${match.alias.code}|${match.value}|${x.page}`, label: match.label, value: match.value, page: x.page, parser: x.parser || null, reason: "numeric_property_requires_recognizable_number" });
        continue;
      }
      const nValue = Number(n), u = unit(match.value), ck = `${family}|${match.alias.code}|${nValue}|${u || ""}`;
      let pr = plausibilityCache.get(ck);
      if (!pr) {
        const { data, error } = await sb.rpc("check_spec_plausibility_v1", { p_family_code: family, p_property_code: match.alias.code, p_value: nValue, p_unit: u });
        if (error) return { status: "needs_review", reason: "plausibility_check_failed", property_code: match.alias.code, error: error.message };
        pr = data;
        plausibilityCache.set(ck, pr);
      }
      if (!pr?.pass) {
        plausibilityRejected++;
        unknown.push({ key: `plausibility_rejected|${match.alias.code}|${match.value}|${x.page}`, label: match.label, value: match.value, page: x.page, parser: x.parser || null, reason: "value_failed_plausibility_rules", plausibility: pr });
        continue;
      }
    } else if (!hasRealWord(match.value)) {
      datatypeRejected++;
      categoricalRejected.push({ property_code: match.alias.code, label: match.label, value: match.value, page: x.page, parser: x.parser || null });
      unknown.push({ key: `categorical_rejects_no_real_word|${match.alias.code}|${match.value}|${x.page}`, label: match.label, value: match.value, page: x.page, parser: x.parser || null, reason: "categorical_property_requires_real_word_after_unit_filter" });
      continue;
    }
    if (match.orientation === "label_to_value") forwardMatches++; else reverseMatches++;
    const k = `${match.alias.code}|${match.value}|${x.page}`;
    if (seen.has(k)) continue;
    seen.add(k);
    specs.push({
      property_code: match.alias.code, attribute_name: match.label, original_value: match.value,
      numeric_value: num(match.value), unit: unit(match.value), semantic_data_type: def.semantic_data_type, data_type: def.data_type,
      evidence_text: `${match.label}: ${match.value} | orientation=${match.orientation} | source=deterministic_structured_reader | url=${p.url}`,
      page: String(x.page || "1"),
    });
  }

  return {
    status: specs.length ? "extraction_verified" : "needs_review", reason: specs.length ? undefined : "no_verified_aliased_technical_specs",
    specs_found: specs.length, unknown_specs_count: unknown.length, rejected_alias_matches: rejectedAliasMatches, datatype_rejected: datatypeRejected,
    plausibility_rejected: plausibilityRejected, categorical_no_real_word_rejected: categoricalRejected.length, categorical_rejected_examples: categoricalRejected.slice(0, 20),
    unknown_specs: unknown, part_number: mpn, family_code: family, source_url: p.url, parser_mode: p.mode,
    html_pairs_count: p.html_pairs_count, html_group4_pairs_count: p.html_group4_pairs_count, html_bearing_symbol_pairs_count: p.html_bearing_symbol_pairs_count,
    line_pairs_count: p.line_pairs_count, next_line_pairs_count: p.next_line_pairs_count, alias_prefix_pairs_count: p.alias_prefix_pairs_count,
    pairs_total: p.pairs.length, orientation_matches: { label_to_value: forwardMatches, value_to_label: reverseMatches },
    specs, extractor: VERSION, extraction_mode: unknown.length ? "partial_known_specs" : "known_specs_only",
  };
}
