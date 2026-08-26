# LEGACY CLEANUP QUARANTINE — Industrialpedia

> **Purpose:** single, non-executable inventory of components identified during the migration to the canonical architecture.
>
> **IMPORTANT:** `LEGACY` does not mean deleted. Nothing listed here may be removed until dependency checks and validation are complete.

## Canonical architecture — DO NOT TOUCH

```text
Base44 UI
  -> supabaseIndustrialpediaApi.js
  -> Supabase Knowledge Core
  -> Buscar / Encontrar / Comparar / Decidir
```

## QUARANTINED: external discovery/search legacy

### Candidate group A — already disconnected from the active user flow

- `BuscarGoogle` — external Google/Tavily discovery path.
- `ExtraerFichaTecnica` — legacy external extraction path.
- `MaterializeDiscovery` — legacy conversion of external discoveries into Base44 records.
- `src/components/search/GoogleResultCard.jsx` — removed from the frontend.
- Discovery result rendering/materialization branches in the active search UI — removed.

**Status:** disconnected from the active user-facing flow. Retain only until repository-level dependency audit is closed.

### Candidate group B — dependency trunk still under audit

- `base44/functions/Buscar` — legacy backend search path.
- `base44/shared/tavilySearch.js` — legacy external search utility.
- `base44/shared/discoveryPersist.js` — legacy discovery persistence utility.
- `DiscoveryIndex` — legacy discovery storage/entity.
- `IngerirCrawl` — legacy ingestion/crawl path; must be audited before touching `DiscoveryIndex`.

**Status:** DO NOT DELETE YET. These components may still reference each other.

### Candidate group C — compatibility audit required

- `IndustrialpediaSearch` — historical compatibility layer with Supabase-first behavior and possible Base44 fallback.
- Legacy Base44 entities potentially associated with the old Knowledge Core:
  - `Part`
  - `Specification`
  - `Evidence`
  - `Document`
  - `Source`
  - `SearchIndex`
  - `CatalogProduct`

**Status:** DO NOT MODIFY. Full reader/writer/caller audit required.

## Safe removal protocol

A component can move from `QUARANTINED` to `DELETION CANDIDATE` only after confirming:

1. `0` active frontend callers.
2. `0` active backend callers.
3. `0` cron/scheduled callers.
4. `0` required readers/writers in the canonical pipeline.
5. No dependency from Buscar, Encontrar, Comparar or Decidir.

After removal:

1. Run build/type checks.
2. Search for broken references.
3. Validate the canonical flow.
4. Only then continue with the next component.

## Rule

**Never modify an entity schema or production data merely to remove old code.**
Use the correct operation for the exact target, and stop if that operation is unavailable.
