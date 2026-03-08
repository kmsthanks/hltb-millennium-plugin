import type { HltbGameResult, LibrarySelectors } from '../types';
import { log } from '../services/logger';
import { fetchHltbData } from '../services/hltbApi';
import { getSettings } from '../services/settings';
import { detectGamePage } from './detector';
import {
  createDisplay,
  getExistingDisplay,
  removeExistingDisplay,
} from '../display/components';
import { injectStyles } from '../display/styles';

let currentAppId: number | null = null;
let currentData: HltbGameResult | null = null;
let processingAppId: number | null = null;
let currentDoc: Document | null = null;
let observer: MutationObserver | null = null;

export function resetState(): void {
  currentAppId = null;
  currentData = null;
  processingAppId = null;
  currentDoc = null;
}

export function refreshDisplay(): void {
  if (!currentDoc || !currentAppId || !currentData) return;

  const existing = getExistingDisplay(currentDoc);

  // If display doesn't exist but should, re-trigger detection
  if (!existing) {
    const doc = currentDoc;
    currentAppId = null;
    currentData = null;
    processingAppId = null;
    // Trigger MutationObserver to re-detect and re-inject
    const marker = doc.createComment('hltb-refresh');
    doc.body.appendChild(marker);
    marker.remove();
    return;
  }

  const settings = getSettings();
  existing.replaceWith(createDisplay(currentDoc, settings, currentData));
}

async function handleGamePage(doc: Document, selectors: LibrarySelectors): Promise<void> {
  const settings = getSettings();
  if (!settings.showInLibrary) {
    removeExistingDisplay(doc);
    return;
  }

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

  try {
    removeExistingDisplay(doc);

    // Ensure container has relative positioning for absolute child
    container.style.position = 'relative';
    container.appendChild(createDisplay(doc, settings)); // undefined data = loading state

    log('Fetching HLTB data for appId:', appId, gameName ? `(name: ${gameName})` : '');
    const result = await fetchHltbData(appId, gameName);

    const updateDisplay = (data: HltbGameResult | null) => {
      if (!data) return false;
      const existing = getExistingDisplay(doc);
      if (!existing) return false;

      log('Updating display:', data.game_name || data.searched_name);
      existing.replaceWith(createDisplay(doc, settings, data));
      return true;
    };

    // If game changed during fetch, don't update display
    if (currentAppId !== null && currentAppId !== appId) {
      log('Game changed during fetch, skipping display update');
      return;
    }

    // Store and display the data
    currentData = result.data;
    updateDisplay(result.data);

    // Handle background refresh for stale data
    if (result.refreshPromise) {
      result.refreshPromise.then((newData) => {
        if (newData && currentAppId === appId) {
          currentData = newData;
          updateDisplay(newData);
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
