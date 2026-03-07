# Store Page Integration

Display HLTB completion times on Steam store app pages (`store.steampowered.com/app/*`), in addition to the existing library integration.

## Background

Feature request: users want to see HLTB data while browsing the Steam store, before purchasing a game. The Chrome extension "HLTB for Steam" does this in browsers, but doesn't work reliably in the Steam client via Extendium.

## Millennium's Webkit Module

Millennium plugins can have two frontend entry points:

- `frontend/index.tsx` - runs in the Steam client React UI (library, settings, etc.). Uses `@steambrew/client`.
- `webkit/index.tsx` - runs on Steam web pages (store, community, etc.). Uses `@steambrew/webkit`.

The build system (`millennium-ttc`) auto-detects `webkit/index.tsx` and compiles it to `.millennium/Dist/webkit.js`. This script is injected by Millennium into all Steam web views.

Key differences from the frontend module:

| Aspect | Frontend (`@steambrew/client`) | Webkit (`@steambrew/webkit`) |
|--------|-------------------------------|------------------------------|
| Runs on | Steam client React UI | Steam web pages (store, community) |
| React/DOM | Steam's internal React components | Standard browser DOM |
| Backend calls | `callable` from `@steambrew/client` | `callable` from `@steambrew/webkit` |
| Globals | `window.appStore`, `SteamClient`, etc. | Standard `window`, `document` |
| Hot reload | F5 in Steam window | F5 in Steam window |

