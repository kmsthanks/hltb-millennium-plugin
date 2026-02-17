import type { LibrarySelectors, GamePageInfo } from '../types';

function extractGameName(appId: number): string | undefined {
  try {
    const overview = window.appStore?.GetAppOverviewByAppID(appId);
    return overview?.display_name || undefined;
  } catch {
    return undefined;
  }
}

function tryExtractGamePage(
  doc: Document,
  imageSelector: string,
  containerSelector: string,
  appIdPattern: RegExp
): GamePageInfo | null {
  const img = doc.querySelector(imageSelector) as HTMLImageElement | null;
  if (!img) return null;

  const src = img.src || '';
  const match = src.match(appIdPattern);
  if (!match) return null;

  const appId = parseInt(match[1], 10);
  const container = img.closest(containerSelector) as HTMLElement | null;
  if (!container) return null;

  return { appId, container };
}

export async function detectGamePage(doc: Document, selectors: LibrarySelectors): Promise<GamePageInfo | null> {
  let result: GamePageInfo | null = null;

  // Strategy 1: Check Millennium's Location (URL path)
  // This is reliable and works even with custom art
  if (window.MainWindowBrowserManager?.m_lastLocation?.pathname) {
    const match = window.MainWindowBrowserManager.m_lastLocation.pathname.match(/\/app\/(\d+)/);
    if (match) {
      const appId = parseInt(match[1], 10);
      const container = doc.querySelector(selectors.containerSelector) as HTMLElement | null;
      if (container) {
        result = { appId, container };
      }
    }
  }

  // Strategy 2: Check Steam Client API
  // Direct internal API call, very reliable if available
  if (!result && window.SteamClient?.Apps?.GetActiveAppID) {
    try {
      // @ts-ignore - GetActiveAppID might return -1 or 0 if invalid
      const appId = await window.SteamClient.Apps.GetActiveAppID();
      if (appId > 0) {
        const container = doc.querySelector(selectors.containerSelector) as HTMLElement | null;
        if (container) {
          result = { appId, container };
        }
      }
    } catch (e) {
      console.warn('SteamClient.Apps.GetActiveAppID failed:', e);
    }
  }

  // Strategy 3 (Fallback): Legacy Image Source Check
  // Fragile: breaks with custom logos
  if (!result) {
    result =
      tryExtractGamePage(doc, selectors.headerImageSelector, selectors.containerSelector, selectors.appIdPattern) ||
      tryExtractGamePage(doc, selectors.fallbackImageSelector, selectors.containerSelector, selectors.appIdPattern);
  }

  // Enrich with game name from Steam's app store for non-Steam game fallback
  if (result) {
    result.gameName = extractGameName(result.appId);
  }

  return result;
}
