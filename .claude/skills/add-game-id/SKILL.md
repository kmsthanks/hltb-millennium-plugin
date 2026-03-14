---
name: add-game-id
description: Add a Steam-to-HLTB game ID mapping. Usage: /add-game-id <appid>, <name>, or <appid> -> <hltb_id>
allowed-tools: Read, Edit, WebFetch, WebSearch
---

# Add Game ID

Adds a Steam AppID to HLTB game ID mapping in `backend/game_ids.lua`.

## Input Formats

The skill accepts three input formats:

### 1. Steam App ID (preferred)
```
/add-game-id 1004640
```

### 2. Steam Game Name
```
/add-game-id "FINAL FANTASY TACTICS - The Ivalice Chronicles"
```

### 3. Full Mapping
```
/add-game-id 1004640 -> 169173
```

## Instructions

### If given an App ID (numeric input):
1. Fetch the Steam store page to verify the AppID exists:
   `https://store.steampowered.com/app/{APPID}`
2. Search HLTB for the game (see "Searching HLTB" below)
3. Present confirmation summary and ask user to confirm the mapping

### If given a Steam name only:
1. Search for the Steam app ID: WebSearch `{game_name} site:store.steampowered.com`
2. Extract the AppID from the Steam URL (format: `store.steampowered.com/app/{APPID}/...`)
3. Verify by fetching: `https://store.steampowered.com/app/{APPID}`
4. Search HLTB for the game (see "Searching HLTB" below)
5. Present confirmation summary and ask user to confirm the mapping

### If given a full mapping (contains ` -> `):
1. Parse the arguments to extract the AppID and HLTB ID
2. Verify the AppID by fetching: `https://store.steampowered.com/app/{APPID}`
3. Verify the HLTB ID by fetching: `https://howlongtobeat.com/game/{HLTB_ID}`
4. Proceed directly to adding the mapping

### Searching HLTB
Note: Claude cannot directly access howlongtobeat.com, so use IsThereAnyDeal as a proxy.

1. Use WebSearch: `{game_name} IsThereAnyDeal`
2. Find the IsThereAnyDeal game page in results (format: `isthereanydeal.com/game/{slug}/info/`)
3. Fetch the IsThereAnyDeal page to get the HLTB game ID and name
4. Construct the HLTB URL: `https://howlongtobeat.com/game/{id}`

### Confirmation Output Format
Always present this exact format before asking for user confirmation:
```
- **AppID:** {appid}
- **Steam name:** "{name from Steam page}"
- **HLTB ID:** {numeric ID}
- **HLTB name:** "{exact name from HLTB}"
- **HLTB page:** {URL}
```

### Adding the mapping (single entry):
1. Read `backend/game_ids.lua`
2. Find the correct position to maintain numerical order (ascending by AppID)
3. Insert the new mapping: `[{APPID}] = {HLTB_ID}, -- {HLTB game name}`
4. Report the mapping that was added

## Bulk Additions

When adding many entries at once (e.g., from discover-game-ids.js output):

1. Append all new entries to the end of the file (before the closing `}`)
2. Don't worry about sort order or duplicates
3. Run `/game-id-review` to sort numerically and remove duplicates

This is much faster than inserting each entry in the correct position.

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

## Example Workflow

For app ID 1004640:

1. Fetch Steam page: `https://store.steampowered.com/app/1004640`
2. Steam name: "FINAL FANTASY TACTICS - The Ivalice Chronicles"
3. WebSearch: "FINAL FANTASY TACTICS IsThereAnyDeal"
4. Fetch IsThereAnyDeal page to get HLTB game ID
5. Present confirmation:
   - **AppID:** 1004640
   - **Steam name:** "FINAL FANTASY TACTICS - The Ivalice Chronicles"
   - **HLTB ID:** 169173
   - **HLTB name:** "Final Fantasy Tactics: The Ivalice Chronicles"
   - **HLTB page:** https://howlongtobeat.com/game/169173
6. User confirms mapping
7. Insert into game_ids.lua in numerical order: `[1004640] = 169173, -- Final Fantasy Tactics: The Ivalice Chronicles`
