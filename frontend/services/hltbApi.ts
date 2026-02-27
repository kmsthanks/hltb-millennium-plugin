import { callable } from '@steambrew/client';
import type { HltbGameResult, FetchResult } from '../types';
import { log, logError } from './logger';
import { getCache, setCache } from './cache';
import { getHltbId, setIdCache } from './hltbIdCache';

interface BackendResponse {
  success: boolean;
  error?: string;
  data?: HltbGameResult;
}

interface SteamImportResponse {
  success: boolean;
  error?: string;
  data?: Array<{ steam_id: number; hltb_id: number }>;
}

const GetHltbData = callable<[{ app_id: number; fallback_name?: string }], string>('GetHltbData');
const GetHltbDataById = callable<[{ hltb_id: number; app_id: number }], string>('GetHltbDataById');
const FetchSteamImportRpc = callable<[{ steam_user_id: string }], string>('FetchSteamImport');

async function fetchFromBackend(appId: number, gameName?: string): Promise<HltbGameResult | null> {
  try {
    // Check if we have a cached HLTB ID for this app
    const hltbId = getHltbId(appId);

    let resultJson: string;

    if (hltbId) {
      // Fetch directly by HLTB ID (skips name search)
      resultJson = await GetHltbDataById({ hltb_id: hltbId, app_id: appId });
    } else {
      // Standard path: name-based search (with optional fallback name for non-Steam games)
      log('Calling backend for appId:', appId);
      resultJson = await GetHltbData({ app_id: appId, fallback_name: gameName });
    }

    if (resultJson === undefined || resultJson === null) {
      logError('Backend returned undefined/null for appId:', appId);
      return null;
    }

    const result: BackendResponse = JSON.parse(resultJson);
    log('Backend response:', result);

    if (!result.success) {
      log('Backend error:', result.error);
      return null;
    }

    // Cache all results (UI needs data even for misses)
    if (result.data) {
      log('Caching data for appId:', appId, result.data);
      setCache(appId, result.data);
      return result.data;
    }

    log('No data in response for appId:', appId);
    return null;
  } catch (e) {
    logError('Backend call error for appId:', appId, e);
    return null;
  }
}

export async function fetchHltbData(appId: number, gameName?: string): Promise<FetchResult> {
  const cached = getCache(appId);

  if (cached) {
    const cachedData = cached.entry.notFound ? null : cached.entry.data;
    // Always refetch if no game_id (miss) so name fixes can take effect
    const isMiss = cachedData && !cachedData.game_id;
    const shouldRefresh = cached.isStale || isMiss;
    const refreshPromise = shouldRefresh ? fetchFromBackend(appId, gameName) : null;
    log('Cache hit:', appId, cached.isStale ? '(stale)' : isMiss ? '(miss, refetching)' : '(fresh)');
    return { data: cachedData, fromCache: true, refreshPromise };
  }

  const data = await fetchFromBackend(appId, gameName);
  return { data, fromCache: false, refreshPromise: null };
}

// Initialize ID cache from Steam import (for public profiles)
// Always fetches fresh data - it's a single low-cost API call that ensures
// new library additions get ID mappings immediately.
// Returns true if cache was populated, false otherwise
export async function initializeIdCache(steamUserId: string): Promise<boolean> {
  if (!steamUserId) {
    log('No Steam user ID provided, skipping ID cache init');
    return false;
  }

  try {
    log('Fetching Steam import data for user:', steamUserId);
    const resultJson = await FetchSteamImportRpc({ steam_user_id: steamUserId });

    if (resultJson === undefined || resultJson === null) {
      log('Steam import returned null');
      return false;
    }

    const result: SteamImportResponse = JSON.parse(resultJson);

    if (!result.success) {
      log('Steam import failed:', result.error);
      return false;
    }

    if (!result.data || result.data.length === 0) {
      log('Steam import returned no mappings (profile may be private)');
      return false;
    }

    setIdCache(result.data, steamUserId);
    log('ID cache initialized with', result.data.length, 'mappings');
    return true;
  } catch (e) {
    logError('ID cache initialization error:', e);
    return false;
  }
}
