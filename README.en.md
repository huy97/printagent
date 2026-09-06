# PrintAgent

[Tiếng Việt](README.md) · **English**

A print agent that runs on a local machine and exposes an API other systems can call to print. It prints a PDF file directly, or takes a template plus JSON variables and renders the PDF on the agent side before printing.

Four ways to drive it:

| Interface | Address | Used for |
|---|---|---|
| REST API | `http://<host>:7788/api` | Web apps, backends, point-of-sale |
| WebSocket | `ws://<host>:7788/ws` | Apps that need job events in real time |
| MCP | `http://<host>:7788/mcp` (HTTP) or stdio | Claude Code, Claude Desktop, AI agents |
| Web UI | `http://<host>:7788` | Setup, printer scanning, template management, queue view |

## Requirements

- Node.js >= 20
- macOS/Linux: CUPS (`lp`, `lpstat` - already present on macOS)
- Windows: installing [SumatraPDF](https://www.sumatrapdfreader.org/) is recommended for silent PDF printing
- Chromium: `yarn install` downloads Puppeteer's Chrome build, and the setup wizard downloads it again if it is missing. If the machine already has Chrome, point `render.chromePath` at it; the agent also detects a system Chrome when the Puppeteer build fails.

The setup screen in the web UI (and the `printagent setup` command) checks all of the above and installs what is missing, so nothing has to be assembled by hand.

## Installation

The procedure is the same on macOS, Windows and Linux.

### Bare machine, no Node yet

A single command. No Node, no git, no admin rights required:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/huy97/printagent/main/install.sh | bash
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/huy97/printagent/main/install.ps1 | iex
```

The script downloads a portable Node LTS build (verified against its SHA-256) into `~/.printagent/runtime`, installs the agent from npm, creates a `printagent` command and opens the setup screen. If the machine already has Node >= 20 it uses that one and downloads nothing.

Everything lives under `~/.printagent` (Windows: `%USERPROFILE%\.printagent`); uninstalling means deleting that folder. Re-run the same command to update.

Optional environment variables: `PRINTAGENT_LANG=en` for English output, `PRINTAGENT_NO_START=1` to install without starting, `PRINTAGENT_HOME` to install elsewhere, `PRINTAGENT_NODE_TRACK` to pick another Node line (default `v22.x`).

### Machine that already has Node >= 20

```bash
npm install -g @hyydev/printagent
printagent start      # the agent starts immediately and opens the setup screen on first run
```

Run it once without installing:

```bash
npx @hyydev/printagent start
```

Or run it from source:

```bash
git clone https://github.com/huy97/printagent.git
cd printagent
yarn install
yarn start            # the agent starts immediately and opens the setup screen on first run
```

The web interface always comes up first. On the first run the browser opens straight onto the setup screen: press **Install automatically** once, the steps run in order and the progress shows on screen. The terminal is never needed.

The installer fixes whatever it can instead of asking the user to install things by hand. It only stops when a **required** step is still broken after the fix attempt; every other step just warns and the agent still starts.

| Step | Required | Handled automatically when missing |
| --- | --- | --- |
| Node.js >= 20 | yes | installed through nvm (macOS/Linux) or winget/choco (Windows), then re-run with the new Node |
| The `~/.printagent` directory | yes | created, write permission checked |
| Print driver | no | Linux: installs `cups cups-client` and starts the service |
| Printer | no | discovers IPP printers over mDNS (`dns-sd`/`avahi-browse`) and adds them to CUPS |
| Chromium | no | downloads the Puppeteer build, otherwise installs Google Chrome through brew/winget/apt |
| SumatraPDF (Windows) | no | downloads the portable build into `~/.printagent/tools` (no admin rights), falls back to winget/choco, then writes `printing.sumatraPath` |
| API key | yes | creates a `default` key |
| Tunnel | no | installs cloudflared/ngrok when `tunnel.provider` is not `none` |
| Background service | no | registers the service when chosen |

Package installation uses whatever package manager is available: `brew` on macOS, `winget`/`choco` on Windows, `apt-get`/`dnf`/`pacman`/`zypper`/`apk` on Linux (through `sudo -n`, only prompting for a password when running in a terminal).

Non-interactive runs (CI, mass installation scripts):

```bash
node bin/printagent.js setup --service        # also register the background service
node bin/printagent.js setup --no-service     # skip the background service
node bin/printagent.js setup --no-download    # do not download Chromium
node bin/printagent.js start --no-open        # do not open the browser
```

The `setup` command runs exactly those steps in the terminal and exits with code 1 when a required step fails, so it works inside a script. The `start` command never blocks: the agent comes up first and whatever setup is left is a button away in the web UI.

The interface lives at `http://127.0.0.1:7788`. Data (config, templates, jobs, logs) is stored under `~/.printagent` (change it with the `PRINTAGENT_DATA_DIR` environment variable); the result of the last setup run is in `~/.printagent/setup.json` (readable with `printagent doctor`).

### CLI commands

```bash
node bin/printagent.js setup [--service|--no-service|--no-download]
node bin/printagent.js start [--port 7788] [--host 0.0.0.0] [--no-open]
node bin/printagent.js service [status|install|uninstall]
node bin/printagent.js doctor                   # result of the last setup run
node bin/printagent.js printers                 # list the connected printers
node bin/printagent.js test --printer "Printer_Name"
node bin/printagent.js key                      # show the API key
node bin/printagent.js config set-default-printer "Printer_Name"
node bin/printagent.js tunnel check              # check cloudflared/ngrok
node bin/printagent.js mcp                      # run the MCP server over stdio
```

## Language

The agent speaks Vietnamese and English.

- **Web UI**: the language button in the title bar, next to Refresh. The choice is stored per browser.
- **First-run setup screen**: a language button in the top left corner. The language picked there becomes `agent.locale` and decides which starter template set is created.
- **Terminal wizard**: `printagent setup` asks for the language first and stores the answer in the configuration.
- **API**: each request picks its language from the `x-locale` header, the `?lang=` query, the `accept-language` header, then `agent.locale` from the configuration (default `vi`). Responses carry a `content-language` header, and every error also carries a stable `key` so a client can translate it itself.
- **CLI, logs and the terminal setup screen**: the `PRINTAGENT_LANG` environment variable, falling back to `agent.locale` (changeable in the Settings tab).
- **Documentation**: this file and [llms.en.txt](llms.en.txt); a running agent serves `GET /llms.txt?lang=en`.

```bash
PRINTAGENT_LANG=en node bin/printagent.js printers
curl -H "x-locale: en" http://127.0.0.1:7788/api/printers
```

## Authentication

The agent creates an API key on the first run (`node bin/printagent.js key`). Send it with every request:

```
x-api-key: pa_xxx
```
or `Authorization: Bearer pa_xxx`, or `?apiKey=pa_xxx` (used by the WebSocket).

By default requests coming from the machine running the agent skip the key (`auth.allowLocalhostWithoutKey`). That exception applies only when **all four** conditions hold, and each one is independent, so defeating a single check is not enough:

- the TCP connection comes from a loopback address (`127.0.0.1`, `::1`);
- the `Host` header is loopback - a request through a tunnel always carries the public hostname and is rejected right there, even when the attacker deliberately sends no proxy header at all;
- no proxy header is present (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`, `cf-ray`, ...);
- `Sec-Fetch-Site` is `same-origin` or `none`, and `Origin` (when present) is the agent itself - this blocks any random website from quietly calling the agent on a user's machine, including through `<img>`/`<script>` tags that send no `Origin`.

Browsers set those three headers themselves and a web page cannot forge them; command line tools on the local machine do not send them at all, so they keep skipping the key as before.

Settings that decide which binary the agent runs, or that turn authentication off (`render.chromePath`, `printing.sumatraPath`, `printing.allowLocalFilePath`, `printing.allowedFileRoots`, `auth.enabled`, `auth.allowLocalhostWithoutKey`, `tunnel.*.binPath`), can only be changed from the local machine; a remote request carrying those fields has them ignored and listed in `rejectedFields`.

### Document source limits

- `filePath` (printing a file already on the agent machine) is **off** by default. Turn it on with `printing.allowLocalFilePath = true` and declare `printing.allowedFileRoots` to limit the folders.
- `url` accepts `http`/`https` only, blocks loopback and private network ranges (re-enable with `printing.allowPrivateNetworkUrl`), and caps the size at `printing.maxDownloadMb` (default 64MB).
- CORS allows no origin by default; add your domain to `server.corsOrigins` if your web app calls the agent straight from the browser. The WebSocket uses the same list, plus an exception for the page the agent itself serves (including through a tunnel, where `Origin` matches `Host`).

### Protection when exposed to the Internet

- Ten wrong API keys within a minute block that address for five minutes with HTTP 429 and a `retry-after` header. REST and the WebSocket share one counter, so reopening a WebSocket connection is not a way around it. The address comes from `cf-connecting-ip`/`x-real-ip`/`x-forwarded-for`, so each client behind a tunnel is counted separately, and one successful authentication clears the counter. Requests from the local machine are never counted.
- The tunnel refuses to start while `auth.enabled = false` or while no API key exists, with a message saying what to fix.
- `auth.enabled` cannot be turned off while the tunnel is running; stop the tunnel first.
- Every response carries `x-content-type-options: nosniff`, `referrer-policy: no-referrer` and `x-frame-options: SAMEORIGIN`.
- Authenticated requests are not rate limited: throttle them at the Cloudflare layer (WAF, Access) or at a reverse proxy if you need it.

## Documentation for AI agents

The agent describes itself through three addresses, none of which need an API key, so an agent can read them as soon as it connects:

| Address | Content |
| --- | --- |
| `GET /.well-known/printagent.json` | Discovery endpoint: version, where to read the docs, the three REST/WebSocket/MCP entry points, how to authenticate |
| `GET /openapi.json` | OpenAPI 3.1 specification of all 36 REST endpoints, ready to feed a client generator or a tool definition |
| `GET /llms.txt` | The condensed plain-text version; also in the repo as [llms.txt](llms.txt) and [llms.en.txt](llms.en.txt) |

The fastest way for an agent to use PrintAgent is to plug in MCP (see [MCP](#mcp)): the 13 tools already carry descriptions and schemas, no REST documentation needed.

For a REST integration, the suggested order is: read `/.well-known/printagent.json`, `GET /api/printers` for printer names, `GET /api/templates/:id` and read `sampleData` to learn the data shape, then `POST /api/print/template`.

## REST API

### Printing a PDF file

`POST /api/print/pdf` - takes one of three sources: `content` (base64), `url`, `filePath`, or a multipart upload in the `file` field.

```bash
# base64
curl -X POST http://127.0.0.1:7788/api/print/pdf \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"content":"JVBERi0xLj...","printer":"HP_LaserJet","copies":2,"wait":true}'

# upload a file
curl -X POST http://127.0.0.1:7788/api/print/pdf \
  -H "x-api-key: $KEY" -F file=@invoice.pdf -F printer=HP_LaserJet

# download from a URL, then print
curl -X POST http://127.0.0.1:7788/api/print/pdf \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"url":"https://example.com/invoice.pdf"}'
```

Print options: `copies`, `title`, `options.duplex` (`none|long|short`), `options.paperSize`, `options.orientation`, `options.fitToPage`, `options.raw`, `options.extraOptions` (an array of CUPS `-o` parameters). Add `"wait": true` to make the API return only once printing has finished.

### Printing from a template + JSON variables

`POST /api/print/template`

```bash
curl -X POST http://127.0.0.1:7788/api/print/template \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{
    "templateId": "invoice-a4",
    "data": { "code": "HD001", "shop": {"name":"ABC Store"}, "items": [{"name":"Coffee","qty":2,"price":35000}], "total": 70000 },
    "printer": "HP_LaserJet",
    "copies": 1,
    "wait": true
  }'
```

A template can be passed inline instead of `templateId`:

```json
{ "template": "<h1>{{code}}</h1>", "engine": "html", "data": { "code": "HD001" } }
```

### Rendering without printing

`POST /api/print/render` returns the PDF (add `?format=html` to see the HTML, `?format=base64` to get JSON).

### Other endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Agent status (no key needed) |
| GET | `/api/info` | Detailed information, renderer check |
| GET | `/api/printers?refresh=1` | Printer list (rescans when `refresh=1`) |
| POST | `/api/printers/scan` | Rescan printers |
| GET | `/api/printers/:name` | Printer details and options |
| POST | `/api/printers/:name/default` | Set the default printer |
| POST | `/api/printers/:name/test` | Print a test page |
| GET/POST | `/api/templates` | List / create a template |
| GET/PUT/DELETE | `/api/templates/:id` | Read / update / delete a template |
| POST | `/api/templates/:id/preview` | Render a template into a PDF |
| GET | `/api/templates/seeds` | List the templates in a starter set (`?lang=vi\|en`) |
| POST | `/api/templates/seed` | Create the starter set for a language (`{"locale":"en"}`) |
| GET | `/api/jobs` | Job list (`?status=`, `?limit=`) |
| GET | `/api/jobs/:id` | Job details |
| GET | `/api/jobs/:id/file` | Download the printed file |
| POST | `/api/jobs/:id/cancel` | Cancel a job |
| POST | `/api/jobs/:id/retry` | Print a job again |
| GET/PUT | `/api/settings` | Read / update the configuration |
| GET/POST/DELETE | `/api/apikeys` | Manage API keys |
| GET | `/api/tunnel` | Tunnel status and tooling |
| POST | `/api/tunnel/start`, `/api/tunnel/stop` | Start / stop the tunnel |
| GET | `/api/setup` | Initial setup result and background service status |
| POST | `/api/setup/run` | Run setup in the background, returning progress immediately (local machine only) |
| GET | `/api/setup/progress` | Progress of the current run: current step, logs, result (local machine only) |
| POST | `/api/setup/service` | `{"action":"install"\|"uninstall"}` (local machine only) |

## WebSocket

```js
const ws = new WebSocket('ws://127.0.0.1:7788/ws?apiKey=pa_xxx');

ws.onopen = () => {
  ws.send(JSON.stringify({ id: '1', type: 'printers.list' }));
  ws.send(JSON.stringify({
    id: '2',
    type: 'print.template',
    payload: { templateId: 'invoice-a4', data: { code: 'HD001' }, wait: true },
  }));
};

ws.onmessage = (event) => console.log(JSON.parse(event.data));
```

Supported commands: `ping`, `status`, `printers.list`, `printers.scan`, `templates.list`, `templates.get`, `render.template`, `print.pdf`, `print.template`, `jobs.list`, `job.get`, `job.cancel`, `tunnel.status`, `subscribe`.

Pushed events (`{"type":"event"}`): `job.created`, `job.updated`, `printer.changed`, `tunnel.changed`, `log`. Choose the channels with `{"type":"subscribe","payload":{"events":["job","printer","tunnel","log"]}}`.

## MCP

### Streamable HTTP

```bash
claude mcp add --transport http printagent http://127.0.0.1:7788/mcp --header "x-api-key: pa_xxx"
```

### stdio

```json
{
  "mcpServers": {
    "printagent": {
      "command": "node",
      "args": ["/path/to/printagent/bin/printagent.js", "mcp"],
      "env": {
        "PRINTAGENT_URL": "http://127.0.0.1:7788",
        "PRINTAGENT_API_KEY": "pa_xxx"
      }
    }
  }
}
```

The stdio mode calls the running agent by default. Add `--standalone` if MCP should handle printing itself without a background agent.

Tools: `list_printers`, `agent_status`, `print_pdf`, `print_template`, `render_template`, `list_templates`, `get_template`, `save_template`, `delete_template`, `list_jobs`, `get_job`, `cancel_job`, `print_test_page`. Their titles and descriptions follow the agent language.

## Templates

Templates use [Handlebars](https://handlebarsjs.com/). Two kinds:

- `html`: renders HTML into a PDF with Chromium, then sends it to the printer. Used for A4 invoices and 80mm receipts.
- `text`: renders plain text, wraps it in ESC/POS commands (init, cut, open drawer) and sends it straight to the printer in raw mode.

The agent does **not** create templates on startup. The setup screen asks first and only creates them if you agree; create them later at any time with the **Starter set** button on the Templates tab, `POST /api/templates/seed`, or `printagent setup --templates`.

There are two sets of 6 templates each, created in the language selected on the setup screen.

The English set, in USD with `en-US` formatting:

| Id | Size | Used for |
| --- | --- | --- |
| `invoice-a4-en` | A4 | Sales invoice with QR code and amount in words |
| `bill-80mm-en` | 80mm | Thermal receipt rendered through PDF |
| `receipt-escpos-en` | raw | ESC/POS receipt, plain text |
| `tax-invoice-a4-en` | A4 | Tax invoice: VAT numbers on both sides, per-line tax rate, signature blocks |
| `pos-receipt-80mm-en` | 80mm | POS tax receipt with amount paid and change |
| `cash-receipt-a5-en` | A5 | Cash receipt: book and receipt number, five signature blocks |

The Vietnamese set:

| Id | Size | Used for |
| --- | --- | --- |
| `invoice-a4` | A4 | Simple sales invoice |
| `bill-80mm` | 80mm | Thermal printer receipt rendered through PDF |
| `receipt-escpos` | raw | Plain text receipt sent straight to a thermal printer |
| `vat-invoice-a4` | A4 | VAT invoice, printed representation of an e-invoice |
| `pos-invoice-80mm` | 80mm | E-invoice issued from a cash register |
| `cash-receipt-a5` | A5 | Cash receipt, Vietnamese form 01-TT |

The two sets use different ids, so both can live on the same machine; creating a set again never overwrites an existing template.

The last three Vietnamese ones follow current Vietnamese regulations: Decree 123/2020/ND-CP (amended by Decree 70/2025/ND-CP) and Circular 78/2021/TT-BTC for e-invoices, Circular 133/2016/TT-BTC for cash receipts. They use a single tax rate for the whole invoice (`vatRate`, `vatAmount`); an invoice with several rates needs the summary table reworked. The English set is a plain commercial layout, not tied to any country's statutory form.

Built-in helpers: `currency`, `formatNumber`, `formatDate`, `vndWords`, `enWords`, `amountWords`, `now`, `add`, `sub`, `mul`, `div`, `inc`, `sum`, `eq`, `ne`, `gt`, `lt`, `and`, `or`, `upper`, `lower`, `padStart`, `padEnd`, `repeat`, `concat`, `cols` (label left, number right, aligned to a column count), `ascii` (strips Vietnamese diacritics for thermal printers), `json`, `qr`, `qrDataUri`.

- `{{vndWords 8855000}}` spells an amount out in Vietnamese: `Tám triệu tám trăm năm mươi lăm nghìn`.
- `{{enWords 979.76 currency="USD"}}` spells it out in English with the currency name: `Nine hundred and seventy-nine US dollars and seventy-six cents only`.
- `{{amountWords total locale="en" currency="USD"}}` picks the spelling by language, handy when one template serves both.
- `{{formatDate date day="2-digit" month="2-digit" year="numeric"}}` picks individual date parts; with no parts given it uses `dateStyle`/`timeStyle`.

```handlebars
<h1>{{shop.name}}</h1>
{{#each items}}
  <div>{{inc @index}}. {{name}} - {{currency (mul qty price)}}</div>
{{/each}}
<p>Total: {{currency total}}</p>
{{qr code size=90}}
```

Page settings for an `html` template: `page.format` (A4, A5, Letter...), `page.width`/`page.height` (custom sizes such as 80mm), `page.landscape`, `page.marginTop|marginRight|marginBottom|marginLeft`.

Set `page.height = "auto"` together with `page.width` for roll paper: the agent measures the content height and cuts there instead of feeding a whole 297mm sheet. Add `page.autoHeightPadding` (default `2mm`) when the printer needs extra paper at the bottom.

## Thermal printers / ESC/POS

- Option 1 (recommended): an `html` template with `page.width = 80mm`, printed like any PDF.
- Option 2: a `text` template with `options.raw = true`; the agent sends raw bytes with ESC/POS commands. The `escpos` options are `init`, `cut`, `feed`, `codepage`, `encoding`, `openDrawer`.
- On Windows, raw printing needs the printer shared and `printing.rawShareName` set (for example `\\localhost\POS58`).

## Public tunnel

Turn it on in the Tunnel tab of the web UI, or through the API.

- **Cloudflare quick tunnel**: needs `cloudflared` and an empty token. The agent runs `cloudflared tunnel --url http://127.0.0.1:7788` and picks up the `*.trycloudflare.com` URL (it changes on every run).
- **Cloudflare named tunnel**: create the tunnel in Cloudflare Zero Trust, then fill in the token and hostname. The agent runs `cloudflared tunnel --url http://127.0.0.1:7788 run --token <token>`, but a tunnel created from the dashboard always takes its ingress from there, so you **must** open Zero Trust > Networks > Tunnels > your tunnel > Public Hostname and point the hostname at `http://127.0.0.1:7788` (or `http://localhost:7788`). Without that step the hostname answers 502/1033 even though the connector reports a successful connection.
- **ngrok**: needs `ngrok` and an authtoken. A fixed domain can be attached.

Turn on `tunnel.autoStart` to have the agent open the tunnel on every start.

Once the tunnel is up, the agent calls `https://<hostname>/api/health` with a random header and checks the response, so it knows whether the public address really reaches this agent. When it does not, the `warning` field of `GET /api/tunnel` (and the Tunnel tab) says why. The agent also warns when another `cloudflared` process on the machine runs the same tunnel, because two connectors on one tunnel make Cloudflare split requests between them.

When exposing the agent to the Internet, always keep `auth.enabled = true` and share API keys only with systems that need them.

## Web interface

The interface is built with React + TypeScript + Vite + Tailwind v4 + shadcn/ui; the source is in `ui/`, the build output in `web/`, served by the agent at `http://<host>:7788`.

```bash
yarn build          # build the UI into web/
yarn ui:dev         # run the Vite dev server (proxies /api and /ws to port 7788)
```

When reached through a tunnel, the interface asks for an API key and stores it in the browser's localStorage. Sensitive actions (viewing/creating/deleting API keys, editing local-only settings) only work when the interface is opened on the agent machine.

## Data layout

```
~/.printagent/
├── config.json          # the whole configuration
├── templates/<id>/      # template.hbs|template.txt + meta.json
├── files/               # PDF/raw files of the jobs (cleaned up per queue.keepFilesHours)
├── jobs/index.json      # job history
└── logs/                # daily logs
```

## Running in the background

One command for all three operating systems, with no administrator rights and no NSSM:

```bash
printagent service install     # start together with the machine
printagent service status      # check the status
printagent service uninstall   # remove
```

It can also be toggled in the Settings tab of the web UI. Underneath it uses:

| Operating system | Mechanism | File/task created |
| --- | --- | --- |
| macOS | launchd (per-user LaunchAgent) | `~/Library/LaunchAgents/com.printagent.agent.plist` |
| Linux | systemd user unit + `loginctl enable-linger` | `~/.config/systemd/user/printagent.service` |
| Windows | Task Scheduler, ONLOGON trigger | the `PrintAgent` task |

On macOS the background logs go to `~/.printagent/logs/service.log`. On Linux, `enable-linger` lets the agent run even before a graphical session is opened. On Windows the task is registered from an XML file and runs through `wscript`, so no console window pops up at every logon; the shim file is at `~/.printagent/printagent-service.vbs`.

## Windows specifics

- Package installation uses `winget` (available since Windows 10 21H2). On a machine that only has `choco`, PowerShell must run as administrator, otherwise the install command is refused and that step only warns.
- The first time the agent listens on `0.0.0.0`, Windows Firewall asks for permission. Pressing Cancel still works over `127.0.0.1`; only access from other machines on the LAN is lost.
- New machines usually ship with "Microsoft Print to PDF", so the printer step does not block. Network printers must be added through Settings > Printers & scanners; the agent does not scan mDNS on Windows.
- PDF printing prefers SumatraPDF (the wizard installs it). Without it the agent falls back to PowerShell `PrintTo`, which is slower and ignores most print options.
- Raw printing (ESC/POS) needs the printer shared and `printing.rawShareName` set, for example `\\localhost\POS58`.
