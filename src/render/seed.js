import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from '../core/paths.js';
import { listTemplates, createTemplate, templateExists } from './templates.js';
import { createLogger } from '../util/logger.js';
import { t } from '../i18n/index.js';
import { SEEDS_EN } from './seed-en.js';

const log = createLogger('templates');

const INVOICE_A4 = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><style>
  * { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; }
  body { font-size: 13px; color: #111; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .muted { color: #666; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #666;
       border-bottom: 1px solid #333; padding: 6px 8px; }
  td { padding: 7px 8px; border-bottom: 1px solid #e3e3e3; }
  td.num, th.num { text-align: right; }
  tfoot td { border: none; padding-top: 10px; font-weight: 600; }
  .total { font-size: 16px; }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>{{shop.name}}</h1>
      <div class="muted">{{shop.address}}</div>
      <div class="muted">{{shop.phone}}{{#if shop.taxCode}} · MST: {{shop.taxCode}}{{/if}}</div>
    </div>
    <div style="text-align:right">
      <div><strong>HOÁ ĐƠN {{code}}</strong></div>
      <div class="muted">{{formatDate date dateStyle="short" timeStyle="short"}}</div>
      <div class="muted">Khách: {{customer.name}}</div>
      {{#if customer.phone}}<div class="muted">{{customer.phone}}</div>{{/if}}
    </div>
  </div>

  <table>
    <thead>
      <tr><th style="width:32px">#</th><th>Sản phẩm</th><th class="num">SL</th>
          <th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{inc @index}}</td>
        <td>{{name}}{{#if note}}<div class="muted">{{note}}</div>{{/if}}</td>
        <td class="num">{{qty}}</td>
        <td class="num">{{currency price}}</td>
        <td class="num">{{currency (mul qty price)}}</td>
      </tr>
      {{/each}}
    </tbody>
    <tfoot>
      {{#if discount}}<tr><td colspan="4" class="num">Giảm giá</td><td class="num">-{{currency discount}}</td></tr>{{/if}}
      {{#if vat}}<tr><td colspan="4" class="num">VAT</td><td class="num">{{currency vat}}</td></tr>{{/if}}
      <tr class="total"><td colspan="4" class="num">Tổng cộng</td><td class="num">{{currency total}}</td></tr>
    </tfoot>
  </table>

  <div style="margin-top:28px; display:flex; justify-content:space-between; align-items:flex-end">
    <div class="muted">Cảm ơn quý khách!</div>
    <div>{{qr code size=90}}</div>
  </div>
</body></html>`;

const BILL_80MM = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><style>
  @page { margin: 0; }
  body { width: 72mm; margin: 0 auto; padding: 4mm 0; font-family: "Helvetica Neue", Arial, sans-serif;
         font-size: 11px; color: #000; }
  .center { text-align: center; }
  h1 { font-size: 14px; margin: 0 0 2px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  .total { font-size: 13px; font-weight: 700; }
</style></head>
<body>
  <div class="center">
    <h1>{{shop.name}}</h1>
    <div>{{shop.address}}</div>
    <div>{{shop.phone}}</div>
  </div>
  <hr>
  <div>Hoá đơn: <strong>{{code}}</strong></div>
  <div>{{formatDate date dateStyle="short" timeStyle="short"}}</div>
  {{#if customer.name}}<div>Khách: {{customer.name}}</div>{{/if}}
  <hr>
  <table>
    {{#each items}}
    <tr><td colspan="2">{{name}}</td></tr>
    <tr><td>{{qty}} x {{formatNumber price}}</td><td class="num">{{formatNumber (mul qty price)}}</td></tr>
    {{/each}}
  </table>
  <hr>
  <table>
    {{#if discount}}<tr><td>Giảm giá</td><td class="num">-{{formatNumber discount}}</td></tr>{{/if}}
    <tr class="total"><td>TỔNG</td><td class="num">{{formatNumber total}}</td></tr>
  </table>
  <hr>
  <div class="center">{{qr code size=80}}</div>
  <div class="center" style="margin-top:4px">Cảm ơn quý khách!</div>
</body></html>`;

const RECEIPT_TEXT = `{{ascii shop.name}}
{{ascii shop.address}}
DT: {{shop.phone}}{{#if shop.taxCode}}
MST: {{shop.taxCode}}{{/if}}
{{repeat "=" 32}}
HOA DON BAN HANG
So: {{code}}
Ngay: {{formatDate date day="2-digit" month="2-digit" year="numeric"}} {{formatDate date hour="2-digit" minute="2-digit"}}{{#if customer.name}}
Khach: {{ascii customer.name}}{{/if}}
{{repeat "-" 32}}
{{#each items}}{{ascii name}}
{{cols (concat "  " qty " x " (formatNumber price)) (formatNumber (mul qty price)) 32}}
{{/each}}{{repeat "-" 32}}
{{#if subtotal}}{{cols "Cong tien hang" (formatNumber subtotal) 32}}
{{/if}}{{#if discount}}{{cols "Giam gia" (concat "-" (formatNumber discount)) 32}}
{{/if}}{{#if vat}}{{cols "Thue GTGT" (formatNumber vat) 32}}
{{/if}}{{cols "TONG CONG" (formatNumber total) 32}}
{{repeat "=" 32}}
Cam on quy khach!`;

const SAMPLE_DATA = {
  code: 'HD00125',
  date: '2026-01-15T09:30:00.000Z',
  shop: {
    name: 'CỬA HÀNG ABC',
    address: '12 Nguyễn Trãi, Thanh Xuân, Hà Nội',
    phone: '0900 123 456',
    taxCode: '0101234567',
  },
  customer: { name: 'Nguyễn Văn A', phone: '0987 654 321' },
  items: [
    { name: 'Cà phê sữa đá', qty: 2, price: 35000 },
    { name: 'Bánh mì thịt nướng', qty: 1, price: 25000, note: 'không rau' },
    { name: 'Trà đào cam sả', qty: 1, price: 45000 },
  ],
  subtotal: 140000,
  discount: 10000,
  vat: 0,
  total: 130000,
};

const VAT_INVOICE_A4 = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><style>
  * { font-family: "Times New Roman", Times, serif; box-sizing: border-box; }
  body { margin: 0; font-size: 13px; color: #000; line-height: 1.45; }
  .display-note { text-align: center; font-style: italic; font-size: 11px; color: #444; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-top: 4px; }
  .title { flex: 1; text-align: center; }
  .title h1 { font-size: 19px; font-weight: 700; margin: 0; text-transform: uppercase; letter-spacing: .02em; }
  .title .date { font-style: italic; margin-top: 2px; }
  .serial { width: 195px; font-size: 12px; }
  .serial div { display: flex; justify-content: space-between; gap: 8px; }
  .serial strong { font-weight: 700; }
  .party { border: 1px solid #000; padding: 8px 10px; margin-top: 12px; }
  .party + .party { border-top: none; }
  .row { display: flex; gap: 10px; }
  .row > div { flex: 1; }
  .label { display: inline-block; }
  .value { font-weight: 700; }
  .dotted { border-bottom: 1px dotted #666; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 12px; }
  table.items th, table.items td { border: 1px solid #000; padding: 5px 6px; vertical-align: top; }
  table.items th { text-align: center; font-weight: 700; background: #f2f2f2; }
  table.items td.num { text-align: right; white-space: nowrap; }
  table.items td.center { text-align: center; }
  .colno { font-size: 10px; font-style: italic; text-align: center; }
  .sums { width: 100%; border-collapse: collapse; }
  .sums td { padding: 3px 6px; }
  .sums td.label { text-align: right; }
  .sums td.num { text-align: right; white-space: nowrap; font-weight: 700; width: 150px; }
  .words { margin-top: 6px; font-style: italic; }
  .sign { display: flex; gap: 16px; margin-top: 18px; text-align: center; }
  .sign > div { flex: 1; }
  .sign .role { font-weight: 700; }
  .sign .hint { font-style: italic; font-size: 11px; color: #444; }
  .digital { display: inline-block; border: 1px solid #1a7f37; color: #1a7f37; border-radius: 4px;
             padding: 6px 10px; margin-top: 26px; text-align: left; font-size: 11px; line-height: 1.35; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 18px;
          border-top: 1px solid #999; padding-top: 8px; font-size: 11px; }
</style></head>
<body>
  <div class="display-note">(Bản thể hiện của hoá đơn điện tử)</div>

  <div class="top">
    <div class="title">
      <h1>Hoá đơn giá trị gia tăng</h1>
      <div class="date">Ngày {{formatDate invoice.date day="2-digit"}} tháng {{formatDate invoice.date month="2-digit"}} năm {{formatDate invoice.date year="numeric"}}</div>
      {{#if invoice.taxAuthorityCode}}
      <div style="margin-top:4px">Mã của cơ quan thuế: <strong>{{invoice.taxAuthorityCode}}</strong></div>
      {{/if}}
    </div>
    <div class="serial">
      <div><span>Mẫu số</span><strong>{{invoice.form}}</strong></div>
      <div><span>Ký hiệu</span><strong>{{invoice.serial}}</strong></div>
      <div><span>Số</span><strong>{{invoice.number}}</strong></div>
    </div>
  </div>

  <div class="party">
    <div>Đơn vị bán hàng: <span class="value">{{seller.name}}</span></div>
    <div>Mã số thuế: <span class="value">{{seller.taxCode}}</span></div>
    <div>Địa chỉ: {{seller.address}}</div>
    <div class="row">
      <div>Điện thoại: {{seller.phone}}</div>
      {{#if seller.bankAccount}}<div>Số tài khoản: {{seller.bankAccount}}{{#if seller.bankName}} - {{seller.bankName}}{{/if}}</div>{{/if}}
    </div>
  </div>

  <div class="party">
    <div>Họ tên người mua hàng: <span class="value">{{buyer.name}}</span></div>
    <div>Tên đơn vị: {{buyer.company}}</div>
    <div>Mã số thuế: {{buyer.taxCode}}</div>
    <div>Địa chỉ: {{buyer.address}}</div>
    <div class="row">
      <div>Hình thức thanh toán: {{invoice.paymentMethod}}</div>
      <div>Đồng tiền thanh toán: {{#if invoice.currency}}{{invoice.currency}}{{else}}VND{{/if}}</div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:34px">STT</th>
        <th>Tên hàng hoá, dịch vụ</th>
        <th style="width:62px">Đơn vị tính</th>
        <th style="width:58px">Số lượng</th>
        <th style="width:96px">Đơn giá</th>
        <th style="width:110px">Thành tiền</th>
      </tr>
      <tr class="colno">
        <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6 = 4 x 5</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td class="center">{{inc @index}}</td>
        <td>{{name}}{{#if note}}<div style="font-style:italic;color:#555">{{note}}</div>{{/if}}</td>
        <td class="center">{{unit}}</td>
        <td class="num">{{formatNumber qty digits=0}}</td>
        <td class="num">{{formatNumber price}}</td>
        <td class="num">{{formatNumber (mul qty price)}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <table class="sums" style="margin-top:8px">
    {{#if discount}}
    <tr><td class="label">Chiết khấu thương mại:</td><td class="num">-{{formatNumber discount}}</td></tr>
    {{/if}}
    <tr><td class="label">Cộng tiền hàng:</td><td class="num">{{formatNumber subtotal}}</td></tr>
    <tr><td class="label">Thuế suất GTGT: {{vatRate}}% - Tiền thuế GTGT:</td><td class="num">{{formatNumber vatAmount}}</td></tr>
    <tr><td class="label" style="font-size:14px">Tổng cộng tiền thanh toán:</td><td class="num" style="font-size:14px">{{formatNumber total}}</td></tr>
  </table>

  <div class="words">Số tiền viết bằng chữ: {{vndWords total}} đồng.</div>

  <div class="sign">
    <div>
      <div class="role">Người mua hàng</div>
      <div class="hint">(Chữ ký số, nếu có)</div>
    </div>
    <div>
      <div class="role">Người bán hàng</div>
      <div class="hint">(Chữ ký số)</div>
      {{#if signer}}
      <div class="digital">
        Signature Valid<br>
        Ký bởi: {{signer}}<br>
        Ký ngày: {{formatDate signedAt day="2-digit" month="2-digit" year="numeric"}} {{formatDate signedAt hour="2-digit" minute="2-digit"}}
      </div>
      {{/if}}
    </div>
  </div>

  <div class="foot">
    <div>
      <div>Tra cứu hoá đơn tại: {{invoice.lookupUrl}}</div>
      {{#if invoice.lookupCode}}<div>Mã tra cứu: <strong>{{invoice.lookupCode}}</strong></div>{{/if}}
      <div style="font-style:italic;color:#555">Hoá đơn điện tử theo Nghị định 123/2020/NĐ-CP (sửa đổi tại Nghị định 70/2025/NĐ-CP) và Thông tư 78/2021/TT-BTC.</div>
    </div>
    <div>{{qr (or invoice.lookupQr invoice.lookupUrl) size=86}}</div>
  </div>
</body></html>`;

const POS_INVOICE_80MM = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><style>
  @page { margin: 0; }
  body { width: 72mm; margin: 0 auto; padding: 3mm 0 6mm; font-size: 11px; color: #000;
         font-family: "Helvetica Neue", Arial, sans-serif; line-height: 1.4; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  h1 { font-size: 13px; margin: 0; text-transform: uppercase; }
  h2 { font-size: 12px; margin: 6px 0 0; text-transform: uppercase; }
  .sub { font-size: 10px; font-style: italic; }
  hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  .total td { font-size: 13px; font-weight: 700; padding-top: 3px; }
  .words { font-style: italic; font-size: 10px; }
  .code { word-break: break-all; font-size: 9px; }
</style></head>
<body>
  <div class="center">
    <h1>{{seller.name}}</h1>
    <div>MST: {{seller.taxCode}}</div>
    <div>{{seller.address}}</div>
    {{#if seller.phone}}<div>ĐT: {{seller.phone}}</div>{{/if}}
    <h2>Hoá đơn giá trị gia tăng</h2>
    <div class="sub">(Hoá đơn điện tử khởi tạo từ máy tính tiền)</div>
  </div>
  <hr>
  <table>
    <tr><td>Ký hiệu</td><td class="num bold">{{invoice.serial}}</td></tr>
    <tr><td>Số hoá đơn</td><td class="num bold">{{invoice.number}}</td></tr>
    <tr><td>Ngày</td><td class="num">{{formatDate invoice.date day="2-digit" month="2-digit" year="numeric"}} {{formatDate invoice.date hour="2-digit" minute="2-digit"}}</td></tr>
    {{#if invoice.cashier}}<tr><td>Thu ngân</td><td class="num">{{invoice.cashier}}</td></tr>{{/if}}
  </table>
  {{#if buyer.name}}
  <hr>
  <div>Khách hàng: {{buyer.name}}</div>
  {{#if buyer.taxCode}}<div>MST người mua: {{buyer.taxCode}}</div>{{/if}}
  {{#if buyer.address}}<div>Địa chỉ: {{buyer.address}}</div>{{/if}}
  {{/if}}
  <hr>
  <table>
    {{#each items}}
    <tr><td colspan="2" class="bold">{{name}}</td></tr>
    <tr>
      <td>{{formatNumber qty digits=0}} {{unit}} x {{formatNumber price}}</td>
      <td class="num">{{formatNumber (mul qty price)}}</td>
    </tr>
    {{/each}}
  </table>
  <hr>
  <table>
    {{#if discount}}<tr><td>Chiết khấu</td><td class="num">-{{formatNumber discount}}</td></tr>{{/if}}
    <tr><td>Cộng tiền hàng</td><td class="num">{{formatNumber subtotal}}</td></tr>
    <tr><td>Thuế GTGT {{vatRate}}%</td><td class="num">{{formatNumber vatAmount}}</td></tr>
    <tr class="total"><td>TỔNG THANH TOÁN</td><td class="num">{{formatNumber total}}</td></tr>
    {{#if payment.cash}}<tr><td>Tiền khách đưa</td><td class="num">{{formatNumber payment.cash}}</td></tr>{{/if}}
    {{#if payment.change}}<tr><td>Tiền thối lại</td><td class="num">{{formatNumber payment.change}}</td></tr>{{/if}}
    {{#if payment.method}}<tr><td>Hình thức</td><td class="num">{{payment.method}}</td></tr>{{/if}}
  </table>
  <div class="words">Bằng chữ: {{vndWords total}} đồng.</div>
  <hr>
  {{#if invoice.taxAuthorityCode}}
  <div>Mã của cơ quan thuế:</div>
  <div class="code bold">{{invoice.taxAuthorityCode}}</div>
  {{/if}}
  <div class="center" style="margin-top:5px">{{qr (or invoice.lookupQr invoice.lookupUrl) size=110}}</div>
  <div class="center" style="margin-top:3px">Tra cứu tại {{invoice.lookupUrl}}</div>
  <div class="center bold" style="margin-top:5px">Cảm ơn quý khách!</div>
</body></html>`;

const CASH_RECEIPT_A5 = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><style>
  * { font-family: "Times New Roman", Times, serif; box-sizing: border-box; }
  body { margin: 0; font-size: 13px; color: #000; line-height: 1.5; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .unit { font-size: 12px; }
  .unit .name { font-weight: 700; text-transform: uppercase; }
  .form { width: 210px; text-align: center; font-size: 11px; }
  .form .code { font-weight: 700; font-size: 12px; }
  .form .ref { font-style: italic; line-height: 1.3; }
  .title { text-align: center; margin-top: 10px; }
  .title h1 { font-size: 20px; margin: 0; text-transform: uppercase; letter-spacing: .04em; }
  .title .date { font-style: italic; margin-top: 2px; }
  .meta { display: flex; justify-content: flex-end; }
  .meta table { font-size: 12px; }
  .meta td { padding: 0 0 0 10px; }
  .body { margin-top: 10px; }
  .line { margin-top: 5px; }
  .fill { border-bottom: 1px dotted #555; display: inline-block; min-width: 40px; }
  .amount { font-weight: 700; }
  .sign { display: flex; margin-top: 18px; text-align: center; font-size: 12px; }
  .sign > div { flex: 1; }
  .sign .role { font-weight: 700; }
  .sign .hint { font-style: italic; font-size: 11px; }
  .sign .space { height: 52px; }
  .tail { margin-top: 12px; font-size: 12px; }
</style></head>
<body>
  <div class="head">
    <div class="unit">
      <div class="name">{{unit.name}}</div>
      <div>{{unit.address}}</div>
      {{#if unit.taxCode}}<div>MST: {{unit.taxCode}}</div>{{/if}}
    </div>
    <div class="form">
      <div class="code">Mẫu số 01 - TT</div>
      <div class="ref">(Ban hành theo Thông tư số 133/2016/TT-BTC ngày 26/8/2016 của Bộ Tài chính)</div>
    </div>
  </div>

  <div class="title">
    <h1>Phiếu thu</h1>
    <div class="date">Ngày {{formatDate receipt.date day="2-digit"}} tháng {{formatDate receipt.date month="2-digit"}} năm {{formatDate receipt.date year="numeric"}}</div>
  </div>

  <div class="meta">
    <table>
      <tr><td>Quyển số:</td><td><strong>{{receipt.book}}</strong></td></tr>
      <tr><td>Số:</td><td><strong>{{receipt.number}}</strong></td></tr>
      <tr><td>Nợ:</td><td>{{receipt.debitAccount}}</td></tr>
      <tr><td>Có:</td><td>{{receipt.creditAccount}}</td></tr>
    </table>
  </div>

  <div class="body">
    <div class="line">Họ và tên người nộp tiền: <strong>{{payer.name}}</strong></div>
    <div class="line">Địa chỉ: {{payer.address}}</div>
    <div class="line">Lý do nộp: {{reason}}</div>
    <div class="line">Số tiền: <span class="amount">{{formatNumber amount}}</span> {{#if this.currency}}{{this.currency}}{{else}}VND{{/if}}</div>
    <div class="line">(Viết bằng chữ): <em>{{vndWords amount}} đồng.</em></div>
    <div class="line">Kèm theo: {{receipt.attachments}} chứng từ gốc.</div>
  </div>

  <div class="sign">
    <div>
      <div class="role">Giám đốc</div>
      <div class="hint">(Ký, họ tên, đóng dấu)</div>
      <div class="space"></div>
    </div>
    <div>
      <div class="role">Kế toán trưởng</div>
      <div class="hint">(Ký, họ tên)</div>
      <div class="space"></div>
    </div>
    <div>
      <div class="role">Người nộp tiền</div>
      <div class="hint">(Ký, họ tên)</div>
      <div class="space"></div>
    </div>
    <div>
      <div class="role">Người lập phiếu</div>
      <div class="hint">(Ký, họ tên)</div>
      <div class="space"></div>
    </div>
    <div>
      <div class="role">Thủ quỹ</div>
      <div class="hint">(Ký, họ tên)</div>
      <div class="space"></div>
    </div>
  </div>

  <div class="tail">
    <div>Đã nhận đủ số tiền (viết bằng chữ): {{vndWords amount}} đồng.</div>
    {{#if exchangeRate}}
    <div>+ Tỷ giá ngoại tệ: {{formatNumber exchangeRate digits=2}}</div>
    <div>+ Số tiền quy đổi: {{formatNumber convertedAmount}}</div>
    {{/if}}
  </div>
</body></html>`;

const VAT_INVOICE_DATA = {
  invoice: {
    form: '1',
    serial: 'C26TAA',
    number: '00000125',
    date: '2026-01-15T03:00:00.000Z',
    taxAuthorityCode: '00A1B2C3D4E5F60718293A4B5C6D7E8F90',
    lookupUrl: 'https://hoadondientu.gdt.gov.vn',
    lookupQr: 'https://hoadondientu.gdt.gov.vn/tra-cuu?mst=0101234567&hd=C26TAA-00000125',
    lookupCode: 'A1B2C3D4E5',
    paymentMethod: 'Chuyển khoản',
    currency: 'VND',
  },
  seller: {
    name: 'CÔNG TY TNHH THƯƠNG MẠI ABC',
    taxCode: '0101234567',
    address: 'Số 12 Nguyễn Trãi, phường Thanh Xuân, thành phố Hà Nội',
    phone: '024 3555 1234',
    bankAccount: '0011 0012 3456',
    bankName: 'Vietcombank chi nhánh Hà Nội',
  },
  buyer: {
    name: 'Nguyễn Văn A',
    company: 'CÔNG TY CỔ PHẦN XYZ',
    taxCode: '0109876543',
    address: 'Số 8 Lê Lợi, phường Bến Nghé, Thành phố Hồ Chí Minh',
  },
  items: [
    { name: 'Máy in nhiệt khổ 80mm', unit: 'Chiếc', qty: 2, price: 2500000 },
    { name: 'Giấy in nhiệt K80 (thùng 50 cuộn)', unit: 'Thùng', qty: 3, price: 850000 },
    { name: 'Dịch vụ lắp đặt và cấu hình', unit: 'Lần', qty: 1, price: 500000 },
  ],
  discount: 0,
  subtotal: 8050000,
  vatRate: 10,
  vatAmount: 805000,
  total: 8855000,
  signer: 'CÔNG TY TNHH THƯƠNG MẠI ABC',
  signedAt: '2026-01-15T03:05:00.000Z',
};

const POS_INVOICE_DATA = {
  invoice: {
    serial: 'C26MAA',
    number: '00004312',
    date: '2026-01-15T11:42:00.000Z',
    taxAuthorityCode: '00A1B2C3D4E5F60718293A4B5C6D7E8F90',
    lookupUrl: 'https://hoadondientu.gdt.gov.vn',
    lookupQr: 'https://hoadondientu.gdt.gov.vn/tra-cuu?mst=0101234567&hd=C26MAA-00004312',
    cashier: 'Trần Thị B',
  },
  seller: {
    name: 'NHÀ HÀNG ABC',
    taxCode: '0101234567',
    address: 'Số 12 Nguyễn Trãi, phường Thanh Xuân, thành phố Hà Nội',
    phone: '0900 123 456',
  },
  buyer: { name: 'Khách lẻ', taxCode: '', address: '' },
  items: [
    { name: 'Cơm gà xối mỡ', unit: 'Phần', qty: 2, price: 65000 },
    { name: 'Canh chua cá lóc', unit: 'Tô', qty: 1, price: 85000 },
    { name: 'Trà đá', unit: 'Ly', qty: 3, price: 5000 },
  ],
  discount: 0,
  subtotal: 230000,
  vatRate: 8,
  vatAmount: 18400,
  total: 248400,
  payment: { method: 'Tiền mặt', cash: 300000, change: 51600 },
};

const CASH_RECEIPT_DATA = {
  unit: {
    name: 'CÔNG TY TNHH THƯƠNG MẠI ABC',
    address: 'Số 12 Nguyễn Trãi, phường Thanh Xuân, thành phố Hà Nội',
    taxCode: '0101234567',
  },
  receipt: {
    book: '01/2026',
    number: '000125',
    date: '2026-01-15T04:00:00.000Z',
    debitAccount: '1111',
    creditAccount: '131',
    attachments: 2,
  },
  payer: {
    name: 'Nguyễn Văn A',
    address: 'CÔNG TY CỔ PHẦN XYZ, số 8 Lê Lợi, phường Bến Nghé, Thành phố Hồ Chí Minh',
  },
  reason: 'Thanh toán tiền hàng theo hoá đơn số 00000125 ngày 15/01/2026',
  amount: 8855000,
  currency: 'VND',
};

const SEEDS = [
  {
    id: 'invoice-a4',
    name: 'Hoá đơn A4',
    description: 'Hoá đơn bán hàng khổ A4, có mã QR',
    engine: 'html',
    content: INVOICE_A4,
    page: { format: 'A4', marginTop: '14mm', marginRight: '14mm', marginBottom: '14mm', marginLeft: '14mm' },
    sampleData: SAMPLE_DATA,
  },
  {
    id: 'bill-80mm',
    name: 'Bill máy in nhiệt 80mm',
    description: 'Hoá đơn khổ 80mm cho máy in nhiệt, render qua PDF',
    engine: 'html',
    content: BILL_80MM,
    page: { width: '80mm', height: '297mm', marginTop: '0mm', marginRight: '0mm', marginBottom: '0mm', marginLeft: '0mm' },
    sampleData: SAMPLE_DATA,
  },
  {
    id: 'receipt-escpos',
    name: 'Bill ESC/POS (text raw)',
    description: 'In text thuần gửi thẳng máy in nhiệt qua chế độ raw, không qua PDF',
    engine: 'text',
    content: RECEIPT_TEXT,
    page: {},
    printing: { raw: true },
    sampleData: SAMPLE_DATA,
  },
  {
    id: 'vat-invoice-a4',
    name: 'Hoá đơn GTGT A4 (bản thể hiện HĐĐT)',
    description:
      'Bản thể hiện hoá đơn điện tử khổ A4 với đủ tiêu thức theo Nghị định 123/2020/NĐ-CP (sửa đổi tại Nghị định 70/2025/NĐ-CP): mẫu số, ký hiệu, số hoá đơn, mã cơ quan thuế, MST hai bên, đơn vị tính, thuế suất, tiền thuế, tiền bằng chữ, khối chữ ký số và QR tra cứu',
    engine: 'html',
    content: VAT_INVOICE_A4,
    page: { format: 'A4', marginTop: '12mm', marginRight: '12mm', marginBottom: '12mm', marginLeft: '12mm' },
    sampleData: VAT_INVOICE_DATA,
  },
  {
    id: 'pos-invoice-80mm',
    name: 'Hoá đơn máy tính tiền 80mm',
    description:
      'Hoá đơn điện tử khởi tạo từ máy tính tiền khổ 80mm theo Nghị định 70/2025/NĐ-CP: MST người bán, ký hiệu và số hoá đơn, thuế suất, mã cơ quan thuế và QR tra cứu',
    engine: 'html',
    content: POS_INVOICE_80MM,
    page: { width: '80mm', height: 'auto', marginTop: '0mm', marginRight: '0mm', marginBottom: '0mm', marginLeft: '0mm' },
    sampleData: POS_INVOICE_DATA,
  },
  {
    id: 'cash-receipt-a5',
    name: 'Phiếu thu 01-TT (A5)',
    description:
      'Phiếu thu tiền mặt theo Mẫu số 01-TT ban hành kèm Thông tư 133/2016/TT-BTC: quyển số, số phiếu, tài khoản nợ/có, số tiền bằng số và bằng chữ, đủ 5 ô chữ ký',
    engine: 'html',
    content: CASH_RECEIPT_A5,
    page: { format: 'A5', marginTop: '10mm', marginRight: '12mm', marginBottom: '10mm', marginLeft: '12mm' },
    sampleData: CASH_RECEIPT_DATA,
  },
];

const SEED_SETS = { vi: SEEDS, en: SEEDS_EN };

function seedsFor(locale) {
  return SEED_SETS[String(locale ?? '').toLowerCase().slice(0, 2)] ?? SEEDS;
}

/** Bộ mẫu của một ngôn ngữ, chỉ phần mô tả để UI liệt kê trước khi tạo. */
export function seedCatalog(locale) {
  return seedsFor(locale).map((seed) => ({
    id: seed.id,
    name: seed.name,
    description: seed.description,
    engine: seed.engine,
  }));
}

function readSeeded(marker) {
  if (!existsSync(marker)) return [];
  try {
    const parsed = JSON.parse(readFileSync(marker, 'utf8'));
    return Array.isArray(parsed?.seeded) ? parsed.seeded : [];
  } catch {
    // Marker đời cũ chỉ chứa timestamp, coi như đã tạo xong bộ mẫu đầu tiên.
    return ['invoice-a4', 'bill-80mm', 'receipt-escpos'];
  }
}

/**
 * Tạo bộ mẫu của một ngôn ngữ. Chỉ chạy khi người dùng đồng ý ở màn cài đặt,
 * nên `force` bỏ qua marker để tạo thêm bộ ngôn ngữ khác lúc nào cũng được.
 */
export function seedTemplates({ locale, force = false } = {}) {
  const marker = path.join(PATHS.templates, '.seeded');
  const seeded = new Set(readSeeded(marker));
  const hasTemplates = listTemplates().length > 0;
  if (!force && seeded.size === 0 && hasTemplates) return 0;

  let created = 0;
  const skipped = [];
  for (const seed of seedsFor(locale)) {
    if (templateExists(seed.id)) {
      seeded.add(seed.id);
      skipped.push(seed.id);
      continue;
    }
    if (!force && seeded.has(seed.id)) {
      skipped.push(seed.id);
      continue;
    }
    try {
      createTemplate(seed);
      seeded.add(seed.id);
      created += 1;
    } catch (error) {
      log.warn(t('templates.seed_failed', { id: seed.id, message: error.message }));
    }
  }
  writeFileSync(marker, JSON.stringify({ seeded: [...seeded], updatedAt: new Date().toISOString() }, null, 2));
  if (created > 0) log.info(t('templates.seed_created', { count: created }));
  return { created, skipped: skipped.length, total: seedsFor(locale).length };
}
