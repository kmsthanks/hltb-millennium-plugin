// HLTB game data from backend
export interface HltbGameResult {
  searched_name: string;       // Always present - the Steam name we searched for
  game_id?: number;            // Only present if HLTB match found
  game_name?: string;          // HLTB's name for the game (only if found)
  comp_main?: number | null;   // hours
  comp_plus?: number | null;   // hours
  comp_100?: number | null;    // hours
}

// Result from fetchHltbData with stale-while-revalidate support
export interface FetchResult {
  data: HltbGameResult | null;
  fromCache: boolean;
  refreshPromise: Promise<HltbGameResult | null> | null;
}

// UI mode determines which detection strategies to use
export type UIMode = 'desktop' | 'bigpicture';

// Detected game page info
export interface GamePageInfo {
  appId: number;
  container: HTMLElement;
  gameName?: string;
}

// Global Steam/Millennium types
declare global {
  interface Window {
    MainWindowBrowserManager?: {
      m_lastLocation: {
        pathname: string;
      };
    };
  }
}
