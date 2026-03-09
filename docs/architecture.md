# Architecture

## Overview

The plugin has three parts:
- Library plugin (TypeScript/React) - runs in Steam's UI, detects game pages, displays HLTB data
- Store page (TypeScript/webkit) - runs on Steam store pages, injects HLTB data into the sidebar
- Backend (Lua) - fetches data from HLTB and Steam APIs, manages all caching

## Library Plugin

Entry point: `frontend/index.tsx`

Key responsibilities:
- On startup, initialize ID cache via backend RPC (for public Steam profiles)
- Detect when user views a game page (MutationObserver watching for game header images)
- Extract Steam App ID from image URLs
- Call backend `GetHltbData` to get HLTB data (backend handles cache, ID lookup, and name search internally)
- Inject completion time display into the page

Supports both Desktop and Big Picture modes. Uses CSS selectors to find game page elements.

IMPORTANT: these are obfuscated class names that may break on Steam updates. But other reference implementations use a similar approach.

## Store Page (Webkit)

Entry point: `webkit/index.tsx`

Key responsibilities:
- Detect store app pages via URL pattern (`store.steampowered.com/app/*`)
- Call backend `GetHltbData` to get HLTB data
- Inject completion time display into the store sidebar

Works in both Desktop and Big Picture store views (same DOM structure).

## Backend

Entry point: `backend/main.lua`

Key responsibilities:
- Manage result cache and ID cache (in-memory with disk persistence)
- Check caches before making API calls
- Fetch HLTB data directly by ID (fast path when ID mapping exists)
- Fetch game name from Steam API and search HLTB by name (fallback path)
- Fetch Steam import data to populate ID cache
- Return completion times with cache metadata (fromCache, isStale)

The HLTB client (`backend/hltb.lua`) handles auth tokens, search endpoint extraction, Steam import, and game matching. See `docs/hltb-api.md` for details.

The cache module (`backend/cache.lua`) manages two caches:
- Result cache: HLTB data keyed by Steam app ID. 12h staleness, 90d hard expiry, 2000 max entries.
- ID cache: Steam app ID to HLTB game ID mappings from the Steam import API.

Both are persisted to disk as `cache.json` and `id_cache.json`.

## Data Flow

### Startup (ID Cache Initialization)

1. Library plugin gets current user's Steam ID from `window.App.m_CurrentUser.strSteamID`
2. Calls backend `InitIdCache` with Steam user ID
3. Backend checks if ID cache is already valid for this user
4. If not, calls HLTB's Steam import API to get Steam app ID -> HLTB ID mappings
5. Backend stores mappings in the ID cache (memory + disk)
6. If profile is private, ID cache remains empty - falls back to name-based search

### Game Page View (Library or Store)

1. User navigates to a game page (library) or store page (webkit)
2. Plugin detects the Steam App ID
3. Calls backend `GetHltbData(app_id, fallback_name)`
4. Backend checks result cache:
   - If fresh hit: returns cached data with `fromCache: true, isStale: false`
   - If stale hit: returns cached data with `fromCache: true, isStale: true`
   - If miss: continues to step 5
5. Backend checks ID cache for HLTB ID mapping:
   - If found: fetches HLTB data directly by ID (fast path, guaranteed match)
   - If not found: fetches game name from Steam API, searches HLTB by name
6. Backend caches result to disk and returns data
7. If data was stale, the client triggers a background `GetHltbData(app_id, fallback_name, force_refresh: true)` to refresh the cache

## Key Design Decisions

- Backend is the single source of truth for all caching (no client-side cache state)
- Both library and store call the same `GetHltbData` RPC with identical behavior
- Backend handles all HLTB requests (avoids CORS, enables complex matching logic)
- MutationObserver for SPA navigation detection (Steam doesn't trigger page loads)
- Disk-based caching via Lua file I/O (persistent across restarts)
- Stale-while-revalidate caching (show cached data immediately, refresh in background)
- Levenshtein distance for fuzzy game name matching
