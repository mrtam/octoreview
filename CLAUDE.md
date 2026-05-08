# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — Compile TypeScript (`src/` → `dist/`) and copy `public/` (manifest, HTML, CSS, icons) into `dist/`.
- `npm test` — Runs `npm run build` then `node --test tests/*.test.mjs`. Tests import from `dist/`, so a stale build will be tested. Always rebuild before running tests directly.
- `node --test tests/github.test.mjs` — Run a single test file (after a build).
- `node --test --test-name-pattern="<regex>" tests/*.test.mjs` — Run a single test by name.
- `npm run clean` — Remove `dist/`.

To load the extension: build, then in `chrome://extensions` enable Developer mode and "Load unpacked" pointing at `dist/`.

## Architecture

Manifest V3 Chrome extension with popup/options pages plus a background service worker for polling.

**Build pipeline**: `tsc` emits ES modules to `dist/` (config: `target: ES2022`, `module: NodeNext`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). `scripts/copy-static.mjs` overlays `public/` (manifest, HTML/CSS, icons) on top. The manifest's `default_popup` and `options_page` reference HTML files that load the compiled `.js` from the same `dist/` root — so import specifiers in `src/` use `.js` extensions even though the source is `.ts` (NodeNext requirement).

**Entry points**, all compiled to ES modules:
- `src/popup.ts` — toolbar popup. Loads token + filters + cached results, renders enabled filters, fetches fresh results from the GitHub Search API on demand, and writes results back to the cache.
- `src/options.ts` — options page. CRUD for filters and the GitHub PAT.
- `src/background.ts` — service worker. Schedules one `chrome.alarms` poll, refreshes polling-enabled filters, stores unread notification state, and controls the toolbar badge.

**Shared core**:
- `src/types.ts` — `SavedFilter`, `PullRequestResult`, `FilterCacheEntry`, `AppSettings`, notification state, `StorageShape`. Source of truth for the storage schema.
- `src/storage.ts` — wraps `chrome.storage.local` with token, filters, cache, app settings, and notification state keys. `normalizeStoredFilter` is the single trim/default normalizer; treat it as authoritative when reading or writing filters.
- `src/github.ts` — query construction, fetch, and response normalization. The query builder in `buildSearchQuery` automatically adds `repo:owner/name` and `type:pr`, and adds `is:open` *unless* the user's query already contains a state qualifier (`is:open|closed|merged|unmerged`, `state:open|closed`). It adds `-draft:true` only when `includeDrafts === false` and the user hasn't set their own `draft:` qualifier. `buildFilterWebUrl` strips the `repo:` qualifier from the query for the GitHub web UI URL (the repo is part of the URL path instead).
- `src/time.ts`, `src/icons.ts` — formatting helpers.
- `src/chrome.d.ts` — minimal ambient `chrome.*` types (no `@types/chrome` dependency).

**Network**: only `https://api.github.com/*` (declared in `host_permissions`). Auth is `Bearer <PAT>` with `X-GitHub-Api-Version: 2022-11-28`. Read-only by design — adding write/auth scopes should be considered a breaking change to the extension's security posture.

**Pagination/caching**: `searchPullRequests` paginates at `PAGE_SIZE = 30`. Results merge into `FilterCacheEntry` per filter id and are persisted via `saveFilterCacheEntry`. The popup reads from cache first, then refreshes.

**Polling**: polling is enabled per filter via `pollingEnabled`; the interval is app-wide via `appSettings.pollingIntervalMinutes`. The service worker compares first-page PR ids against the previous cache entry. First-ever polls seed cache without unread notifications. Opening the popup clears the action badge, while filter-level unread dots persist until that filter is hovered or focused.

## Testing

Tests are plain `.mjs` files using `node:test` + `node:assert/strict`, importing from `dist/`. DOM-touching tests (popup, options) use `jsdom` and assign `globalThis.document`. There is no `chrome` polyfill — tests target pure functions (`buildSearchQuery`, `renderPopup`, etc.) rather than code paths that hit `chrome.storage`.
