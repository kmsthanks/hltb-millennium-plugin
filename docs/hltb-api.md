# HLTB API

HLTB does not provide a public API. The implementation is reverse-engineered from their website and may change without notice.

## Reference Implementations

- Python API: https://github.com/ScrappyCocco/HowLongToBeat-PythonAPI
- Decky plugin: https://github.com/morwy/hltb-for-deck

Our Lua implementation in `backend/hltb.lua` follows these references.

## Key Points

### Search Endpoint

The search URL is dynamically extracted from HLTB's JavaScript bundles. Fallback: `https://howlongtobeat.com/api/finder`

### Authentication

Requests require a token from the init endpoint, derived from the search URL (e.g., `/api/finder/init`). Cached for 5 minutes.

### Search Results

The search response includes completion times directly:
- `comp_main` - Main story (seconds)
- `comp_plus` - Main + extras (seconds)
- `comp_100` - Completionist (seconds)
- `game_id` - HLTB game ID
- `game_name` - Game title

Note: `profile_steam` (Steam App ID) is only available via the game detail endpoint, not search results.

### Steam Import API

HLTB provides an endpoint that returns all games in a user's Steam library along with their HLTB IDs. This bypasses name-based search entirely.

Endpoint: `POST https://howlongtobeat.com/api/steam/getSteamImportData`

Request body:
```json
{
  "steamUserId": "username_or_steam64id",
  "steamOmitData": 0
}
```

Response includes an array of games with:
- `steam_id` - Steam App ID
- `hltb_id` - HLTB game ID
- `steam_name` - Game name on Steam
- `hltb_name` - Game name on HLTB
- `hltb_time` - Completion time in seconds

Requires the Steam profile to be public. Returns null for private profiles.

### Game Data by ID

When we have an HLTB ID (from Steam import cache), we can fetch game data directly:

Endpoint: `GET https://howlongtobeat.com/_next/data/{buildId}/game/{gameId}.json`

This returns full game details including completion times without needing to search.

### Game Matching (Name-Based Fallback)

When no cached HLTB ID exists, we fall back to name-based search.

Priority order:
1. Exact name match (free - uses search results)
2. Levenshtein distance (free - uses search results)
3. Steam ID verification (requires additional HTTP call per candidate)
