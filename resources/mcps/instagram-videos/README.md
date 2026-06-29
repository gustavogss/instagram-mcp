# instagram-videos

MCP e CLI em Node.js para listar vídeos públicos do Instagram usando **Playwright/Chromium** — sem autenticação, sem APIs privadas.

## Como funciona

1. Abre o Chromium simulando um navegador Chrome real
2. Navega para `https://www.instagram.com/<username>/`
3. Realiza scroll infinito coletando todos os links de posts
4. Para cada post, abre a página individual e verifica se é vídeo
5. Extrai metadados (legenda, curtidas, views, data, duração, thumbnail…)
6. Salva em `resources/videos/<username>/lista.csv`

## Instalação

```bash
cd resources/mcps/instagram-videos
npm install
```

> O `postinstall` baixa automaticamente o Chromium (~130 MB).

## Uso CLI

```bash
npm start <username>           # navegador sem janela (headless)
npm start <username> -- --visible  # navegador visível (útil para debug)
```

**Exemplo:**
```bash
npm start hojetemjp
```

**Saída:**
```
── Resumo da execução ──────────────────────────────────
Posts encontrados no perfil : 124
Vídeos novos coletados      : 87
Vídeos já existentes        : 0
Erros                       : 2
CSV salvo em               : .../resources/videos/hojetemjp/lista.csv
────────────────────────────────────────────────────────
```

## Uso como MCP Server

```bash
node index.js   # inicia o servidor MCP via stdio
```

Configuração no `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "instagram-videos": {
      "command": "node",
      "args": ["/caminho/para/resources/mcps/instagram-videos/index.js"]
    }
  }
}
```

**Ferramenta disponível:** `listar_videos_instagram`

| Parâmetro  | Tipo    | Obrigatório | Descrição                       |
|------------|---------|-------------|---------------------------------|
| `username` | string  | ✅           | Usuário do Instagram (com/sem @) |
| `headless` | boolean | ❌           | `true` = sem janela (padrão)    |

## Formato do CSV

```
shortcode,url,published_at,timestamp,likes,views,duration,caption,thumbnail,username,type
```

| Campo          | Descrição                                  |
|----------------|--------------------------------------------|
| `shortcode`    | ID único do post (ex: `Cz8aXbB`)          |
| `url`          | URL completa do post                       |
| `published_at` | Data ISO 8601 de publicação                |
| `timestamp`    | Unix timestamp em ms                       |
| `likes`        | Número de curtidas                         |
| `views`        | Número de visualizações                    |
| `duration`     | Duração formatada (ex: `0:30`)             |
| `caption`      | Legenda/descrição do post                  |
| `thumbnail`    | URL da thumbnail                           |
| `username`     | Nome da conta                              |
| `type`         | `reel`, `feed`, ou `igtv`                  |

## Comportamento incremental

- Na segunda execução, o CSV existente é carregado
- Apenas posts com shortcodes desconhecidos são processados
- Novos vídeos são inseridos no início (mais novos primeiro)
- Nunca há duplicatas

## Estrutura do projeto

```
resources/mcps/instagram-videos/
├── index.js          ← Entrada principal (CLI + MCP)
├── package.json
├── README.md
└── lib/
    ├── logger.js     ← Logging para stderr
    ├── utils.js      ← Funções utilitárias
    ├── retry.js      ← Retry com backoff exponencial
    ├── browser.js    ← Gerenciamento do Chromium
    ├── scraper.js    ← Navegação e scroll no perfil
    ├── extractor.js  ← Extração de metadados do vídeo
    └── csv.js        ← Leitura/escrita/merge do CSV
```

## Observações

- O Instagram pode exibir um modal de login. O MCP fecha-o automaticamente.
- Perfis **privados** não são acessíveis sem login.
- O Instagram pode limitar o acesso após muitas requisições. Nesse caso, use `--visible` para ver o que está acontecendo.
- Todos os erros por vídeo são registrados em log, mas a execução continua.
