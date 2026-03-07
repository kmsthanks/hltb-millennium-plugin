import { callable } from '@steambrew/webkit';

interface HltbGameResult {
  searched_name: string;
  game_id?: number;
  game_name?: string;
  comp_main?: number | null;
  comp_plus?: number | null;
  comp_100?: number | null;
}

interface BackendResponse {
  success: boolean;
  error?: string;
  data?: HltbGameResult;
}

interface CacheEntry {
  data: HltbGameResult;
  timestamp: number;
}

const CACHE_KEY_PREFIX = 'hltb_store_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const GetHltbData = callable<[{ app_id: number; fallback_name?: string }], string>('GetHltbData');

function getCached(appId: number): HltbGameResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + appId);
    if (!raw) return null;

    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY_PREFIX + appId);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

function setCache(appId: number, data: HltbGameResult): void {
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY_PREFIX + appId, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable
  }
}

export async function fetchHltbData(appId: number, fallbackName?: string): Promise<HltbGameResult | null> {
  const cached = getCached(appId);
  if (cached) return cached;

  try {
    const resultJson = await GetHltbData({ app_id: appId, fallback_name: fallbackName });
    if (!resultJson) return null;

    const result: BackendResponse = JSON.parse(resultJson);
    if (!result.success || !result.data) return null;

    setCache(appId, result.data);
    return result.data;
  } catch (e) {
    console.error('[HLTB] Backend call failed:', e);
    return null;
  }
}
