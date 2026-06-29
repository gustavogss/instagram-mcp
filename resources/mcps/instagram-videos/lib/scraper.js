// lib/scraper.js
// Navega até o perfil do Instagram e coleta URLs de posts via scroll infinito

import { sleep } from './utils.js';

// ─── Modais / popups ──────────────────────────────────────────────────────────

export async function dismissCookieConsent(page, logger) {
  const candidates = [
    'button:has-text("Allow all cookies")',
    'button:has-text("Accept All")',
    'button:has-text("Aceitar todos")',
    'button:has-text("Aceitar tudo")',
    '[data-testid="cookie-policy-dialog-accept-button"]',
  ];
  for (const sel of candidates) {
    try {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); logger.debug(`Cookie consent fechado: ${sel}`); return; }
    } catch (_) {}
  }
}

/**
 * Fecha o modal de login do Instagram.
 * O Instagram mostra este modal após um tempo para forçar o login.
 * Estratégias em ordem de confiabilidade.
 */
export async function dismissLoginModal(page, logger) {
  // Verifica se há um modal de login visível
  const hasModal = await page.evaluate(() => !!document.querySelector('div[role="dialog"]')).catch(() => false);
  if (!hasModal) return;

  const candidates = [
    // Botão "X" de fechar o modal de login (seletor atual do Instagram)
    'div[role="dialog"] button[aria-label="Close"]',
    'div[role="dialog"] button[aria-label="Fechar"]',
    // Texto "Not Now" / "Agora não"
    'div[role="dialog"] button:has-text("Not Now")',
    'div[role="dialog"] button:has-text("Agora não")',
    'div[role="dialog"] button:has-text("Not now")',
    // Fallback: último botão do modal (geralmente é o de fechar/cancelar)
    'div[role="dialog"] button:last-of-type',
  ];

  for (const sel of candidates) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        logger.debug(`Modal de login fechado: ${sel}`);
        await sleep(500);
        return;
      }
    } catch (_) {}
  }

  // Fallback: pressiona Escape para fechar o modal
  try {
    await page.keyboard.press('Escape');
    logger.debug('Modal fechado via Escape');
  } catch (_) {}
}

export async function dismissAnyModal(page) {
  try {
    const closeBtn = await page.$('button[aria-label="Close"], button[aria-label="Fechar"]');
    if (closeBtn) await closeBtn.click();
  } catch (_) {}
}

// ─── Navegação para o perfil ──────────────────────────────────────────────────

export async function navigateToProfile(page, username, logger) {
  const url = `https://www.instagram.com/${username}/`;
  logger.info(`Navegando para ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3500);

  await dismissCookieConsent(page, logger);
  await sleep(1000);
  await dismissLoginModal(page, logger);
  await sleep(1000);

  // Verifica se o perfil existe
  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  if (bodyText.includes('Sorry, this page') || bodyText.includes('página não está disponível')) {
    throw new Error(`Perfil @${username} não encontrado.`);
  }

  logger.info(`Perfil @${username} carregado com sucesso.`);
}

// ─── Scroll e coleta de URLs ──────────────────────────────────────────────────

/**
 * Extrai links de posts/reels do DOM atual.
 * Aceita tanto /reel/CODE/ quanto /username/reel/CODE/ e /p/CODE/
 */
async function extractLinksFromDom(page) {
  return page.evaluate(() => {
    const hrefs = new Set();
    document.querySelectorAll('a[href]').forEach((el) => {
      const href = el.getAttribute('href') || '';
      // Captura: /reel/CODE, /p/CODE, /tv/CODE  (com ou sem prefixo de username)
      const m = href.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (m) {
        const normalized = `https://www.instagram.com/${m[1]}/${m[2]}/`;
        hrefs.add(normalized);
      }
    });
    return [...hrefs];
  });
}

/**
 * Percorre toda a grade de posts realizando scroll infinito.
 * Retorna array de URLs únicas de posts (feed + reels + igtv).
 */
export async function loadAllPostUrls(page, logger) {
  const collected = new Set();
  let consecutiveNoNew = 0;
  const MAX_NO_NEW = 8;
  let scrollNum = 0;

  logger.info('Iniciando coleta de posts via scroll...');

  // Fecha modal antes de coletar
  await dismissLoginModal(page, logger);
  await sleep(800);

  // Coleta inicial antes de qualquer scroll
  const initial = await extractLinksFromDom(page);
  for (const url of initial) collected.add(url);
  logger.info(`Scroll 0: ${collected.size} posts encontrados (pré-scroll)`);

  while (consecutiveNoNew < MAX_NO_NEW) {
    scrollNum++;

    // Fecha modal que pode ter reaparecido
    await dismissLoginModal(page, logger);
    await dismissAnyModal(page);

    // Scroll suave para baixo
    await page.evaluate(() => {
      window.scrollBy({ top: window.innerHeight * 2, behavior: 'smooth' });
    });

    // Aguarda carregamento de novos posts
    await sleep(2200 + Math.random() * 800);

    // Fecha modal novamente (pode aparecer após scroll)
    await dismissLoginModal(page, logger);

    // Coleta links após o scroll
    const links = await extractLinksFromDom(page);
    const beforeSize = collected.size;
    for (const url of links) collected.add(url);
    const added = collected.size - beforeSize;

    logger.info(`Scroll ${scrollNum}: ${added} novos | total acumulado: ${collected.size} posts`);

    if (added > 0) {
      consecutiveNoNew = 0;
    } else {
      consecutiveNoNew++;
      logger.info(`  → sem novos posts (${consecutiveNoNew}/${MAX_NO_NEW})`);
    }

    // Verifica se chegou ao fim real da página
    const atBottom = await page.evaluate(() => {
      return (window.scrollY + window.innerHeight) >= (document.body.scrollHeight - 300);
    });

    if (atBottom && consecutiveNoNew >= 3) {
      logger.info('Fim da página detectado.');
      break;
    }
  }

  logger.info(`Total final de posts encontrados: ${collected.size}`);
  return [...collected];
}
