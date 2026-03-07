import { Millennium } from '@steambrew/webkit';
import { fetchHltbData } from './hltbApi';
import { injectStyles } from './styles';

const CONTAINER_ID = 'hltb-store-data';

function formatTime(hours: number | null | undefined): string {
  if (!hours || hours === 0) return '--';
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins}m`;
  }
  return `${hours}h`;
}

function createLoadingDisplay(): HTMLElement {
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.innerHTML = `
    <p class="hltb-store-title">How Long To Beat</p>
    <span class="hltb-store-loading">Loading...</span>
  `;
  return container;
}

interface HltbGameResult {
  searched_name: string;
  game_id?: number;
  game_name?: string;
  comp_main?: number | null;
  comp_plus?: number | null;
  comp_100?: number | null;
}

function createDataDisplay(data: HltbGameResult): HTMLElement {
  const container = document.createElement('div');
  container.id = CONTAINER_ID;

  const stats = [
    { label: 'Main Story', value: data.comp_main },
    { label: 'Main + Extras', value: data.comp_plus },
    { label: 'Completionist', value: data.comp_100 },
  ];

  const rows = stats
    .map(s => `<div class="hltb-store-row">${s.label}<span>${formatTime(s.value)}</span></div>`)
    .join('');

  let linkHtml: string;
  if (data.game_id) {
    linkHtml = `<a class="hltb-store-link" href="https://howlongtobeat.com/game/${data.game_id}" target="_blank">View on HowLongToBeat</a>`;
  } else {
    const query = encodeURIComponent(data.searched_name);
    linkHtml = `<a class="hltb-store-link" href="https://howlongtobeat.com/?q=${query}" target="_blank">Search on HowLongToBeat</a>`;
  }

  container.innerHTML = `
    <p class="hltb-store-title">How Long To Beat</p>
    <div class="hltb-store-rows">${rows}</div>
    ${linkHtml}
  `;

  return container;
}

export async function initStorePage(appId: number): Promise<void> {
  injectStyles();

  // Wait for the game details sidebar to appear
  let gameDetails: Element;
  try {
    const elements = await Millennium.findElement(document, 'div.game_details', 5000);
    gameDetails = elements[0];
  } catch {
    console.warn('[HLTB] div.game_details not found, skipping store page injection');
    return;
  }

  if (!gameDetails) return;

  // Don't inject twice
  if (document.getElementById(CONTAINER_ID)) return;

  // Insert loading state before game_details
  const loading = createLoadingDisplay();
  gameDetails.parentElement?.insertBefore(loading, gameDetails);

  // Get fallback game name from the page
  const nameEl = document.querySelector('.apphub_AppName');
  const fallbackName = nameEl?.textContent?.trim();

  // Fetch data
  const data = await fetchHltbData(appId, fallbackName);

  // Replace loading with result
  const existing = document.getElementById(CONTAINER_ID);
  if (!existing) return;

  if (data) {
    existing.replaceWith(createDataDisplay(data));
  } else {
    existing.remove();
  }
}
