import type { LibrarySelectors } from '../types';
import { log } from '../services/logger';
import { fetchHltbData } from '../services/hltbApi';
import { getCache } from '../services/cache';
import { getSettings } from '../services/settings';
import { detectGamePage } from './detector';
import {
  createDisplay,
  getExistingDisplay,
  removeExistingDisplay,
} from '../display/components';
import { injectStyles } from '../display/styles';

let currentAppId: number | null = null;
let processingAppId: number | null = null;
let currentDoc: Document | null = null;
let observer: MutationObserver | null = null;

export function resetState(): void {
  currentAppId = null;
  processingAppId = null;
  currentDoc = null;
}

export function refreshDisplay(): void {
  if (!currentDoc || !currentAppId) return;

  const existing = getExistingDisplay(currentDoc);
  if (!existing) return;

  const cached = getCache(currentAppId);
  const data = cached?.entry?.data;
  if (!data) return;

  const settings = getSettings();
  existing.replaceWith(createDisplay(currentDoc, settings, data));
}

async function handleGamePage(doc: Document, selectors: LibrarySelectors): Promise<void> {
  const gamePage = await detectGamePage(doc, selectors);
  if (!gamePage) {
    // Silent return - game page not detected (common during DOM transitions)
    return;
  }

  const { appId, container, gameName } = gamePage;

  // Already processing this specific app - prevent re-entry from MutationObserver
  if (appId === processingAppId) {
    return;
  }

  // Check if display already exists for this app and has content
  // (Steam can clear children on hover, leaving an empty container)
  const existingDisplay = getExistingDisplay(doc);
  if (appId === currentAppId && existingDisplay && existingDisplay.children.length > 0) {
    return;
  }

  // Set processing lock before any DOM modifications
  processingAppId = appId;
  currentAppId = appId;
  currentDoc = doc;
  log('Found game page for appId:', appId);

  const settings = getSettings();

  try {
    removeExistingDisplay(doc);

    // Ensure container has relative positioning for absolute child
    container.style.position = 'relative';
    container.appendChild(createDisplay(doc, settings)); // undefined data = loading state

    log('Fetching HLTB data for appId:', appId, gameName ? `(name: ${gameName})` : '');
    const result = await fetchHltbData(appId, gameName);

    const updateDisplayForApp = (targetAppId: number) => {
      const existing = getExistingDisplay(doc);
      if (!existing) return false;

      const cached = getCache(targetAppId);
      const data = cached?.entry?.data;

      if (data) {
        log('Updating display:', data.game_name || data.searched_name);
        existing.replaceWith(createDisplay(doc, settings, data));
        return true;
      }
      return false;
    };

    // If game changed during fetch, update display for the new game instead
    if (currentAppId !== null && currentAppId !== appId) {
      log('Game changed during fetch, updating display for current game:', currentAppId);
      updateDisplayForApp(currentAppId);
      return;
    }

    updateDisplayForApp(appId);

    // Handle background refresh for stale data
    if (result.refreshPromise) {
      result.refreshPromise.then((newData) => {
        if (newData && currentAppId === appId) {
          updateDisplayForApp(appId);
        }
      });
    }
  } catch (e) {
    log('Error fetching HLTB data:', e);
  } finally {
    // Clear processing lock only if we're still processing this app
    if (processingAppId === appId) {
      processingAppId = null;
    }
  }
}

export function setupObserver(doc: Document, selectors: LibrarySelectors): void {
  // Clean up existing observer
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  injectStyles(doc);

  observer = new MutationObserver(() => {
    handleGamePage(doc, selectors);
  });

  observer.observe(doc.body, {
    childList: true,
    subtree: true,
  });

  log('MutationObserver set up');

  // Initial check for already-rendered game page
  handleGamePage(doc, selectors);
}

export function disconnectObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}