The webkit `callable` requires a `webkit:` prefix internally (handled by the build system's `__wrapped_callable__`), but the developer-facing API is the same.

### Webkit module structure

```
webkit/
  index.tsx          -- entry point (default export called by Millennium)
  tsconfig.json      -- separate TypeScript config
  ...other files...
```

The entry point must export a default function. It runs once per page load. The build system enforces that `@steambrew/client` is never imported from webkit and vice versa.

Reference: the transpiler source at `node_modules/@steambrew/ttc/src/transpiler.ts` shows the build pipeline.

## DOM Injection Points on Store Pages

### Research across reference projects

Four projects that inject content into Steam store app pages were examined:

#### AugmentedSteam (browser extension)
- Source: https://github.com/IsThereAnyDeal/AugmentedSteam
- HLTB feature: `src/js/Content/Features/Store/App/FHowLongToBeat.ts`
- Injection target: `div.game_details` - inserts before its next sibling within the parent
- This is the right-column sidebar containing developer, publisher, release date, tags

#### SteamDB Browser Extension
- Source: https://github.com/SteamDatabase/BrowserExtension
- Store app script: `scripts/store/app.js`
- Uses multiple injection points:
  - `#game_area_purchase` - purchase/price section
  - `.game_meta_data` - stats widget container
  - `.apphub_OtherSiteInfo` - external links section
  - `.release_date` - release date area
  - `#appDetailsUnderlinedLinks .linkbar:last-child` - social links bar

#### steam-hltb-integration (Chrome extension)
- Source: https://github.com/sidmittal32/steam-hltb-integration
- Injection target: `.game_details` (appends HLTB card)
- Game name source: `.apphub_AppName`

#### Steam HLTB (Greasemonkey userscript)
- Source: https://greasyfork.org/en/scripts/419033-steam-hltb
- Injection target: after `.game_description_snippet`
- Game name source: `.apphub_AppName`

### Recommended injection point

`div.game_details` is the most commonly used target across projects. It's the right-column sidebar on store pages. Rationale:

- Stable, semantic selector (less likely to break than obfuscated class names)
- Natural location for game metadata (near developer, publisher, release date)
- Close to the purchase area, matching the user's request
- Proven across multiple independent implementations

### React vs legacy store pages

Steam is gradually migrating store pages to React. Detection method (from AugmentedSteam Millennium port):

```typescript
const isReactPage = document.querySelector('[data-react-nav-root]') !== null;
```

What changes between React and legacy pages:

- Header/navigation structure and selectors differ significantly
- React pages use `#StoreTemplate` as root; legacy uses `.responsive_page_content`
- Menu selectors: `header nav + div` (React) vs `#global_action_menu` (legacy)

However, the game content area (where `div.game_details` lives) has not been migrated to React yet. The AugmentedSteam extension's `FHowLongToBeat` feature uses the same `div.game_details` selector regardless of the React flag. When Steam eventually migrates app pages, the selector will need updating.

Reference: `webkit/header.ts` from the AugmentedSteam Millennium plugin shows React detection and creates different fake headers per page type.

## Implementation Plan

### File structure

```
webkit/
  index.tsx          -- entry point, URL detection, orchestration
  storePage.ts       -- DOM injection logic for store pages
  hltbApi.ts         -- backend calls via webkit callable
  styles.ts          -- store page CSS
  tsconfig.json      -- TypeScript config
```

### Step 1: webkit/tsconfig.json

Standard TypeScript config. Must be separate from `frontend/tsconfig.json` because it targets different module types.

### Step 2: webkit/index.tsx (entry point)

Default export function called by Millennium on every web page load.

Logic:
1. Check `window.location.href` against `/store\.steampowered\.com\/app\/(\d+)/`
2. If no match, return immediately (bail out fast on non-app pages)
3. Extract app ID from the URL
4. Call `storePage.ts` to inject HLTB data

### Step 3: webkit/hltbApi.ts (backend communication)

Use `callable` from `@steambrew/webkit` to call the existing Lua backend functions. No backend changes needed.

```typescript
import { callable } from '@steambrew/webkit';

const GetHltbData = callable<[{ app_id: number }], string>('GetHltbData');
```

Simpler than the frontend version:
- No ID cache (store pages don't have access to the Steam user ID for HLTB import)
- No stale-while-revalidate (store pages are one-shot views)
- Simple localStorage cache to avoid re-fetching on revisit

### Step 4: webkit/styles.ts (store page CSS)

New styles that fit the Steam store page aesthetic. Unlike the library overlay (absolute-positioned on the header image), the store version should be an inline block that fits into the page flow near `div.game_details`.

### Step 5: webkit/storePage.ts (DOM injection)

1. Wait for `div.game_details` to exist (use `Millennium.findElement` or polling)
2. Create HLTB display element
3. Insert into/near `div.game_details`
4. Fetch data from backend and update display

Game name can be read from `.apphub_AppName` as a fallback, but the primary approach is passing the app ID to the backend (which looks up the name via Steam API).

### Backend changes

None required. The existing `GetHltbData` Lua function accepts `app_id` and optionally `fallback_name`, and returns HLTB completion times. The webkit module calls it the same way the frontend does.

## Shared Settings via Lua Backend

### Problem

The plugin now has two frontend modules (library and store) that need shared settings. The frontend module runs in the Steam client UI and the webkit module runs in store web pages - these are different browser contexts with separate `localStorage`. Settings stored in one are invisible to the other.

### Millennium's built-in settings system

Millennium's SDK includes `BindPluginSettings` and `DefinePluginSetting` which create a Proxy-based settings store with types like `CheckBox`, `DropDown`, `NumberSlider`, etc. The system auto-syncs between modules via IPC, and `__millennium_plugin_settings_parser__` handles backend persistence.

However, this system is:
- Undocumented (no examples in official docs)
- Unused by any known plugin (Gratitude, AugmentedSteam, Extendium all roll their own)
- Potentially incomplete on the Lua side (the Python implementation is a placeholder returning `false`)

### Chosen approach: Lua backend file I/O

Store settings as a JSON file managed by the Lua backend. Both frontend and webkit call backend functions via `callable` to read/write settings. This is the same pattern used by the Gratitude plugin (the only other Lua Millennium plugin with both frontend and webkit modules).

Reference: https://github.com/BlythT/Gratitude-Millennium-Plugin

### Settings schema

```json
{
  "showInLibrary": true,
  "showInStore": true,
  "showViewDetails": true,
  "alignRight": true,
  "alignBottom": true,
  "horizontalOffset": 0,
  "verticalOffset": 0
}
```

All settings move from frontend localStorage to the backend JSON file. The file is stored alongside the plugin (e.g., `settings.json` in the plugin root).

### Data flow

Saving (frontend only - settings UI is only in the frontend):
1. User changes a setting in the settings panel
2. Frontend calls `SaveSettings({ settings_json })` backend function
3. Backend writes JSON to `settings.json`
4. Frontend updates its in-memory cache

Reading (both modules):
1. Module calls `GetSettings()` backend function
2. Backend reads `settings.json` (or returns defaults if missing)
3. Module receives settings JSON and uses it

The frontend caches settings in memory after the initial load so that `getSettings()` remains synchronous for the observer and display code. The webkit module calls `GetSettings` once per page load.

### Migration

On first load after the update, the backend returns defaults (file doesn't exist yet). The frontend's old localStorage settings are lost, but the defaults match what most users have. This is acceptable for a minor version bump.

## Risks and Open Questions

- DOM selector stability: `div.game_details` could change when Steam migrates app pages to React. Monitor the AugmentedSteam project for selector updates.
- Page load timing: the webkit script may run before store page DOM is fully rendered. Need to wait for target elements.
- Age-gated pages: some store pages show an age verification gate before the actual content. The script should handle this gracefully (either wait for the real page or skip).
- Steam client vs browser differences: store page HTML in the Steam client may differ slightly from browser rendering. Selectors need to be verified in-client.

## References

### Millennium webkit module
- Build system: `node_modules/@steambrew/ttc/src/transpiler.ts` (local)
- Webkit API: `node_modules/@steambrew/webkit/src/index.ts` (local)
- Docs: https://docs.steambrew.app/plugins/ts/README

### Reference implementations (webkit-based Millennium plugins)
- AugmentedSteam Millennium plugin: https://github.com/BossSloth/AugmentedSteam-Extension-Plugin (webkit/ folder)
- SteamDB Millennium plugin (archived): https://github.com/BossSloth/Steam-SteamDB-extension
- Extendium (Chrome extension support): https://github.com/BossSloth/Extendium

### Reference implementations (browser extensions injecting into store pages)
- AugmentedSteam (HLTB feature): https://github.com/IsThereAnyDeal/AugmentedSteam - `src/js/Content/Features/Store/App/FHowLongToBeat.ts`
- SteamDB extension: https://github.com/SteamDatabase/BrowserExtension - `scripts/store/app.js`
- steam-hltb-integration: https://github.com/sidmittal32/steam-hltb-integration
- Steam HLTB userscript: https://greasyfork.org/en/scripts/419033-steam-hltb

### Feature request context
- Chrome extension referenced by user: https://chromewebstore.google.com/detail/hltb-for-steam/cmdknlhmnkeilgeekfmndhokneknihmi
