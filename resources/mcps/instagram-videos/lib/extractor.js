// lib/extractor.js
// Abre a página individual de um vídeo e extrai todos os metadados disponíveis

import { sleep, sanitizeText, parseNumber, shortcodeFromUrl, typeFromUrl } from './utils.js';
import { dismissLoginModal, dismissAnyModal } from './scraper.js';

// ─── Extração via meta tags OG (mais estável) ─────────────────────────────────

async function extractFromMeta(page) {
  return page.evaluate(() => {
    const g = (prop) =>
      document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)
        ?.getAttribute('content') || '';
    return {
      description:  g('og:description'),
      image:        g('og:image'),
      published:    g('article:published_time'),
      title:        g('og:title'),
      videoDur:     g('og:video:duration'),
      videoSecure:  g('og:video:secure_url'),
      type:         g('og:type'),
    };
  });
}

// ─── Extração via JSON-LD ─────────────────────────────────────────────────────

async function extractFromJsonLd(page) {
  return page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent);
        const obj  = Array.isArray(data) ? data[0] : data;
        if (obj['@type'] === 'VideoObject' || obj.uploadDate) return obj;
      } catch (_) {}
    }
    return null;
  });
}

// ─── Extração via DOM (fallback) ──────────────────────────────────────────────

async function extractFromDom(page) {
  return page.evaluate(() => {
    // Timestamp / data de publicação
    const timeEl = document.querySelector('time[datetime]');
    const datetime = timeEl?.getAttribute('datetime') || '';

    // Caption — texto do post (primeiro parágrafo após o autor)
    const captionCandidates = [
      'h1',
      'div[data-testid="post-comment-root-0"] span',
      'article div span[dir="auto"]',
      'div._a9zr span',
    ];
    let caption = '';
    for (const sel of captionCandidates) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) { caption = el.textContent.trim(); break; }
    }

    // Curtidas — busca por texto com padrão de número seguido de "likes"/"curtidas"
    let likes = '';
    const likesCandidates = [
      'section a[href*="liked_by"] span',
      'button[type="button"] span span',
      'span[class*="_aacl"]',
    ];
    for (const sel of likesCandidates) {
      const el = document.querySelector(sel);
      if (el?.textContent?.match(/\d/)) { likes = el.textContent.trim(); break; }
    }

    // Visualizações
    let views = '';
    const allSpans = [...document.querySelectorAll('span')];
    for (const span of allSpans) {
      const txt = span.textContent || '';
      if (/\d[\d,.]+\s*(views?|visualiza|plays?)/i.test(txt)) {
        views = txt.trim();
        break;
      }
    }

    return { datetime, caption, likes, views };
  });
}

// ─── Parsers de texto ─────────────────────────────────────────────────────────

/**
 * Instagram insere no og:description algo como:
 * "12,345 likes - username: caption text"
 */
function parseLikesFromOgDescription(desc = '') {
  const m = desc.match(/^([\d,.\s]+)\s+(?:likes?|curtidas?)/i);
  return m ? m[1].replace(/[,.\s]/g, '') : '';
}

function parseCaptionFromOgDescription(desc = '') {
  // Remove o prefixo de likes e username
  const m = desc.match(/-\s*[^:]+:\s*(.+)$/s);
  return m ? sanitizeText(m[1]) : sanitizeText(desc);
}

function parseIso8601Duration(dur = '') {
  if (!dur) return '';
  if (!dur.startsWith('PT')) return dur;
  const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!m) return dur;
  const h = parseInt(m[1] || 0);
  const min = parseInt(m[2] || 0);
  const s = Math.floor(parseFloat(m[3] || 0));
  if (h > 0) return `${h}:${String(min).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${min}:${String(s).padStart(2,'0')}`;
}

// ─── Função principal de extração ─────────────────────────────────────────────

/**
 * Navega para a URL do post e extrai todos os metadados disponíveis.
 * Retorna null se o post não for um vídeo.
 *
 * @param {import('playwright').Page} page
 * @param {string} url
 * @param {string} username
 * @param {object} logger
 * @returns {Promise<object|null>}
 */
export async function extractVideoMetadata(page, url, username, logger) {
  logger.debug(`Abrindo post: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(2000);

  await dismissLoginModal(page, logger);
  await dismissAnyModal(page);
  await sleep(500);

  const type = typeFromUrl(url);

  // Para /reel/ e /tv/ sempre consideramos vídeo.
  // Para /p/ verificamos se existe elemento <video> na página.
  if (type === 'feed') {
    const isVideo = await page.evaluate(() => !!document.querySelector('video'));
    if (!isVideo) {
      logger.debug(`Post de feed sem vídeo, ignorando: ${url}`);
      return null;
    }
  }

  const shortcode = shortcodeFromUrl(url);

  // Coleta dados das 3 fontes
  const [meta, jsonLd, dom] = await Promise.all([
    extractFromMeta(page).catch(() => ({})),
    extractFromJsonLd(page).catch(() => null),
    extractFromDom(page).catch(() => ({})),
  ]);

  // Monta published_at e timestamp
  const published_at =
    jsonLd?.uploadDate ||
    meta.published     ||
    dom.datetime       ||
    '';
  const timestamp = published_at ? new Date(published_at).getTime() : '';

  // Legenda
  const caption = sanitizeText(
    jsonLd?.description                           ||
    dom.caption                                   ||
    parseCaptionFromOgDescription(meta.description) ||
    ''
  );

  // Curtidas
  const likesRaw =
    jsonLd?.interactionStatistic?.find?.((s) =>
      s.interactionType?.includes('LikeAction'))?.userInteractionCount ||
    parseLikesFromOgDescription(meta.description) ||
    dom.likes ||
    '';
  const likes = parseNumber(likesRaw);

  // Visualizações
  const viewsRaw =
    jsonLd?.interactionStatistic?.find?.((s) =>
      s.interactionType?.includes('WatchAction'))?.userInteractionCount ||
    dom.views ||
    '';
  const views = parseNumber(viewsRaw);

  // Duração
  const durationRaw =
    jsonLd?.duration ||
    meta.videoDur    ||
    '';
  const duration = parseIso8601Duration(String(durationRaw));

  // Thumbnail
  const thumbnail =
    jsonLd?.thumbnailUrl ||
    meta.image           ||
    '';

  return {
    shortcode,
    url,
    published_at,
    timestamp,
    likes,
    views,
    duration,
    caption,
    thumbnail,
    username,
    type,
  };
}
