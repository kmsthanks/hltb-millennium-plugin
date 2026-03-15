import type { HltbGameResult, UIMode } from '../types';
import { log } from '../services/logger';
import { fetchHltbData } from '../services/hltbApi';
import { getSettings } from '../services/settings';
import { detectGamePage, setRoutePatchData, clearRoutePatchData } from './detector';
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
let currentMode: UIMode | null = null;
let observer: MutationObserver | null = null;
let routePatchCleanup: (() => void) | null = null;

export function resetState(): void {
  currentAppId = null;
  currentData = null;
  processingAppId = null;
  currentDoc = null;
  currentMode = null;
  clearRoutePatchData();
}

export function refreshDisplay(): void {
  if (!currentDoc || !currentAppId || !currentData || !currentMode) return;

  const existing = getExistingDisplay(currentDoc);

  // If display doesn't exist but should, re-trigger detection
  if (!existing) {
    currentAppId = null;
    currentData = null;
    processingAppId = null;
    handleGamePage(currentDoc, currentMode);
    return;
  }

  const settings = getSettings();
  existing.replaceWith(createDisplay(currentDoc, settings, currentData));
}

async function handleGamePage(doc: Document, mode: UIMode): Promise<void> {
  const settings = getSettings();
  if (!settings.showInLibrary) {
    removeExistingDisplay(doc);
    return;
  }

  const gamePage = detectGamePage(doc, mode);
  if (!gamePage) {
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
    if (currentAppId !== appId) {
      log('Game changed during fetch, skipping display update');
      return;
    }

    // Store and display the data
    currentData = result.data;
    updateDisplay(result.data);

    // Handle background refresh for stale data
    if (result.refreshPromise) {
      result.refreshPromise
        .then((newData) => {
          if (newData && currentAppId === appId) {
            currentData = newData;
            updateDisplay(newData);
          }
        })
        .catch((e) => log('Background refresh failed:', e));
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

// In Big Picture, set up a route patch on /library/app/:appid to get the appId
// from React's component tree. The patch intercepts renderFunc to extract
// overview.appid, which is stored for the MutationObserver to pick up.
function setupRoutePatch(): void {
  const routerHook = (window as any).__ROUTER_HOOK_INSTANCE;
  if (!routerHook) {
    log('Router hook not available, Big Picture will use image fallback only');
    return;
  }

  const patchFn = (props: any) => {
    const renderFunc = props.children?.props?.renderFunc;
    if (renderFunc) {
      const orig = renderFunc;
      props.children.props.renderFunc = (...args: any[]) => {
        const ret = orig(...args);
        const overview = ret?.props?.children?.props?.overview;
        if (overview?.appid) {
          setRoutePatchData(overview.appid, overview.display_name);
        }
        return ret;
      };
    }
    return props;
  };

  const EUIMODE_GAMEPAD = 4;
  routerHook.addPatch('/library/app/:appid', patchFn, EUIMODE_GAMEPAD);
  routePatchCleanup = () => routerHook.removePatch('/library/app/:appid', patchFn, EUIMODE_GAMEPAD);
  log('Route patch set up for Big Picture mode');
}

export function setupObserver(doc: Document, mode: UIMode): void {
  // Clean up existing observer and route patch
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (routePatchCleanup) {
    routePatchCleanup();
    routePatchCleanup = null;
  }

  currentMode = mode;
  log('Setting up for', mode, 'mode');
  injectStyles(doc);

  if (mode === 'bigpicture') {
    setupRoutePatch();
  }

  observer = new MutationObserver(() => {
    handleGamePage(doc, mode);
  });

  observer.observe(doc.body, {
    childList: true,
    subtree: true,
  });

  log('MutationObserver set up');

  // Initial check for already-rendered game page
  handleGamePage(doc, mode);
}

export function disconnectObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (routePatchCleanup) {
    routePatchCleanup();
    routePatchCleanup = null;
  }
}
