// lib/logger.js
// Logging utilities — escreve em stderr para não interferir no protocolo MCP/stdout

export function createLogger(prefix = 'instagram-videos') {
  const ts = () => new Date().toISOString();
  const fmt = (level, msg) => `[${ts()}] [${level}] [${prefix}] ${msg}\n`;

  return {
    debug: (msg) => process.stderr.write(fmt('DEBUG', msg)),
    info:  (msg) => process.stderr.write(fmt('INFO ', msg)),
    warn:  (msg) => process.stderr.write(fmt('WARN ', msg)),
    error: (msg) => process.stderr.write(fmt('ERROR', msg)),
  };
}
