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

// Library selectors for finding game pages
export interface LibrarySelectors {
  containerSelector: string;
}

export const LIBRARY_SELECTORS: LibrarySelectors = {
  containerSelector: '.NZMJ6g2iVnFsOOp-lDmIP',
};

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
