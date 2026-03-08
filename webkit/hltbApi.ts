import { callable } from '@steambrew/webkit';

export interface HltbGameResult {
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
  fromCache?: boolean;
  isStale?: boolean;
}

const GetHltbData = callable<[{ app_id: number; fallback_name?: string; force_refresh?: boolean }], string>('GetHltbData');

export async function fetchHltbData(appId: number, fallbackName?: string): Promise<HltbGameResult | null> {
  try {
    const resultJson = await GetHltbData({ app_id: appId, fallback_name: fallbackName });
    if (!resultJson) return null;

    const result: BackendResponse = JSON.parse(resultJson);
    if (!result.success || !result.data) return null;

    // Background refresh for stale data (same behavior as library)
    if (result.fromCache && (result.isStale || (result.data && !result.data.game_id))) {
      GetHltbData({ app_id: appId, fallback_name: fallbackName, force_refresh: true }).catch(() => {});
    }

    return result.data;
  } catch (e) {
    console.error('[HLTB] Backend call failed:', e);
    return null;
  }
}
