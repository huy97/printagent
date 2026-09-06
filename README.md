# PrintAgent

**Tiếng Việt** · [English](README.en.md)

Agent in ấn chạy trên máy local, mở API cho hệ thống khác gọi tới để in. Nhận file PDF in thẳng, hoặc nhận template + biến JSON rồi tự render PDF phía agent trước khi in.

Bốn cách điều khiển:

| Giao diện | Địa chỉ | Dùng cho |
|---|---|---|
| REST API | `http://<host>:7788/api` | Ứng dụng web, backend, POS |
| WebSocket | `ws://<host>:7788/ws` | Ứng dụng cần nhận sự kiện job theo thời gian thực |
| MCP | `http://<host>:7788/mcp` (HTTP) hoặc stdio | Claude Code, Claude Desktop, agent AI |
| Web UI | `http://<host>:7788` | Cài đặt, quét máy in, quản lý template, xem hàng đợi |

## Yêu cầu

- Node.js >= 20
- macOS/Linux: CUPS (`lp`, `lpstat` - có sẵn trên macOS)
- Windows: khuyến nghị cài [SumatraPDF](https://www.sumatrapdfreader.org/) để in PDF im lặng
- Chromium: `yarn install` tự tải bản Chrome của Puppeteer, wizard cài đặt sẽ tải lại nếu thiếu. Nếu máy đã có Chrome, có thể trỏ `render.chromePath` vào đó; agent cũng tự dò Chrome hệ thống khi bản Puppeteer lỗi.

Màn hình cài đặt trong web UI (và lệnh `printagent setup`) kiểm tra hết các yêu cầu trên, tự cài thứ còn thiếu, nên không cần dựng tay từng phần.

## Cài đặt

Quy trình giống nhau trên macOS, Windows và Linux.

Cách nhanh nhất, cài từ npm:

```bash
npm install -g @hyydev/printagent
printagent start      # agent chạy ngay, lần đầu tự mở giao diện cài đặt
```

Chạy một lần không cài đặt:

```bash
npx @hyydev/printagent start
```

Hoặc chạy từ mã nguồn, máy đã có Node >= 20:

```bash
git clone https://github.com/huy97/printagent.git
cd printagent
yarn install
yarn start            # agent chạy ngay, lần đầu tự mở giao diện cài đặt
```

Máy trắng chưa có Node thì dùng script bootstrap, nó tự cài Node LTS rồi làm nốt phần trên:

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File install.ps1
```

```bash
# macOS / Linux
bash install.sh
```

Giao diện web luôn lên trước. Lần đầu chạy, trình duyệt mở thẳng màn hình cài đặt: bấm **Cài đặt tự động** một lần, các bước chạy tuần tự và hiện tiến độ ngay trên màn hình. Không cần đụng tới terminal.

Trình cài đặt tự sửa những gì sửa được, không bắt người dùng đi cài tay. Chỉ dừng khi một bước **bắt buộc** vẫn hỏng sau khi đã thử sửa; các bước còn lại chỉ cảnh báo và agent vẫn khởi động.

| Bước | Bắt buộc | Tự xử lý khi thiếu |
| --- | --- | --- |
| Node.js >= 20 | có | cài qua nvm (macOS/Linux) hoặc winget/choco (Windows), rồi tự chạy lại bằng Node mới |
| Thư mục `~/.printagent` | có | tạo thư mục, kiểm tra quyền ghi |
| Driver in | không | Linux: cài `cups cups-client` rồi bật dịch vụ |
| Máy in | không | dò máy in IPP qua mDNS (`dns-sd`/`avahi-browse`) và tự thêm vào CUPS |
| Chromium | không | tải bản Puppeteer, không được thì cài Google Chrome qua brew/winget/apt |
| SumatraPDF (Windows) | không | cài qua winget/choco, ghi vào `printing.sumatraPath` |
| API key | có | tự tạo khoá `default` |
| Tunnel | không | cài cloudflared/ngrok nếu `tunnel.provider` khác `none` |
| Chạy nền | không | đăng ký dịch vụ nếu chọn |

Việc cài gói dùng trình quản lý gói có sẵn: `brew` trên macOS, `winget`/`choco` trên Windows, `apt-get`/`dnf`/`pacman`/`zypper`/`apk` trên Linux (dùng `sudo -n`, chỉ hỏi mật khẩu khi đang chạy trong terminal).

Chạy không tương tác (CI, script cài đặt hàng loạt):

```bash
node bin/printagent.js setup --service        # đăng ký luôn dịch vụ nền
node bin/printagent.js setup --no-service     # bỏ qua dịch vụ nền
node bin/printagent.js setup --no-download    # không tự tải Chromium
node bin/printagent.js start --no-open        # không tự mở trình duyệt
```

Lệnh `setup` chạy đúng các bước đó trong terminal và trả mã thoát 1 khi một bước bắt buộc thất bại, nên dùng được trong script. Lệnh `start` không bao giờ chặn: agent lên trước, phần cài đặt còn thiếu để người dùng bấm trên web UI.

Địa chỉ giao diện là `http://127.0.0.1:7788`. Dữ liệu (config, template, job, log) nằm ở `~/.printagent` (đổi bằng biến môi trường `PRINTAGENT_DATA_DIR`), kết quả lần setup gần nhất nằm ở `~/.printagent/setup.json` (xem bằng `printagent doctor`).

### Lệnh CLI

```bash
node bin/printagent.js setup [--service|--no-service|--no-download]
node bin/printagent.js start [--port 7788] [--host 0.0.0.0] [--no-open]
node bin/printagent.js service [status|install|uninstall]
node bin/printagent.js doctor                   # kết quả kiểm tra lần setup gần nhất
node bin/printagent.js printers                 # liệt kê máy in đang kết nối
node bin/printagent.js test --printer "Ten_May_In"
node bin/printagent.js key                      # xem API key
node bin/printagent.js config set-default-printer "Ten_May_In"
node bin/printagent.js tunnel check             # kiểm tra cloudflared/ngrok
node bin/printagent.js mcp                      # chạy MCP server qua stdio
```

## Ngôn ngữ

Agent nói được tiếng Việt và tiếng Anh.

- **Giao diện web**: nút đổi ngữ trên thanh tiêu đề, cạnh nút Làm mới. Lựa chọn lưu riêng theo từng trình duyệt.
- **API**: mỗi request chọn ngôn ngữ theo header `x-locale`, query `?lang=`, header `accept-language`, rồi `agent.locale` trong cấu hình (mặc định `vi`). Response kèm header `content-language`, mỗi lỗi kèm trường `key` ổn định để client tự dịch nếu muốn.
- **CLI, log và màn cài đặt trong terminal**: biến môi trường `PRINTAGENT_LANG`, không có thì theo `agent.locale` (đổi được trong tab Cài đặt).
- **Tài liệu**: [README.en.md](README.en.md) và [llms.en.txt](llms.en.txt); agent đang chạy phục vụ `GET /llms.txt?lang=en`.

```bash
PRINTAGENT_LANG=en node bin/printagent.js printers
curl -H "x-locale: en" http://127.0.0.1:7788/api/printers
```

## Xác thực

Agent sinh sẵn một API key khi chạy lần đầu (`node bin/printagent.js key`). Gửi kèm mỗi request:

```
x-api-key: pa_xxx
```
hoặc `Authorization: Bearer pa_xxx`, hoặc `?apiKey=pa_xxx` (dùng cho WebSocket).

Mặc định request từ chính máy đang chạy agent được miễn key (`auth.allowLocalhostWithoutKey`). Ngoại lệ này chỉ áp dụng khi thoả **đồng thời** bốn điều kiện, mỗi điều kiện độc lập nhau nên phá được một cái vẫn chưa đủ:

- kết nối TCP tới từ địa chỉ loopback (`127.0.0.1`, `::1`);
- header `Host` là loopback - request qua tunnel luôn mang tên miền công khai nên bị loại ngay, kể cả khi kẻ tấn công cố tình không gửi header proxy nào;
- không có header proxy nào (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`, `cf-ray`, ...);
- `Sec-Fetch-Site` là `same-origin` hoặc `none`, và `Origin` (nếu có) là chính agent - chặn kịch bản một website bất kỳ gọi ngầm tới agent trên máy người dùng, kể cả bằng thẻ `<img>`/`<script>` vốn không gửi `Origin`.

Ba header trên do trình duyệt tự đặt và trang web không sửa được; công cụ dòng lệnh trên chính máy local không gửi chúng nên vẫn được miễn key như trước.

Các thiết lập quyết định binary được agent chạy hoặc tắt xác thực (`render.chromePath`, `printing.sumatraPath`, `printing.allowLocalFilePath`, `printing.allowedFileRoots`, `auth.enabled`, `auth.allowLocalhostWithoutKey`, `tunnel.*.binPath`) chỉ sửa được từ máy local; request từ xa gửi các trường này sẽ bị bỏ qua và liệt kê trong `rejectedFields`.

### Giới hạn nguồn tài liệu

- `filePath` (in file có sẵn trên máy chạy agent) mặc định **tắt**. Bật bằng `printing.allowLocalFilePath = true` và nên khai báo `printing.allowedFileRoots` để giới hạn thư mục.
- `url` chỉ nhận `http`/`https`, chặn địa chỉ loopback và dải mạng nội bộ (bật lại bằng `printing.allowPrivateNetworkUrl`), giới hạn dung lượng theo `printing.maxDownloadMb` (mặc định 64MB).
- CORS mặc định không cho phép origin nào; thêm domain vào `server.corsOrigins` nếu web app của bạn gọi trực tiếp từ trình duyệt. WebSocket cũng áp dụng cùng danh sách này, kèm ngoại lệ cho chính trang do agent phục vụ (kể cả khi mở qua tunnel, vì khi đó `Origin` trùng `Host`).

### Bảo vệ khi mở ra Internet

- Sai API key 10 lần trong một phút thì địa chỉ đó bị chặn 5 phút, trả HTTP 429 kèm `retry-after`. Bộ đếm dùng chung cho cả REST và WebSocket, nên không dò key được bằng cách mở lại kết nối WebSocket. Địa chỉ lấy từ `cf-connecting-ip`/`x-real-ip`/`x-forwarded-for` nên mỗi client qua tunnel bị tính riêng; một lần xác thực đúng sẽ xoá bộ đếm. Request từ máy local không bị tính.
- Không bật được tunnel khi `auth.enabled = false` hoặc khi chưa có API key nào - agent từ chối với thông báo nêu rõ việc cần làm.
- Không tắt được `auth.enabled` trong lúc tunnel đang chạy; phải dừng tunnel trước.
- Mọi phản hồi đều kèm `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `x-frame-options: SAMEORIGIN`.
- Không có rate limit cho request đã xác thực đúng: nếu cần, chặn ở tầng Cloudflare (WAF, Access) hoặc reverse proxy.

## Tài liệu cho tác nhân AI

Agent tự mô tả mình qua ba địa chỉ, đều không cần API key nên tác nhân đọc được ngay khi vừa kết nối:

| Địa chỉ | Nội dung |
| --- | --- |
| `GET /.well-known/printagent.json` | Điểm khám phá: phiên bản, nơi đọc tài liệu, ba điểm truy cập REST/WebSocket/MCP, cách xác thực |
| `GET /openapi.json` | Đặc tả OpenAPI 3.1 của cả 34 endpoint REST, nạp thẳng vào công cụ sinh client hoặc khai báo tool |
| `GET /llms.txt` | Bản rút gọn dạng văn bản, cũng nằm sẵn trong repo tại [llms.txt](llms.txt) và [llms.en.txt](llms.en.txt) |

Cách nhanh nhất để một tác nhân dùng được PrintAgent là cắm MCP (xem mục [MCP](#mcp)): 13 tool đã kèm mô tả và schema, không cần đọc tài liệu REST.

Nếu tích hợp qua REST, trình tự gợi ý: đọc `/.well-known/printagent.json`, `GET /api/printers` lấy tên máy in, `GET /api/templates/:id` đọc `sampleData` để biết khuôn dữ liệu, rồi `POST /api/print/template`.

## REST API

### In file PDF

`POST /api/print/pdf` - nhận một trong ba nguồn: `content` (base64), `url`, `filePath`, hoặc upload multipart field `file`.

```bash
# base64
curl -X POST http://127.0.0.1:7788/api/print/pdf \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"content":"JVBERi0xLj...","printer":"HP_LaserJet","copies":2,"wait":true}'

# upload file
curl -X POST http://127.0.0.1:7788/api/print/pdf \
  -H "x-api-key: $KEY" -F file=@invoice.pdf -F printer=HP_LaserJet

# tải từ URL rồi in
curl -X POST http://127.0.0.1:7788/api/print/pdf \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"url":"https://example.com/invoice.pdf"}'
```

Tuỳ chọn in: `copies`, `title`, `options.duplex` (`none|long|short`), `options.paperSize`, `options.orientation`, `options.fitToPage`, `options.raw`, `options.extraOptions` (mảng tham số `-o` của CUPS). Thêm `"wait": true` để API chờ in xong rồi mới trả về.

### In từ template + biến JSON

`POST /api/print/template`

```bash
curl -X POST http://127.0.0.1:7788/api/print/template \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{
    "templateId": "invoice-a4",
    "data": { "code": "HD001", "shop": {"name":"Cửa hàng ABC"}, "items": [{"name":"Cà phê","qty":2,"price":35000}], "total": 70000 },
    "printer": "HP_LaserJet",
    "copies": 1,
    "wait": true
  }'
```

Có thể truyền template inline thay cho `templateId`:

```json
{ "template": "<h1>{{code}}</h1>", "engine": "html", "data": { "code": "HD001" } }
```

### Render thử, không in

`POST /api/print/render` trả về PDF (thêm `?format=html` để xem HTML, `?format=base64` để nhận JSON).

### Các endpoint khác

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/health` | Trạng thái agent (không cần key) |
| GET | `/api/info` | Thông tin chi tiết, kiểm tra renderer |
| GET | `/api/printers?refresh=1` | Danh sách máy in (quét lại nếu `refresh=1`) |
| POST | `/api/printers/scan` | Quét lại máy in |
| GET | `/api/printers/:name` | Chi tiết + tuỳ chọn của máy in |
| POST | `/api/printers/:name/default` | Đặt máy in mặc định |
| POST | `/api/printers/:name/test` | In trang thử |
| GET/POST | `/api/templates` | Danh sách / tạo template |
| GET/PUT/DELETE | `/api/templates/:id` | Xem / sửa / xoá template |
| POST | `/api/templates/:id/preview` | Render template thành PDF |
| GET | `/api/jobs` | Danh sách job (`?status=`, `?limit=`) |
| GET | `/api/jobs/:id` | Chi tiết job |
| GET | `/api/jobs/:id/file` | Tải file đã in |
| POST | `/api/jobs/:id/cancel` | Huỷ job |
| POST | `/api/jobs/:id/retry` | In lại job |
| GET/PUT | `/api/settings` | Xem / sửa cấu hình |
| GET/POST/DELETE | `/api/apikeys` | Quản lý API key |
| GET | `/api/tunnel` | Trạng thái + công cụ tunnel |
| POST | `/api/tunnel/start`, `/api/tunnel/stop` | Bật / tắt tunnel |
| GET | `/api/setup` | Kết quả cài đặt ban đầu + trạng thái dịch vụ nền |
| POST | `/api/setup/run` | Chạy cài đặt trong nền, trả tiến độ ngay (chỉ từ máy local) |
| GET | `/api/setup/progress` | Tiến độ lần chạy hiện tại: bước đang chạy, log, kết quả (chỉ từ máy local) |
| POST | `/api/setup/service` | `{"action":"install"\|"uninstall"}` (chỉ từ máy local) |

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

Lệnh hỗ trợ: `ping`, `status`, `printers.list`, `printers.scan`, `templates.list`, `templates.get`, `render.template`, `print.pdf`, `print.template`, `jobs.list`, `job.get`, `job.cancel`, `tunnel.status`, `subscribe`.

Sự kiện đẩy về (`{"type":"event"}`): `job.created`, `job.updated`, `printer.changed`, `tunnel.changed`, `log`. Chọn kênh nhận bằng `{"type":"subscribe","payload":{"events":["job","printer","tunnel","log"]}}`.

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
      "args": ["/duong/dan/printagent/bin/printagent.js", "mcp"],
      "env": {
        "PRINTAGENT_URL": "http://127.0.0.1:7788",
        "PRINTAGENT_API_KEY": "pa_xxx"
      }
    }
  }
}
```

Chế độ stdio mặc định gọi tới agent đang chạy. Thêm `--standalone` nếu muốn MCP tự xử lý in mà không cần agent chạy nền.

Tool: `list_printers`, `agent_status`, `print_pdf`, `print_template`, `render_template`, `list_templates`, `get_template`, `save_template`, `delete_template`, `list_jobs`, `get_job`, `cancel_job`, `print_test_page`.

## Template

Template dùng [Handlebars](https://handlebarsjs.com/). Hai kiểu:

- `html`: render HTML thành PDF bằng Chromium rồi gửi máy in. Dùng cho hoá đơn A4, bill 80mm.
- `text`: render text thuần, đóng gói lệnh ESC/POS (init, cut, mở két) và gửi thẳng máy in ở chế độ raw.

Agent tạo sẵn 6 template mẫu:

| Id | Khổ | Dùng cho |
| --- | --- | --- |
| `invoice-a4` | A4 | Hoá đơn bán hàng đơn giản |
| `bill-80mm` | 80mm | Bill máy in nhiệt, render qua PDF |
| `receipt-escpos` | raw | Bill text thuần gửi thẳng máy in nhiệt |
| `vat-invoice-a4` | A4 | Hoá đơn GTGT, bản thể hiện hoá đơn điện tử |
| `pos-invoice-80mm` | 80mm | Hoá đơn điện tử khởi tạo từ máy tính tiền |
| `cash-receipt-a5` | A5 | Phiếu thu tiền mặt mẫu 01-TT |

Ba mẫu sau bám theo quy định hiện hành: Nghị định 123/2020/NĐ-CP (sửa đổi tại Nghị định 70/2025/NĐ-CP) và Thông tư 78/2021/TT-BTC cho hoá đơn điện tử, Thông tư 133/2016/TT-BTC cho phiếu thu. Chúng dùng một thuế suất chung cho cả hoá đơn (`vatRate`, `vatAmount`); hoá đơn nhiều thuế suất cần sửa lại bảng tổng hợp.

Helper có sẵn: `currency`, `formatNumber`, `formatDate`, `vndWords`, `now`, `add`, `sub`, `mul`, `div`, `inc`, `sum`, `eq`, `ne`, `gt`, `lt`, `and`, `or`, `upper`, `lower`, `padStart`, `padEnd`, `repeat`, `concat`, `cols` (căn nhãn trái - số phải theo số cột), `ascii` (bỏ dấu tiếng Việt cho máy in nhiệt), `json`, `qr`, `qrDataUri`.

- `{{vndWords 8855000}}` đọc số tiền thành chữ: `Tám triệu tám trăm năm mươi lăm nghìn`.
- `{{formatDate date day="2-digit" month="2-digit" year="numeric"}}` lấy riêng ngày tháng năm; không truyền thành phần nào thì dùng `dateStyle`/`timeStyle`.

```handlebars
<h1>{{shop.name}}</h1>
{{#each items}}
  <div>{{inc @index}}. {{name}} - {{currency (mul qty price)}}</div>
{{/each}}
<p>Tổng: {{currency total}}</p>
{{qr code size=90}}
```

Cấu hình trang cho template `html`: `page.format` (A4, A5, Letter...), `page.width`/`page.height` (khổ tuỳ chỉnh như 80mm), `page.landscape`, `page.marginTop|marginRight|marginBottom|marginLeft`.

Đặt `page.height = "auto"` cùng `page.width` cho giấy cuộn: agent đo chiều cao nội dung rồi cắt đúng chỗ thay vì đẩy hết tờ 297mm. Thêm `page.autoHeightPadding` (mặc định `2mm`) nếu máy in cần chừa thêm chân giấy.

## Máy in nhiệt / ESC/POS

- Cách 1 (khuyến nghị): template `html` với `page.width = 80mm`, in như PDF bình thường.
- Cách 2: template `text` + `options.raw = true`, agent gửi byte thô kèm lệnh ESC/POS. Tuỳ chọn `escpos`: `init`, `cut`, `feed`, `codepage`, `encoding`, `openDrawer`.
- Trên Windows, in raw cần chia sẻ máy in và đặt `printing.rawShareName` (ví dụ `\\localhost\POS58`).

## Tunnel công khai

Bật trong tab Tunnel của web UI hoặc gọi API.

- **Cloudflare quick tunnel**: cần `cloudflared`, để trống token. Agent chạy `cloudflared tunnel --url http://127.0.0.1:7788` và lấy URL `*.trycloudflare.com` (đổi mỗi lần chạy).
- **Cloudflare named tunnel**: tạo tunnel trên Cloudflare Zero Trust rồi điền token + hostname. Agent chạy `cloudflared tunnel --url http://127.0.0.1:7788 run --token <token>`, nhưng tunnel tạo từ dashboard luôn lấy ingress từ xa, nên **bắt buộc** vào Zero Trust > Networks > Tunnels > tunnel đang dùng > Public Hostname và trỏ hostname về `http://127.0.0.1:7788` (hoặc `http://localhost:7788`). Thiếu bước này thì hostname trả 502/1033 dù connector vẫn báo kết nối thành công.
- **ngrok**: cần `ngrok` và authtoken. Có thể gắn domain cố định.

Bật `tunnel.autoStart` để agent tự mở tunnel mỗi lần khởi động.

Sau khi tunnel chạy, agent tự gọi `https://<hostname>/api/health` kèm một header ngẫu nhiên rồi đối chiếu phản hồi để biết địa chỉ công khai có thực sự về đúng agent này không. Không khớp thì trường `warning` trong `GET /api/tunnel` (và tab Tunnel) nói rõ nguyên nhân. Agent cũng cảnh báo khi phát hiện một tiến trình `cloudflared` khác trên máy đang chạy cùng tunnel, vì hai connector cùng tunnel làm Cloudflare chia request cho cả hai.

Khi mở ra Internet, luôn giữ `auth.enabled = true` và chỉ chia sẻ API key cho hệ thống cần dùng.

## Giao diện web

Giao diện dựng bằng React + TypeScript + Vite + Tailwind v4 + shadcn/ui, mã nguồn trong `ui/`, bản build nằm ở `web/` và được agent phục vụ tại `http://<host>:7788`.

```bash
yarn build          # build UI ra thư mục web/
yarn ui:dev         # chạy Vite dev server (proxy /api và /ws sang cổng 7788)
```

Khi truy cập qua tunnel, giao diện sẽ hỏi API key và lưu vào localStorage của trình duyệt. Các thao tác nhạy cảm (xem/tạo/xoá API key, sửa cấu hình chỉ dành cho máy local) chỉ thực hiện được khi mở trực tiếp trên máy chạy agent.

## Cấu trúc dữ liệu

```
~/.printagent/
├── config.json          # toàn bộ cấu hình
├── templates/<id>/      # template.hbs|template.txt + meta.json
├── files/               # file PDF/raw của các job (tự dọn theo queue.keepFilesHours)
├── jobs/index.json      # lịch sử job
└── logs/                # log theo ngày
```

## Chạy nền

Một lệnh cho cả ba hệ điều hành, không cần quyền quản trị và không cần NSSM:

```bash
printagent service install     # đăng ký khởi động cùng máy
printagent service status      # xem trạng thái
printagent service uninstall   # gỡ
```

Cũng bật/tắt được trong tab Cài đặt của web UI. Bên dưới nó dùng:

| Hệ điều hành | Cơ chế | File/tác vụ tạo ra |
| --- | --- | --- |
| macOS | launchd (LaunchAgent của user) | `~/Library/LaunchAgents/com.printagent.agent.plist` |
| Linux | systemd user unit + `loginctl enable-linger` | `~/.config/systemd/user/printagent.service` |
| Windows | Task Scheduler, trigger ONLOGON | tác vụ `PrintAgent` |

Trên macOS log chạy nền ghi vào `~/.printagent/logs/service.log`. Trên Linux, `enable-linger` giúp agent chạy cả khi chưa đăng nhập phiên đồ hoạ. Trên Windows tác vụ đăng ký bằng file XML và chạy qua `wscript` nên không bật cửa sổ console mỗi lần đăng nhập; file shim nằm ở `~/.printagent/printagent-service.vbs`.

## Lưu ý riêng cho Windows

- Bước cài gói dùng `winget` (có sẵn từ Windows 10 21H2). Máy chỉ có `choco` thì phải chạy PowerShell bằng quyền admin, nếu không lệnh cài sẽ bị từ chối và bước đó chỉ còn cảnh báo.
- Lần đầu agent lắng nghe trên `0.0.0.0`, Windows Firewall sẽ hỏi cấp quyền. Bấm Cancel vẫn dùng được qua `127.0.0.1`, chỉ mất truy cập từ máy khác trong LAN.
- Máy mới thường đã có sẵn "Microsoft Print to PDF" nên bước máy in không chặn. Máy in mạng phải thêm bằng Settings > Printers & scanners; agent không tự dò mDNS trên Windows.
- In PDF ưu tiên SumatraPDF (wizard tự cài). Không có thì tự chuyển sang PowerShell `PrintTo`, chậm hơn và bỏ qua phần lớn tuỳ chọn in.
- In raw (ESC/POS) cần chia sẻ máy in rồi đặt `printing.rawShareName`, ví dụ `\\localhost\POS58`.

