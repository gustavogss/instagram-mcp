#!/usr/bin/env node
/**
 * instagram-videos — index.js
 *
 * Modo CLI:  node index.js <username> [--visible]
 * Modo MCP:  node index.js              (sem argumentos → inicia servidor MCP via stdio)
 */

import path            from 'path';
import { fileURLToPath } from 'url';

import { Server }              from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { createLogger }                         from './lib/logger.js';
import { withRetry }                             from './lib/retry.js';
import { sleep, shortcodeFromUrl }               from './lib/utils.js';
import { openBrowser, newPage, closeBrowser }   from './lib/browser.js';
import { navigateToProfile, loadAllPostUrls }   from './lib/scraper.js';
import { extractVideoMetadata }                  from './lib/extractor.js';
import { loadExistingCsv, mergeAndSaveCsv, saveCheckpoint, ensureCsvHeader } from './lib/csv.js';

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const CHECKPOINT_EVERY = 10; // salva CSV a cada N vídeos coletados

// ─── Orquestrador principal ───────────────────────────────────────────────────

/**
 * Executa a coleta completa de vídeos para um username.
 * @param {string}  username
 * @param {object}  opts
 * @param {boolean} opts.headless
 * @param {object}  opts.logger
 * @returns {Promise<object>} Estatísticas finais
 */
export async function runCollect(username, { headless = true, logger } = {}) {
  if (!username?.trim()) throw new Error('username é obrigatório');
  username = username.trim().replace(/^@/, '');

  const csvPath = path.join(PROJECT_ROOT, 'resources', 'videos', username, 'lista.csv');
  logger.info(`CSV de saída: ${csvPath}`);

  // Garante que o CSV existe com cabeçalho desde o início (mesmo antes de coletar)
  ensureCsvHeader(csvPath);

  // Carrega dados já existentes
  const { rows: existingRows, knownShortcodes } = loadExistingCsv(csvPath);
  logger.info(`Vídeos já existentes no CSV: ${existingRows.length}`);

  // Abre navegador
  const { browser, context } = await openBrowser({ headless });
  const stats = { found: 0, newCount: 0, existing: existingRows.length, errors: 0, csvPath };
  const collectedVideos = [];

  try {
    // ── Etapa 1: coleta URLs do perfil ──────────────────────────────────────
    const profilePage = await newPage(context);
    await withRetry(
      () => navigateToProfile(profilePage, username, logger),
      { maxAttempts: 3, baseDelayMs: 3000, logger, label: `navegar para @${username}` }
    );

    const allUrls = await loadAllPostUrls(profilePage, logger);
    await profilePage.close();

    // Filtra URLs que já conhecemos (incremental) — shortcodeFromUrl já importado no topo
    const newUrls = allUrls.filter((url) => {
      const sc = shortcodeFromUrl(url);
      return sc && !knownShortcodes.has(sc);
    });

    logger.info(`Posts para processar: ${newUrls.length} novos de ${allUrls.length} total`);
    stats.found = allUrls.length;

    // ── Etapa 2: extrai metadados de cada vídeo ──────────────────────────────
    for (let i = 0; i < newUrls.length; i++) {
      const url = newUrls[i];
      logger.info(`[${i + 1}/${newUrls.length}] Processando: ${url}`);

      try {
        const videoPage = await newPage(context);

        const video = await withRetry(
          () => extractVideoMetadata(videoPage, url, username, logger),
          { maxAttempts: 3, baseDelayMs: 2500, logger, label: url }
        );

        await videoPage.close();

        if (video) {
          collectedVideos.push(video);
          stats.newCount++;
          logger.info(`  ✓ Vídeo coletado: ${video.shortcode} | views=${video.views} | likes=${video.likes}`);
        } else {
          logger.debug(`  ↷ Post ignorado (não é vídeo): ${url}`);
        }
      } catch (err) {
        stats.errors++;
        logger.error(`  ✗ Erro ao processar ${url}: ${err.message}`);
        // Continua para o próximo vídeo
      }

      // Checkpoint periódico
      if (collectedVideos.length > 0 && collectedVideos.length % CHECKPOINT_EVERY === 0) {
        logger.info(`Checkpoint: salvando ${collectedVideos.length} vídeos coletados até agora...`);
        saveCheckpoint(csvPath, collectedVideos, existingRows);
      }

      // Pausa entre requisições para não sobrecarregar
      await sleep(1200 + Math.random() * 800);
    }

  } catch (fatalErr) {
    stats.errors++;
    logger.error(`Erro fatal durante coleta: ${fatalErr.message}`);
  } finally {
    // ── SEMPRE salva o CSV — mesmo se a coleta falhar parcialmente ────────
    try {
      const { total } = mergeAndSaveCsv(csvPath, collectedVideos, existingRows);
      stats.total = total;
    } catch (saveErr) {
      logger.error(`Falha ao salvar CSV: ${saveErr.message}`);
      stats.total = existingRows.length;
    }
    await closeBrowser(browser).catch(() => {});
  }

  // Resumo final
  logger.info('─'.repeat(60));
  logger.info(`✔ Coleta concluída para @${username}`);
  logger.info(`  Posts encontrados no perfil : ${stats.found}`);
  logger.info(`  Vídeos novos coletados      : ${stats.newCount}`);
  logger.info(`  Vídeos já existentes        : ${stats.existing}`);
  logger.info(`  Erros                       : ${stats.errors}`);
  logger.info(`  CSV salvo em               : ${stats.csvPath}`);
  logger.info('─'.repeat(60));

  return stats;
}

