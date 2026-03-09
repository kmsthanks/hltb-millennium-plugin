# Development

## Setup (Windows)

Prerequisites:
- Node.js: `winget install OpenJS.NodeJS` or https://nodejs.org
- Millennium: https://docs.steambrew.app/users/getting-started/installation

Clone and install:
```bash
git clone <repository-url>
cd hltb-millennium-plugin
npm install
```

Create symlink to Steam plugins folder (run as Admin):
```cmd
cmd /c mklink /D "C:\Program Files (x86)\Steam\plugins\hltb-millennium-plugin-dev" "D:\path\to\hltb-millennium-plugin"
```

## Setup (Linux)

Placeholder for future developer

## Building

- `npm run dev` - Development build
- `npm run watch` - Auto-rebuild on file changes
- `npm run build` - Production build

## Running

Start Steam with `-dev` flag for DevTools and hot reload:
```
steam -dev
```

For example with the default Windows path, from Powershell run:
```
& "C:\Program Files (x86)\Steam\steam.exe" -dev
```

For Big Picture testing:
```
steam -gamepadui -dev
```

Or launch normally and then switch to Big Picture mode.

## Testing Changes

- Frontend/webkit changes: Press F5 in Steam window
- Backend (Lua) changes: `npm run build`, then full Steam restart

## Running Lua Tests

Install dependencies (Windows with scoop):
```
scoop install lua luarocks mingw
luarocks install busted
```

Run tests:
```
busted tests/ --verbose
```

Tests also run automatically in CI on push/PR to main.

## Debugging

Open DevTools at `http://localhost:8080` (only works with `-dev` flag).

Key tabs:
- SharedJSContext - console.log output from plugins
- SP Desktop_uid0 - DOM inspection

Frontend logs use `console.log()`. Backend logs use `logger:info()` and appear in `<Steam>/logs/millennium.log`.

Debug tools are exposed via `hltbDebug` in the console:
```javascript
hltbDebug.inspectElement('#hltb-for-millennium')  // Check HLTB display element
hltbDebug.inspectElement('.NZMJ6g2iVnFsOOp-lDmIP')  // Check Steam container
await hltbDebug.cacheStats()  // View cache statistics (async, calls backend)
hltbDebug.clearCache()  // Clear the backend cache
hltbDebug.logDOM()  // Log DOM structure
```

## Common Issues

- Plugin not loading: Verify the symlink exists in Steam's plugins folder, check build output, try F5, restart Steam
- Changes not taking effect: Confirm the symlink in `C:\Program Files (x86)\Steam\plugins\` points to your working directory
- DevTools not opening: Confirm `-dev` flag, check port 8080 isn't in use
- React Error 130: Steam updated and broke selectors, check for Millennium updates
