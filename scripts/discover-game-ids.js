/**
 * Game ID Discovery Script
 *
 * Fetches Steam libraries via HLTB's Steam import API and identifies games
 * where automatic name matching fails, requiring manual game_ids.lua entries.
 *
 * The script uses the same sanitize/simplify logic as the plugin (via Lua)
 * to ensure consistency between discovery and runtime matching.
 *
 * Usage: node scripts/discover-game-ids.js
 *
 * Requirements:
 *   - Node.js 18+ (for native fetch)
 *   - Lua or LuaJIT with dkjson module
 *   - Public Steam profiles in PROFILES array
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Steam profiles to scan (must be public)
const PROFILES = [
  'mulard',
  '76561198017975643', // Top US Steam owner (steamladder.com/ladder/games/us)
  '76561198028121353', // Top overall Steam owner (steamladder.com/ladder/games)
  '76561198355625888',
  '76561198001237877',
  '76561198051887711',
];

const HLTB_API_URL = 'https://howlongtobeat.com/api/steam/getSteamImportData';

// Match threshold: 20% of name length, minimum 5 edits
// e.g., 30-char name allows 6 edits, 10-char name allows 5 edits
const LEVENSHTEIN_THRESHOLD = 0.2;

/**
 * Simulate HLTB's search matching behavior.
 *
 * HLTB uses greedy exact/substring matching, not fuzzy matching.
 * "Cyberpunk" finds "Cyberpunk 2077" but "Cyberpunk1" does not.
 *
 * Returns true if the search term would likely find the target on HLTB.
 */
function wouldHLTBMatch(searchTerm, targetName) {
  // Normalize: lowercase, collapse whitespace
  const normalize = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

  const search = normalize(searchTerm);
  const target = normalize(targetName);

  // Direct substring match
  if (target.includes(search)) {
    return true;
  }

  // Word-based match: all words in search appear in target
  const searchWords = search.split(' ').filter(w => w.length > 0);
  const targetWords = target.split(' ');

  return searchWords.every(sw =>
    targetWords.some(tw => tw.includes(sw) || sw.includes(tw))
  );
}

/**
 * Detect available Lua interpreter (prefers luajit)
 */
function detectLua() {
  for (const cmd of ['luajit', 'lua']) {
    try {
      execSync(`${cmd} -v`, { encoding: 'utf-8', stdio: 'pipe' });
      return cmd;
    } catch {
      // Try next
    }
  }
  return null;
}

/**
 * Process all games through Lua in one batch call
 */
