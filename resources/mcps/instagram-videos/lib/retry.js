// lib/retry.js
// Lógica de tentativas automáticas com backoff exponencial

import { sleep } from './utils.js';

/**
 * @param {Function} fn          Função assíncrona a executar
 * @param {object}   opts
 * @param {number}   opts.maxAttempts   Número máximo de tentativas (default: 3)
 * @param {number}   opts.baseDelayMs   Delay base em ms (default: 2000)
 * @param {object}   opts.logger        Logger opcional
 * @param {string}   opts.label         Rótulo para log
 */
export async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 2000, logger, label = 'operação' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delay = baseDelayMs * attempt;
      logger?.warn(`[retry] ${label} — tentativa ${attempt}/${maxAttempts} falhou: ${err.message}. Aguardando ${delay}ms...`);
      if (attempt < maxAttempts) await sleep(delay);
    }
  }
  throw lastError;
}
