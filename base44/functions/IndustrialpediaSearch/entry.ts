import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { SOURCE_REGISTRY, getSourcePolicy, allAuthorizedDomains, registryKey } from '../../shared/sourceRegistry.js';

/**
 * Industrialpedia Search API v1
 *
 * Stable application-level search contract.
 * The frontend talks only to this function; implementation providers remain
 * behind the API so the search engine can be migrated out of Base44 later
 * without changing the UI contract.
 *
 * Request:
 * { q, filters?, limit?, offset? }
 *
 * Response:
 * {
 *   q,
 *   knowledge_core_results,
 *   discovery_results,
 *   web_results,
 *   facets,
 *   meta: { api_version, providers }
 * }
 */
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const q = String(body.q || '').trim();
    if (!q) {
      return Response.json({
        q: '',
        knowledge_core_results: [],
        discovery_results: [],
        web_results: [],
        facets: { manufacturers: [], categories: [] },
        meta: { api_version: '1.0', providers: [] }
      });
    }

    const filters = body.filters || {};
    const limit = Math.min(parseInt(body.limit, 10) || 25, 100);
    const offset = parseInt(body.offset, 10) || 0;

    // Resolve only an explicitly registered manufacturer. We never infer a
    // manufacturer from an arbitrary query token. This registry is also the
    // source of truth for domains that may be searched as official/authorized.
    const normalizedQuery = registryKey(q);
    const registeredManufacturer = Object.keys(SOURCE_REGISTRY)
      .sort((a, b) => b.length - a.length)
      .find((name) => normalizedQuery === name || normalizedQuery.startsWith(`${name} `));
    const sourcePolicy = registeredManufacturer ? getSourcePolicy(registeredManufacturer) : null;
    const includeDomains = sourcePolicy ? allAuthorizedDomains(sourcePolicy) : [];

    const [kcResponse, webResponse] = await Promise.all([
      base44.functions.invoke('Buscar', {
        q,
        filters: {
          manufacturers: Array.isArray(filters.manufacturers) ? filters.manufacturers : [],
          categories: Array.isArray(filters.categories) ? filters.categories : [],
          has_specification: Boolean(filters.has_specification),
          validation_states: Array.isArray(filters.validation_states)
            ? filters.validation_states
            : ['published', 'validated', 'incomplete']
        },
        limit,
        offset,
        skip_web_discovery: true
      }),
      base44.functions.invoke('BuscarGoogle', {
        query: q,
        include_domains: includeDomains,
        source_policy: sourcePolicy
      })
    ]);

    const kc = kcResponse?.data || {};
    const web = webResponse?.data || {};

    return Response.json({
      q,
      knowledge_core_results: Array.isArray(kc.knowledge_core_results) ? kc.knowledge_core_results : [],
      discovery_results: Array.isArray(kc.discovery_results) ? kc.discovery_results : [],
      web_results: Array.isArray(web.google_results) ? web.google_results : [],
      facets: kc.facets || { manufacturers: [], categories: [] },
      meta: {
        api_version: '1.0',
        providers: ['knowledge_core', 'discovery', 'web_discovery'],
        source_policy: sourcePolicy ? {
          manufacturer: sourcePolicy.manufacturer,
          official_domains: sourcePolicy.official,
          authorized_distributor_domains: sourcePolicy.authorized_distributors
        } : null
      }
    });
  } catch (error) {
    return Response.json({
      error: error?.message || String(error),
      meta: { api_version: '1.0', providers: [] }
    }, { status: 500 });
  }
}
