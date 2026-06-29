// lib/csv.js
// Leitura, escrita e merge do arquivo CSV de vídeos

import fs   from 'fs';
import path from 'path';

export const CSV_HEADER = 'shortcode,url,published_at,timestamp,likes,views,duration,caption,thumbnail,username,type';
const FIELDS = CSV_HEADER.split(',');

// ─── Escape / unescape de campos CSV ─────────────────────────────────────────

function escapeField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Sempre encapsula em aspas se contém vírgula, aspas ou quebra de linha
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseLine(line) {
  const fields = [];
  let inQuote = false;
  let cur     = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      fields.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  const obj = {};
  FIELDS.forEach((f, i) => { obj[f] = fields[i] ?? ''; });
  return obj;
}

function videoToLine(v) {
  return FIELDS.map((f) => escapeField(v[f])).join(',');
}

// ─── Operações de arquivo ─────────────────────────────────────────────────────

/**
 * Carrega o CSV existente e retorna array de objetos + set de shortcodes.
 */
export function loadExistingCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return { rows: [], knownShortcodes: new Set() };

  const content = fs.readFileSync(csvPath, 'utf8').trim();
  const lines   = content.split('\n').filter(Boolean);
  if (lines.length <= 1) return { rows: [], knownShortcodes: new Set() };

  const rows = lines.slice(1).map(parseLine);
  const knownShortcodes = new Set(rows.map((r) => r.shortcode).filter(Boolean));
  return { rows, knownShortcodes };
}

/**
 * Faz merge dos vídeos novos com os existentes e salva o CSV.
 * Novos vídeos vão para o início. Ordenação final: mais novo → mais antigo.
 *
 * @param {string}   csvPath
 * @param {object[]} newVideos    Vídeos recém-coletados
 * @param {object[]} existingRows Linhas já existentes no CSV
 * @returns {{ total: number, newCount: number }}
 */
export function mergeAndSaveCsv(csvPath, newVideos, existingRows) {
  // Evita duplicatas por shortcode
  const existingCodes = new Set(existingRows.map((r) => r.shortcode).filter(Boolean));
  const deduped       = newVideos.filter((v) => v.shortcode && !existingCodes.has(v.shortcode));

  // Une e ordena do mais novo para o mais antigo
  const merged = [...deduped, ...existingRows].sort((a, b) => {
    const ta = Number(a.timestamp) || 0;
    const tb = Number(b.timestamp) || 0;
    return tb - ta;
  });

  // Garante que o diretório existe
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });

  const lines = [CSV_HEADER, ...merged.map(videoToLine)];
  fs.writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8');

  return { total: merged.length, newCount: deduped.length };
}

/**
 * Salva parcialmente os vídeos coletados até o momento (checkpoint).
 * Faz merge com o CSV existente sem sobrescrever dados anteriores.
 */
export function saveCheckpoint(csvPath, videos, existingRows) {
  if (videos.length === 0) return;
  mergeAndSaveCsv(csvPath, videos, existingRows);
}

/**
 * Garante que o arquivo CSV existe com o cabeçalho correto.
 * Cria o diretório e o arquivo se necessário.
 * Se o arquivo já existir, não o modifica.
 */
export function ensureCsvHeader(csvPath) {
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, CSV_HEADER + '\n', 'utf8');
  }
}
