import { callable } from '@steambrew/client';
import type { HltbGameResult, FetchResult } from '../types';
import { log, logError } from './logger';
import { getCache, updateLocalCache } from './cache';

interface BackendResponse {
  success: boolean;
  error?: string;
  data?: HltbGameResult;
  fromCache?: boolean;
  isStale?: boolean;
}

const GetHltbData = callable<[{ app_id: number; fallback_name?: string; force_refresh?: boolean }], string>('GetHltbData');
const InitIdCacheRpc = callable<[{ steam_user_id: string }], string>('InitIdCache');

async function fetchFromBackend(appId: number, gameName?: string, forceRefresh?: boolean): Promise<BackendResponse | null> {
  try {
    log('Calling backend for appId:', appId, forceRefresh ? '(force refresh)' : '');
    const resultJson = await GetHltbData({ app_id: appId, fallback_name: gameName, force_refresh: forceRefresh });

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

    // Update local in-memory cache (including notFound results)
    updateLocalCache(appId, result.data ?? null);

    return result;
  } catch (e) {
    logError('Backend call error for appId:', appId, e);
    return null;
  }
}

export async function fetchHltbData(appId: number, gameName?: string): Promise<FetchResult> {
  const response = await fetchFromBackend(appId, gameName);

  if (!response) {
    return { data: null, fromCache: false, refreshPromise: null };
  }

  const data = response.data ?? null;

  // If backend returned stale cached data, trigger background refresh
  // Also refetch if no game_id (miss) so name fixes can take effect
  const isMiss = data && !data.game_id;
  const shouldRefresh = response.isStale || isMiss;

  if (response.fromCache && shouldRefresh) {
    log('Cache hit:', appId, response.isStale ? '(stale)' : '(miss, refetching)');
    const refreshPromise = fetchFromBackend(appId, gameName, true).then((r) => r?.data ?? null);
    return { data, fromCache: true, refreshPromise };
  }

  return { data, fromCache: response.fromCache ?? false, refreshPromise: null };
}

export async function initializeIdCache(steamUserId: string): Promise<boolean> {
  if (!steamUserId) {
    log('No Steam user ID provided, skipping ID cache init');
    return false;
  }

  try {
    log('Initializing ID cache for user:', steamUserId);
    const resultJson = await InitIdCacheRpc({ steam_user_id: steamUserId });

    if (resultJson === undefined || resultJson === null) {
      log('InitIdCache returned null');
      return false;
    }

    const result = JSON.parse(resultJson);

    if (!result.success) {
      log('InitIdCache failed:', result.error);
      return false;
    }

    log('ID cache initialized', result.alreadyValid ? '(already valid)' : '');
    return true;
  } catch (e) {
    logError('ID cache initialization error:', e);
    return false;
  }
}