function processGamesBatch(luaCmd, games) {
  const luaScript = join(ROOT_DIR, 'scripts', 'name-utils-cli.lua');
  const input = JSON.stringify({ games });

  try {
    const result = execSync(`${luaCmd} "${luaScript}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      input,
      maxBuffer: 50 * 1024 * 1024, // 50MB for large libraries
    });
    return JSON.parse(result);
  } catch (err) {
    console.error('Lua batch processing failed:', err.message);
    process.exit(1);
  }
}

function isWithinThreshold(distance, name1, name2) {
  const maxLen = Math.max(name1.length, name2.length);
  const threshold = Math.max(5, Math.floor(maxLen * LEVENSHTEIN_THRESHOLD));
  return distance <= threshold;
}

/**
 * Load existing game_ids.lua entries
 */
function loadExistingIds() {
  const idsPath = join(ROOT_DIR, 'backend', 'game_ids.lua');
  const content = readFileSync(idsPath, 'utf-8');

  const ids = new Map();
  const regex = /\[(\d+)\]\s*=\s*(\d+)\s*,\s*--\s*(.+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    ids.set(parseInt(match[1], 10), {
      hltbId: parseInt(match[2], 10),
      name: match[3].trim(),
    });
  }

  return ids;
}

/**
 * Fetch HLTB Steam import data for a profile
 */
async function fetchSteamLibrary(profile) {
  const response = await fetch(HLTB_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://howlongtobeat.com/',
    },
    body: JSON.stringify({
      steamUserId: profile,
      steamOmitData: 0,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  if (!data.games || data.games.length === 0) {
    throw new Error(`Profile "${profile}" returned no games. Is it public?`);
  }

  return data.games;
}

/**
 * Main entry point
 */
async function main() {
  console.log('Game ID Discovery & Validation Script');
  console.log('======================================\n');

  // Verify Lua is available
  const luaCmd = detectLua();
  if (!luaCmd) {
    console.error('Error: Neither luajit nor lua found in PATH');
    console.error('Install: scoop install luajit');
    process.exit(1);
  }
  console.log(`Using Lua interpreter: ${luaCmd}\n`);

  // Load existing IDs
  const existingIds = loadExistingIds();
  console.log(`Loaded ${existingIds.size} existing game ID mappings\n`);

  // Fetch all profiles
  const allGames = new Map();

  for (const profile of PROFILES) {
    console.log(`Fetching profile: ${profile}...`);
    try {
      const games = await fetchSteamLibrary(profile);
      console.log(`  Found ${games.length} games`);

      for (const game of games) {
        if (!allGames.has(game.steam_id)) {
          allGames.set(game.steam_id, game);
        }
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
  }

  console.log(`\nTotal unique games: ${allGames.size}\n`);

  // Filter games that have HLTB data and no existing ID
  const gamesToProcess = [];
  for (const [steamId, game] of allGames) {
    if (game.hltb_id && game.hltb_id !== 0 && !existingIds.has(steamId)) {
      gamesToProcess.push({
        steam_id: steamId,
        steam_name: game.steam_name,
        hltb_name: game.hltb_name,
      });
    }
  }

  console.log(`Processing ${gamesToProcess.length} games through Lua...\n`);

  // Batch process all games
  const processed = processGamesBatch(luaCmd, gamesToProcess);

  // ========================================
  // PHASE 1: Validate existing game_ids
  // ========================================
  //
  // Checks that ID-based entries reference valid HLTB games by cross-referencing
  // with the Steam import API data. Also checks for redundant entries where the
  // sanitized Steam name would already match without intervention.
  //
  console.log('='.repeat(50));
  console.log('PHASE 1: Validating existing game_ids.lua');
  console.log('='.repeat(50) + '\n');

  const validation = { correct: [], idMismatch: [], redundant: [], notInLibrary: [] };

  // Classify entries and collect redundancy check candidates
  const redundancyCandidates = [];
  const redundancyMeta = [];

  for (const [appId, entry] of existingIds) {
    const game = allGames.get(appId);
    if (!game || !game.hltb_id) {
      validation.notInLibrary.push({ appId, entry });
      continue;
    }

    if (entry.hltbId === game.hltb_id) {
      validation.correct.push({ appId, entry, game });
    } else {
      validation.idMismatch.push({ appId, entry, game });
    }

    if (game.hltb_name) {
      redundancyCandidates.push({
        steam_id: appId,
        steam_name: game.steam_name,
        hltb_name: game.hltb_name,
      });
      redundancyMeta.push({ appId, entry, game });
    }
  }

  // Batch redundancy check
  if (redundancyCandidates.length > 0) {
    const results = processGamesBatch(luaCmd, redundancyCandidates);
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const { appId, entry, game } = redundancyMeta[i];
      const sanitizedOk = (result.dist_sanitized === 0 || isWithinThreshold(result.dist_sanitized, result.sanitized, game.hltb_name))
        && wouldHLTBMatch(result.sanitized, game.hltb_name);
      const simplifiedOk = (result.dist_simplified === 0 || isWithinThreshold(result.dist_simplified, result.simplified, game.hltb_name))
        && wouldHLTBMatch(result.simplified, game.hltb_name);

      if (sanitizedOk || simplifiedOk) {
        validation.redundant.push({
          appId,
          entry,
          steamName: game.steam_name,
          hltbName: game.hltb_name,
          sanitized: result.sanitized,
        });
      }
    }
  }

  console.log(`Valid: ${validation.correct.length}`);
  console.log(`ID mismatch: ${validation.idMismatch.length}`);
  console.log(`Potentially redundant: ${validation.redundant.length}`);
  console.log(`Not in library: ${validation.notInLibrary.length}`);

  if (validation.idMismatch.length > 0) {
    console.log('\nID MISMATCHES (game_ids HLTB ID differs from API):');
    for (const { appId, entry, game } of validation.idMismatch) {
      console.log(`  [${appId}]`);
      console.log(`    game_ids HLTB ID: ${entry.hltbId}`);
      console.log(`    API HLTB ID:      ${game.hltb_id}`);
      console.log(`    API name:         "${game.hltb_name}"`);
    }
  }

  if (validation.redundant.length > 0) {
    console.log('\nPOTENTIALLY REDUNDANT (sanitized name already matches):');
    for (const { appId, steamName, hltbName, sanitized } of validation.redundant) {
      console.log(`  [${appId}]`);
      console.log(`    Steam:     "${steamName}"`);
      console.log(`    Sanitized: "${sanitized}"`);
      console.log(`    HLTB:      "${hltbName}"`);
    }
  }

  // ========================================
  // PHASE 2: Find games needing new entries
  // ========================================
  console.log('\n' + '='.repeat(50));
  console.log('PHASE 2: Games needing new game_ids');
  console.log('='.repeat(50) + '\n');

  // Find games where neither sanitize nor simplify matches
  // Uses both Levenshtein distance AND HLTB's substring matching simulation
  const needsId = [];
  for (let i = 0; i < gamesToProcess.length; i++) {
    const game = gamesToProcess[i];
    const result = processed[i];

    // Levenshtein check (fuzzy similarity)
    const sanitizedLevenshtein = result.dist_sanitized === 0 || isWithinThreshold(result.dist_sanitized, result.sanitized, game.hltb_name);
    const simplifiedLevenshtein = result.dist_simplified === 0 || isWithinThreshold(result.dist_simplified, result.simplified, game.hltb_name);

    // HLTB substring matching simulation
    const sanitizedSubstring = wouldHLTBMatch(result.sanitized, game.hltb_name);
    const simplifiedSubstring = wouldHLTBMatch(result.simplified, game.hltb_name);

    // Need entry if BOTH checks fail for BOTH sanitized and simplified
    const sanitizedOk = sanitizedLevenshtein && sanitizedSubstring;
    const simplifiedOk = simplifiedLevenshtein && simplifiedSubstring;

    if (!sanitizedOk && !simplifiedOk) {
      needsId.push({
        steamId: game.steam_id,
        steamName: game.steam_name,
        hltbName: game.hltb_name,
        hltbId: allGames.get(game.steam_id)?.hltb_id,
        sanitized: result.sanitized,
        simplified: result.simplified,
        distSanitized: result.dist_sanitized,
        distSimplified: result.dist_simplified,
        sanitizedSubstringOk: sanitizedSubstring,
        simplifiedSubstringOk: simplifiedSubstring,
      });
    }
  }

  if (needsId.length === 0) {
    console.log('No new entries needed!');
  } else {
    console.log(`Found ${needsId.length} games needing entries:\n`);

    needsId.sort((a, b) => a.steamId - b.steamId);

    console.log('Suggested game_ids.lua entries:');
    console.log('-'.repeat(40) + '\n');

    for (const entry of needsId) {
      const escapedName = entry.hltbName.replace(/"/g, '\\"');
      console.log(`    [${entry.steamId}] = ${entry.hltbId}, -- ${escapedName}`);
    }

    console.log('\n\nDetailed breakdown:');
    console.log('-'.repeat(40) + '\n');

    for (const entry of needsId) {
      console.log(`AppID ${entry.steamId}:`);
      console.log(`  Steam:      "${entry.steamName}"`);
      console.log(`  Sanitized:  "${entry.sanitized}" (dist: ${entry.distSanitized}, substr: ${entry.sanitizedSubstringOk ? 'yes' : 'no'})`);
      if (entry.simplified !== entry.sanitized) {
        console.log(`  Simplified: "${entry.simplified}" (dist: ${entry.distSimplified}, substr: ${entry.simplifiedSubstringOk ? 'yes' : 'no'})`);
      }
      console.log(`  HLTB:       "${entry.hltbName}" (ID: ${entry.hltbId})`);
      console.log();
    }
  }

  // ========================================
  // Summary
  // ========================================
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50) + '\n');

  console.log(`Total games analyzed: ${allGames.size}`);
  console.log(`Existing game_ids: ${existingIds.size} (${validation.correct.length} valid, ${validation.idMismatch.length} ID mismatch, ${validation.redundant.length} redundant)`);
  console.log(`Games needing new entries: ${needsId.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
