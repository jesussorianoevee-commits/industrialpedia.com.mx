import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { INDUSTRIALPEDIA_ENDPOINTS, SEARCH_FUNCTION_URL, supabaseFunctionUrl } from '../shared/endpointRegistry.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const rel = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : walk(rel);
  return [rel];
});
const sourceFiles = walk('src').concat(walk('base44')).filter((f) => /\.(js|jsx|ts|tsx|mjs)$/.test(f));
const source = sourceFiles.map((f) => read(f)).join('\n');

// 1) One canonical search endpoint in application code.
assert.equal(INDUSTRIALPEDIA_ENDPOINTS.search.name, 'industrialpedia-search-v17');
assert.equal(SEARCH_FUNCTION_URL, 'https://stwwywzuzbkyoecjujeh.supabase.co/functions/v1/industrialpedia-search-v17');
const directSearchRefs = source.match(/industrialpedia-search-v\d+/g) || [];
assert.ok(directSearchRefs.every((name) => name === 'industrialpedia-search-v17') || directSearchRefs.length === 0,
  `legacy search endpoint reference detected: ${[...new Set(directSearchRefs)].join(', ')}`);

// 2) Version changes happen only in the registry, never in consumers.
const registry = read('base44/shared/endpointRegistry.js');
assert.match(registry, /industrialpedia-search-v17/);
for (const file of sourceFiles.filter((f) => !f.endsWith('endpointRegistry.js'))) {
  const text = read(file);
  assert.doesNotMatch(text, /functions\/v1\/industrialpedia-search-v\d+/,
    `hard-coded versioned search URL in ${file}`);
}

// 3) Production source must not import/use generative AI SDKs or model gateways.
assert.doesNotMatch(source, /(?:openai|anthropic|@google\/generative-ai|gemini|generateText|chatCompletion|lovable.*ai)/i,
  'AI/model dependency detected in production source');

// 4) Service-role credentials must never appear in browser source.
const browserSource = walk('src').filter((f) => /\.(js|jsx|ts|tsx)$/.test(f)).map(read).join('\n');
assert.doesNotMatch(browserSource, /SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEYS)/i,
  'service-role/secret credential reference detected in browser source');

// 5) Canonical product identity remains part_id/UUID based in the comparison path.
const api = read('base44/shared/supabaseIndustrialpediaApi.js');
assert.match(api, /canonicalId = String\(partId \|\| ''\)\.trim\(\)/);
assert.match(api, /p_part_id: canonicalId/);
assert.doesNotMatch(api, /p_part_number:\s*canonicalId/);

// 6) Endpoint registry exposes only intentionally approved canonical contracts.
const canonicalNames = Object.values(INDUSTRIALPEDIA_ENDPOINTS).filter((e) => e.status === 'canonical').map((e) => e.name);
assert.deepEqual(canonicalNames.sort(), [
  'industrialpedia-catalog-stats',
  'industrialpedia-search-v17',
  'industrialpedia-structured-acquisition-v1'
].sort());
assert.equal(supabaseFunctionUrl('search'), SEARCH_FUNCTION_URL);

console.log(JSON.stringify({
  status: 'GOVERNANCE_GATE_OK',
  checks: 6,
  canonical_search: INDUSTRIALPEDIA_ENDPOINTS.search.name,
  production_ai_dependency: false,
  browser_service_role_reference: false,
  identity_key: 'part_id'
}, null, 2));
