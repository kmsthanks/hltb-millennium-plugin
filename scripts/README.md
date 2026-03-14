# Developer Scripts

Scripts for maintaining `game_ids.lua`.

## discover-game-ids.js

Finds games where automatic HLTB name matching fails by comparing Steam names against HLTB's known mappings. Uses the same sanitize/simplify logic as the plugin to ensure accurate results.

### Windows Setup

1. Install [Scoop](https://scoop.sh/) if you don't have it:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

2. Install dependencies:
   ```powershell
   scoop install nodejs-lts luajit luarocks
   luarocks install dkjson
   ```

3. Configure Lua to find luarocks modules (restart terminal after):
   ```powershell
   [Environment]::SetEnvironmentVariable("LUA_PATH", (luarocks path --lr-path), "User")
   [Environment]::SetEnvironmentVariable("LUA_CPATH", (luarocks path --lr-cpath), "User")
   ```

4. Verify:
   ```powershell
   node --version   # 18+
   luajit -v
   ```

### Usage

```bash
node scripts/discover-game-ids.js
```

### Configuration

Edit `PROFILES` in the script to add Steam profile IDs. Profiles must be public (game library visible without login). Find large public libraries at [steamladder.com](https://steamladder.com/ladder/games/).

### Output

**Phase 1: Validate existing game IDs** - Checks that ID-based entries reference valid HLTB games. Also flags potentially redundant entries where the sanitized Steam name would already match without intervention.

**Phase 2: Games needing new entries** - Lists games where neither sanitize nor simplify produces a match, with suggested `game_ids.lua` entries in the format `[STEAM_ID] = HLTB_ID, -- HLTB Game Name`.

## Verifying Entries via Steam API

After adding entries, verify them against Steam's API to catch mismatches:

```bash
node -e "
const ids = [APPID1, APPID2, ...];  // Add your AppIDs here
(async () => {
  for (const id of ids) {
    const r = await fetch('https://store.steampowered.com/api/appdetails?appids=' + id);
    const d = await r.json();
    const name = d[id]?.data?.name || 'N/A';
    console.log(id + ': ' + name);
    await new Promise(r => setTimeout(r, 200));
  }
})();
"
```

Compare the Steam names with the HLTB game names in the comments. Flag entries where:
- The game is completely different (wrong AppID or HLTB ID)
- The HLTB ID points to a different edition than the Steam entry
