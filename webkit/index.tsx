import { initStorePage } from './storePage';

const STORE_APP_PATTERN = /store\.steampowered\.com\/app\/(\d+)/;

export default async function WebkitMain() {
  const match = window.location.href.match(STORE_APP_PATTERN);
  if (!match) return;

  const appId = parseInt(match[1], 10);
  if (isNaN(appId) || appId <= 0) return;

  await initStorePage(appId);
}
