export const BROWSER_HOME = "https://novelgame.jp/";

export function isNovelGameHost(hostname) {
  const normalized = String(hostname ?? "").toLowerCase();
  return normalized === "novelgame.jp" || normalized.endsWith(".novelgame.jp");
}

export function isAllowedNavigation(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && isNovelGameHost(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeNavigation(value) {
  const input = String(value ?? "").trim();
  if (!input) return BROWSER_HOME;
  if (/^\d+$/.test(input)) return `https://novelgame.jp/games/show/${input}`;

  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  const url = new URL(withProtocol);
  if (!isAllowedNavigation(url.href)) {
    throw new Error("独立浏览器只允许访问 novelgame.jp 及其游戏子域");
  }
  url.protocol = "https:";
  return url.href;
}

export function isHostedGameUrl(value) {
  if (!isAllowedNavigation(value)) return false;
  const url = new URL(value);
  return /^\/game\/\d+\/Game\/?/i.test(url.pathname);
}

