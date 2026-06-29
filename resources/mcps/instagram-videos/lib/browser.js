// lib/browser.js
// Gerenciamento do navegador Playwright/Chromium com configurações anti-detecção

import { chromium } from 'playwright';

/**
 * Abre o navegador Chromium com configurações para parecer um browser real.
 * @param {object} opts
 * @param {boolean} opts.headless   Rodar sem janela (default: true)
 * @returns {{ browser, context }}
 */
export async function openBrowser({ headless = true } = {}) {
  const browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--window-size=1280,900',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  // Remove indicadores de WebDriver para evitar bloqueio
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
    window.chrome = { runtime: {} };
    delete window.__playwright;
    delete window.__pw_manual;
  });

  return { browser, context };
}

/**
 * Cria uma nova página no contexto fornecido.
 */
export async function newPage(context) {
  const page = await context.newPage();
  // Bloqueia apenas fontes pesadas para acelerar (imagens NÃO podem ser bloqueadas
  // pois o Instagram depende delas para renderizar a grade de posts)
  await page.route('**/*.{woff,woff2,ttf,eot}', (route) =>
    route.abort().catch(() => {})
  );
  return page;
}

/**
 * Fecha o navegador com segurança.
 */
export async function closeBrowser(browser) {
  try { await browser.close(); } catch (_) {}
}
