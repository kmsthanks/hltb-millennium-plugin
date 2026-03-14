import type { LibrarySelectors, GamePageInfo } from '../types';

function extractGameName(appId: number): string | undefined {
  try {
    const overview = window.appStore?.GetAppOverviewByAppID(appId);
    return overview?.display_name || undefined;
  } catch {
    return undefined;
  }
}

export function detectGamePage(doc: Document, selectors: LibrarySelectors): GamePageInfo | null {
  const pathname = window.MainWindowBrowserManager?.m_lastLocation?.pathname;
  if (!pathname) return null;

  const match = pathname.match(/\/app\/(\d+)/);
  if (!match) return null;

  const appId = parseInt(match[1], 10);
  const container = doc.querySelector(selectors.containerSelector) as HTMLElement | null;
  if (!container) return null;

  const gameName = extractGameName(appId);
  return { appId, container, gameName };
}
