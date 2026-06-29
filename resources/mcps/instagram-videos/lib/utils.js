// lib/utils.js
// Funções utilitárias gerais

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function sanitizeText(text = '') {
  return String(text).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseNumber(value) {
  if (!value) return '';
  const s = String(value).replace(/[.,\s]/g, '');
  const n = parseInt(s, 10);
  return isNaN(n) ? '' : n;
}

export function shortcodeFromUrl(url = '') {
  const m = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[2] : '';
}

export function typeFromUrl(url = '') {
  if (url.includes('/reel/')) return 'reel';
  if (url.includes('/tv/'))   return 'igtv';
  return 'feed';
}

export function normalizeUrl(url = '') {
  try {
    const u = new URL(url);
    return `https://www.instagram.com${u.pathname.replace(/\/$/, '')}/`;
  } catch {
    return url;
  }
}
