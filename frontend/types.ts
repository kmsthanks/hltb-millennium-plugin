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

// Shared selector for finding the game page container (used by both modes)
export const CONTAINER_SELECTOR = '.NZMJ6g2iVnFsOOp-lDmIP';

// Big Picture image-based fallback selectors
// Used when the route patch is unavailable. Fragile: custom logos can cause wrong appId.
export const BIG_PICTURE_IMAGE_SELECTORS = {
  headerImageSelector: '._3NBxSLAZLbbbnul8KfDFjw._2dzwXkCVAuZGFC-qKgo8XB',
  fallbackImageSelector: 'img.HNbe3eZf6H7dtJ042x1vM[src*="library_hero"]',
  appIdPattern: /\/assets\/(\d+)/,
};

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
