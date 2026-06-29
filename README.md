# Recursos do Projeto: Instagram Video Metadata Scraper (MCP & CLI)

Este diretório contém a infraestrutura, prompts de referência, códigos do servidor MCP/CLI e os dados persistidos de extração de vídeos públicos do Instagram.

---

## 📁 Estrutura de Diretórios

O diretório de recursos está estruturado da seguinte forma:

```
resources/
├── README.md               # Este arquivo de documentação do diretório
├── prompts/                # Prompts de contexto e instruções para IA
│   └── 1-mcp-lista-instagram.txt
├── mcps/                   # Servidores de Model Context Protocol (MCP)
│   └── instagram-videos/   # Projeto Node.js com Playwright (Chromium)
│       ├── index.js        # Entrada principal (Dual-mode: CLI & MCP stdio)
│       ├── package.json    # Dependências e scripts
│       └── lib/            # Módulos auxiliares de extração e persistência
│           ├── browser.js  # Launchers com anti-detecção e interceptores
│           ├── scraper.js  # Fluxos de scroll e bypass de modais de login
│           ├── extractor.js# Coletores resilientes (JSON-LD, OpenGraph, DOM)
│           ├── csv.js      # Manipulação de CSV e checkpoints
│           ├── retry.js    # Utilitário de retentativa com backoff exponencial
│           └── logger.js   # Logs limpos no canal stderr
└── videos/                 # Base de dados em CSV estruturada por canal
    └── hojetemjp/
        └── lista.csv       # Lista incremental de vídeos coletados
```

---

## ⚙️ Como Funciona o Motor de Scraping

O scraper foi desenvolvido para contornar de forma robusta e legítima as principais barreiras que o Instagram impõe para navegações automatizadas não autenticadas:

1. **Anti-Detecção (Evasão):** O Playwright é configurado para desabilitar flags de automação no Chromium (como o `navigator.webdriver`), emular agentes de usuário e viewports reais e bloquear fontes web desnecessárias.
2. **Resiliência a Modais de Login:** O robô monitora a presença de caixas de diálogo (`role="dialog"`) e cookies popups e os fecha de maneira automatizada através de cliques estruturados ou enviando o comando `Escape` para o teclado, garantindo que o scroll continue funcionando.
3. **Extração Multi-Nível (3 Frentes):**
   * **JSON-LD:** Tenta ler o objeto estruturado `VideoObject` presente em scripts embutidos na página.
   * **Meta Tags Open Graph:** Lê metadados de compartilhamento (ex: `og:description` e `og:image`).
   * **DOM Fallback:** Utiliza seletores genéricos em elementos nativos de data, descrição e curtidas se as opções anteriores falharem.
4. **Execução Incremental:** Em novas rodadas, o sistema lê a `lista.csv` local e pula a navegação para os vídeos que já possuem o seu `shortcode` cadastrado, minimizando o tráfego de rede e o risco de bloqueios.

---

## 🚀 Instalação e Configuração Rápida

### Pré-requisitos
* Node.js v18 ou superior instalado.

### Passo 1: Instalar dependências do MCP
Entre na pasta do MCP e rode a instalação do Node.js. O script de pós-instalação se encarregará de baixar a versão portátil adequada do Chromium:
```bash
cd resources/mcps/instagram-videos
npm install
```

---

## 🛠️ Como Utilizar

### Modo 1: Execução CLI (Terminal)
Ideal para executar a raspagem de forma isolada ou monitorada.

* **Execução padrão (oculta/headless):**
  ```bash
  npm start <username>
  ```
  Exemplo: `npm start hojetemjp`

* **Execução em Modo Depuração (Janela Visível):**
  ```bash
  npm start <username> -- --visible
  ```
  *Útil para auditar o comportamento do robô ao rolar a grade de fotos e fechar modais de login.*

---

### Modo 2: Servidor MCP (Integração com Claude Desktop)
Para permitir que o seu assistente de Inteligência Artificial utilize este scraper sob demanda:

1. Abra o arquivo de configuração do seu Claude Desktop (geralmente em `~/.config/Claude/claude_desktop_config.json` no Linux).
2. Insira a configuração abaixo:

```json
{
  "mcpServers": {
    "instagram-videos": {
      "command": "node",
      "args": [
        "/caminho/completo/para/resources/mcps/instagram-videos/index.js"
      ]
    }
  }
}
```
*(Substitua `/caminho/completo/para/` pelo caminho absoluto do repositório no seu computador).*

3. Reinicie o Claude Desktop. A ferramenta `listar_videos_instagram` estará disponível.

---

## 📊 Formato dos Dados Coletados (`lista.csv`)

O arquivo CSV gerado na pasta `resources/videos/<username>/lista.csv` é salvo com o seguinte cabeçalho e formato:

| Coluna | Descrição | Exemplo |
| :--- | :--- | :--- |
| `shortcode` | Identificador único do post | `DaJqLnShg1L` |
| `url` | Link completo do post | `https://www.instagram.com/reel/DaJqLnShg1L/` |
| `published_at` | Data de publicação (ISO 8601) | `2026-06-29T01:12:58.000Z` |
| `timestamp` | Unix timestamp do post | `1782695578000` |
| `likes` | Quantidade de curtidas | `1439` |
| `views` | Quantidade de visualizações (se aplicável) | `10243` |
| `duration` | Duração do vídeo formatada | `0:30` |
| `caption` | Descrição textual limpa do post | `Siga @joaopessoapboficial...` |
| `thumbnail` | URL temporária da imagem de miniatura | `https://scontent...` |
| `username` | Nome da conta raspada | `hojetemjp` |
| `type` | Tipo de post | `reel`, `feed` ou `igtv` |