// ─── Modo CLI ─────────────────────────────────────────────────────────────────

async function runCli() {
  const args     = process.argv.slice(2);
  const username = args.find((a) => !a.startsWith('--'));
  const headless = !args.includes('--visible');

  if (!username) {
    process.stderr.write('Uso: npm start <username> [--visible]\n');
    process.exit(1);
  }

  const logger = createLogger('CLI');

  try {
    const stats = await runCollect(username, { headless, logger });

    // Imprime resumo em stdout (CLI-friendly)
    console.log('\n── Resumo da execução ──────────────────────────────────');
    console.log(`Posts encontrados no perfil : ${stats.found}`);
    console.log(`Vídeos novos coletados      : ${stats.newCount}`);
    console.log(`Vídeos já existentes        : ${stats.existing}`);
    console.log(`Erros                       : ${stats.errors}`);
    console.log(`CSV salvo em               : ${stats.csvPath}`);
    console.log('────────────────────────────────────────────────────────\n');
  } catch (err) {
    process.stderr.write(`[FATAL] ${err.message}\n`);
    process.exit(1);
  }
}

// ─── Modo MCP Server ──────────────────────────────────────────────────────────

async function runMcpServer() {
  const logger = createLogger('MCP');

  const server = new Server(
    { name: 'instagram-videos', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Lista de ferramentas disponíveis
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'listar_videos_instagram',
        description:
          'Usa Playwright/Chromium para navegar no Instagram e listar todos os vídeos públicos de uma conta. ' +
          'Salva o resultado em resources/videos/<username>/lista.csv (do mais novo ao mais antigo). ' +
          'Em reexecuções, insere apenas os vídeos novos no início do arquivo.',
        inputSchema: {
          type: 'object',
          properties: {
            username: {
              type: 'string',
              description: 'Nome de usuário do Instagram (com ou sem @). Ex: hojetemjp',
            },
            headless: {
              type: 'boolean',
              description: 'Se true (padrão), o navegador roda sem janela visível.',
              default: true,
            },
          },
          required: ['username'],
        },
      },
    ],
  }));

  // Execução de ferramentas
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name !== 'listar_videos_instagram') {
      return {
        content: [{ type: 'text', text: `Ferramenta desconhecida: ${name}` }],
        isError: true,
      };
    }

    try {
      const stats = await runCollect(args?.username, {
        headless: args?.headless !== false,
        logger,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
        isError: false,
      };
    } catch (err) {
      logger.error(`Erro na ferramenta: ${err.message}`);
      return {
        content: [{ type: 'text', text: `Erro: ${err.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP instagram-videos iniciado via stdio.');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const isMcp = process.argv.slice(2).every((a) => a.startsWith('--')) &&
              !process.argv.slice(2).some((a) => !a.startsWith('-'));

const hasUsername = process.argv.slice(2).some((a) => !a.startsWith('-'));

if (hasUsername) {
  runCli();
} else {
  runMcpServer();
}
