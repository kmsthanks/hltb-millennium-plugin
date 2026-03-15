import type { GamePageInfo, UIMode } from '../types';
import { log } from '../services/logger';

// Shared selector for finding the game page container (used by both modes)
const CONTAINER_SELECTOR = '.NZMJ6g2iVnFsOOp-lDmIP';

// Big Picture image-based fallback selectors
// Used when the route patch is unavailable. Fragile: custom logos can cause wrong appId.
const BIG_PICTURE_IMAGE_SELECTORS = {
  headerImageSelector: '._3NBxSLAZLbbbnul8KfDFjw._2dzwXkCVAuZGFC-qKgo8XB',
  fallbackImageSelector: 'img.HNbe3eZf6H7dtJ042x1vM[src*="library_hero"]',
  appIdPattern: /\/assets\/(\d+)/,
};

// Stored by the Big Picture route patch when it fires
let routePatchAppId: number | null = null;
let routePatchGameName: string | undefined = undefined;

export function setRoutePatchData(appId: number, gameName?: string): void {
  routePatchAppId = appId;
  routePatchGameName = gameName;
}

export function clearRoutePatchData(): void {
  routePatchAppId = null;
  routePatchGameName = undefined;
}

function extractGameName(appId: number): string | undefined {
  try {
    const overview = window.appStore?.GetAppOverviewByAppID(appId);
    return overview?.display_name || undefined;
  } catch {
    return undefined;
  }
}

function tryExtractFromImage(
  doc: Document,
  imageSelector: string,
  appIdPattern: RegExp
): GamePageInfo | null {
  const img = doc.querySelector(imageSelector) as HTMLImageElement | null;
  if (!img) return null;

  const src = img.src || '';
  const match = src.match(appIdPattern);
  if (!match) return null;

  const appId = parseInt(match[1], 10);
  const container = img.closest(CONTAINER_SELECTOR) as HTMLElement | null;
  if (!container) return null;

  return { appId, container };
}

export function detectGamePage(doc: Document, mode: UIMode): GamePageInfo | null {
  if (mode === 'desktop') {
    return detectDesktop(doc);
  }
  return detectBigPicture(doc);
}

// Desktop: pathname is reliable and updates on navigation.
function detectDesktop(doc: Document): GamePageInfo | null {
  if (!window.MainWindowBrowserManager?.m_lastLocation?.pathname) return null;

  const match = window.MainWindowBrowserManager.m_lastLocation.pathname.match(/\/app\/(\d+)/);
  if (!match) return null;

  const appId = parseInt(match[1], 10);
  const container = doc.querySelector(CONTAINER_SELECTOR) as HTMLElement | null;
  if (!container) return null;

  log('Detected via pathname:', appId);
  return { appId, container, gameName: extractGameName(appId) };
}

// Big Picture: pathname is stale and GetActiveAppID errors.
// Route patch (set up in observer.ts) provides appid from React component tree.
// Image-based detection is a fallback. Custom logos can cause wrong appId.
function detectBigPicture(doc: Document): GamePageInfo | null {
  // Strategy 1: appId from route patch (set by routerHook.addPatch callback)
  if (routePatchAppId) {
    const container = doc.querySelector(CONTAINER_SELECTOR) as HTMLElement | null;
    if (container) {
      log('Detected via route patch:', routePatchAppId);
      return { appId: routePatchAppId, container, gameName: routePatchGameName ?? extractGameName(routePatchAppId) };
    }
  }

  // Strategy 2: extract appId from header image URL (/assets/{appId}/...)
  // Fragile: custom logos can cause wrong appId.
  const { headerImageSelector, fallbackImageSelector, appIdPattern } = BIG_PICTURE_IMAGE_SELECTORS;
  const result =
    tryExtractFromImage(doc, headerImageSelector, appIdPattern) ||
    tryExtractFromImage(doc, fallbackImageSelector, appIdPattern);
  if (result) {
    log('Detected via image:', result.appId);
    result.gameName = extractGameName(result.appId);
    return result;
  }

  return null;
}
