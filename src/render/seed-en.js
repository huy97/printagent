const INVOICE_A4 = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
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
      <div class="muted">{{shop.phone}}{{#if shop.taxCode}} &middot; VAT no: {{shop.taxCode}}{{/if}}</div>
    </div>
    <div style="text-align:right">
      <div><strong>INVOICE {{code}}</strong></div>
      <div class="muted">{{formatDate date locale="en-US" dateStyle="medium" timeStyle="short"}}</div>
      <div class="muted">Bill to: {{customer.name}}</div>
      {{#if customer.phone}}<div class="muted">{{customer.phone}}</div>{{/if}}
    </div>
  </div>

  <table>
    <thead>
      <tr><th style="width:32px">#</th><th>Description</th><th class="num">Qty</th>
          <th class="num">Unit price</th><th class="num">Amount</th></tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{inc @index}}</td>
        <td>{{name}}{{#if note}}<div class="muted">{{note}}</div>{{/if}}</td>
        <td class="num">{{qty}}</td>
        <td class="num">{{currency price locale="en-US" currency=../currency}}</td>
        <td class="num">{{currency (mul qty price) locale="en-US" currency=../currency}}</td>
      </tr>
      {{/each}}
    </tbody>
    <tfoot>
      {{#if subtotal}}<tr><td colspan="4" class="num">Subtotal</td><td class="num">{{currency subtotal locale="en-US" currency=currency}}</td></tr>{{/if}}
      {{#if discount}}<tr><td colspan="4" class="num">Discount</td><td class="num">-{{currency discount locale="en-US" currency=currency}}</td></tr>{{/if}}
      {{#if vat}}<tr><td colspan="4" class="num">Tax</td><td class="num">{{currency vat locale="en-US" currency=currency}}</td></tr>{{/if}}
      <tr class="total"><td colspan="4" class="num">Total</td><td class="num">{{currency total locale="en-US" currency=currency}}</td></tr>
    </tfoot>
  </table>

  <div style="margin-top:28px; display:flex; justify-content:space-between; align-items:flex-end">
    <div>
      <div class="muted">Amount in words</div>
      <div style="max-width:340px">{{enWords total currency=currency}}</div>
      <div class="muted" style="margin-top:12px">Thank you for your business.</div>
    </div>
    <div>{{qr code size=90}}</div>
  </div>
</body></html>`;

const BILL_80MM = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
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
  <div>Receipt: <strong>{{code}}</strong></div>
  <div>{{formatDate date locale="en-US" dateStyle="medium" timeStyle="short"}}</div>
  {{#if customer.name}}<div>Customer: {{customer.name}}</div>{{/if}}
  <hr>
  <table>
    {{#each items}}
    <tr><td colspan="2">{{name}}</td></tr>
    <tr><td>{{qty}} x {{formatNumber price locale="en-US" digits=2}}</td><td class="num">{{formatNumber (mul qty price) locale="en-US" digits=2}}</td></tr>
    {{/each}}
  </table>
  <hr>
  <table>
    {{#if subtotal}}<tr><td>Subtotal</td><td class="num">{{formatNumber subtotal locale="en-US" digits=2}}</td></tr>{{/if}}
    {{#if discount}}<tr><td>Discount</td><td class="num">-{{formatNumber discount locale="en-US" digits=2}}</td></tr>{{/if}}
    {{#if vat}}<tr><td>Tax</td><td class="num">{{formatNumber vat locale="en-US" digits=2}}</td></tr>{{/if}}
    <tr class="total"><td>TOTAL</td><td class="num">{{formatNumber total locale="en-US" digits=2}}</td></tr>
  </table>
  <hr>
  <div class="center">{{qr code size=80}}</div>
  <div class="center" style="margin-top:4px">Thank you, please come again!</div>
</body></html>`;

const RECEIPT_TEXT = `{{shop.name}}
{{shop.address}}
Tel: {{shop.phone}}{{#if shop.taxCode}}
VAT no: {{shop.taxCode}}{{/if}}
{{repeat "=" 32}}
SALES RECEIPT
No: {{code}}
Date: {{formatDate date locale="en-US" day="2-digit" month="2-digit" year="numeric"}} {{formatDate date locale="en-US" hour="2-digit" minute="2-digit"}}{{#if customer.name}}
Customer: {{customer.name}}{{/if}}
{{repeat "-" 32}}
{{#each items}}{{name}}
{{cols (concat "  " qty " x " (formatNumber price locale="en-US" digits=2)) (formatNumber (mul qty price) locale="en-US" digits=2) 32}}
{{/each}}{{repeat "-" 32}}
{{#if subtotal}}{{cols "Subtotal" (formatNumber subtotal locale="en-US" digits=2) 32}}
{{/if}}{{#if discount}}{{cols "Discount" (concat "-" (formatNumber discount locale="en-US" digits=2)) 32}}
{{/if}}{{#if vat}}{{cols "Tax" (formatNumber vat locale="en-US" digits=2) 32}}
{{/if}}{{cols "TOTAL" (formatNumber total locale="en-US" digits=2) 32}}
{{repeat "=" 32}}
Thank you, please come again!`;

const SAMPLE_DATA = {
  code: 'INV-00125',
  date: '2026-01-15T09:30:00.000Z',
  currency: 'USD',
  shop: {
    name: 'ABC TRADING LTD',
    address: '128 Market Street, Suite 400, San Francisco, CA 94103',
    phone: '+1 415 555 0142',
    taxCode: 'US-27-1234567',
  },
  customer: { name: 'John Carter', phone: '+1 415 555 0199' },
  items: [
    { name: 'Iced latte', qty: 2, price: 4.5 },
    { name: 'Grilled chicken sandwich', qty: 1, price: 8.75, note: 'no onions' },
    { name: 'Peach iced tea', qty: 1, price: 3.95 },
  ],
  subtotal: 21.7,
  discount: 2,
  vat: 1.77,
  total: 21.47,
};

const TAX_INVOICE_A4 = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
  * { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; box-sizing: border-box; }
  body { font-size: 12px; color: #111; margin: 0; }
  .title { text-align: center; margin-bottom: 14px; }
  .title h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: .04em; }
  .title .sub { color: #555; font-size: 11px; }
  .meta { display: flex; justify-content: space-between; gap: 18px; font-size: 11px; color: #444; margin-bottom: 14px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .party { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; }
  .party h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #666; margin: 0 0 6px; }
  .party .row { display: flex; gap: 6px; padding: 1.5px 0; }
  .party .label { color: #777; min-width: 74px; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th { background: #f4f4f5; border: 1px solid #ccc; padding: 6px 7px; font-size: 10.5px;
                   text-transform: uppercase; letter-spacing: .04em; color: #555; }
  table.items td { border: 1px solid #ddd; padding: 6px 7px; }
  .num { text-align: right; white-space: nowrap; }
  .center { text-align: center; }
  tfoot td { font-weight: 600; background: #fafafa; }
  .words { margin-top: 10px; font-size: 11.5px; }
  .words .label { color: #777; }
  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 26px; text-align: center; font-size: 11px; }
  .signs .box { border: 1px dashed #bbb; border-radius: 6px; padding: 10px; min-height: 96px; }
  .signs .role { font-weight: 600; }
  .signs .note { color: #888; font-size: 10px; margin-top: 4px; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 18px;
          font-size: 10.5px; color: #666; }
</style></head>
<body>
  <div class="title">
    <h1>TAX INVOICE</h1>
    <div class="sub">Original for recipient</div>
  </div>

  <div class="meta">
    <div>
      <div><strong>Invoice no:</strong> {{invoice.number}}</div>
      <div><strong>Issue date:</strong> {{formatDate invoice.date locale="en-US" dateStyle="long"}}</div>
      {{#if invoice.dueDate}}<div><strong>Due date:</strong> {{formatDate invoice.dueDate locale="en-US" dateStyle="long"}}</div>{{/if}}
    </div>
    <div style="text-align:right">
      {{#if invoice.orderRef}}<div><strong>Order ref:</strong> {{invoice.orderRef}}</div>{{/if}}
      {{#if invoice.terms}}<div><strong>Payment terms:</strong> {{invoice.terms}}</div>{{/if}}
      <div><strong>Currency:</strong> {{currencyCode}}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h2>Supplier</h2>
      <div class="row"><span class="label">Name</span><span><strong>{{seller.name}}</strong></span></div>
      <div class="row"><span class="label">VAT no</span><span>{{seller.taxCode}}</span></div>
      <div class="row"><span class="label">Address</span><span>{{seller.address}}</span></div>
      {{#if seller.phone}}<div class="row"><span class="label">Phone</span><span>{{seller.phone}}</span></div>{{/if}}
      {{#if seller.bankAccount}}<div class="row"><span class="label">Bank</span><span>{{seller.bankAccount}}{{#if seller.bankName}} &middot; {{seller.bankName}}{{/if}}</span></div>{{/if}}
    </div>
    <div class="party">
      <h2>Customer</h2>
      <div class="row"><span class="label">Name</span><span><strong>{{buyer.name}}</strong></span></div>
      {{#if buyer.taxCode}}<div class="row"><span class="label">VAT no</span><span>{{buyer.taxCode}}</span></div>{{/if}}
      <div class="row"><span class="label">Address</span><span>{{buyer.address}}</span></div>
      {{#if buyer.email}}<div class="row"><span class="label">Email</span><span>{{buyer.email}}</span></div>{{/if}}
      {{#if buyer.payment}}<div class="row"><span class="label">Payment</span><span>{{buyer.payment}}</span></div>{{/if}}
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Description</th>
        <th style="width:52px">Unit</th>
        <th style="width:46px" class="num">Qty</th>
        <th style="width:88px" class="num">Unit price</th>
        <th style="width:56px" class="num">Tax %</th>
        <th style="width:96px" class="num">Net amount</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td class="center">{{inc @index}}</td>
        <td>{{name}}</td>
        <td class="center">{{unit}}</td>
        <td class="num">{{formatNumber qty locale="en-US" digits=2}}</td>
        <td class="num">{{formatNumber price locale="en-US" digits=2}}</td>
        <td class="num">{{#if taxRate}}{{taxRate}}%{{else}}{{../taxRate}}%{{/if}}</td>
        <td class="num">{{formatNumber (mul qty price) locale="en-US" digits=2}}</td>
      </tr>
      {{/each}}
    </tbody>
    <tfoot>
      <tr><td colspan="6" class="num">Net total</td><td class="num">{{formatNumber subtotal locale="en-US" digits=2}}</td></tr>
      {{#if discount}}<tr><td colspan="6" class="num">Discount</td><td class="num">-{{formatNumber discount locale="en-US" digits=2}}</td></tr>{{/if}}
      <tr><td colspan="6" class="num">Tax ({{taxRate}}%)</td><td class="num">{{formatNumber taxAmount locale="en-US" digits=2}}</td></tr>
      <tr><td colspan="6" class="num">Total due</td><td class="num">{{formatNumber total locale="en-US" digits=2}}</td></tr>
    </tfoot>
  </table>

  <div class="words">
    <span class="label">Amount in words:</span> <em>{{enWords total currency=currencyCode}}</em>
  </div>

  <div class="signs">
    <div class="box">
      <div class="role">Customer</div>
      <div class="note">Signature / stamp</div>
    </div>
    <div class="box">
      <div class="role">For and on behalf of {{seller.name}}</div>
      <div class="note">{{#if seller.signedBy}}{{seller.signedBy}}{{else}}Authorised signatory{{/if}}</div>
      {{#if invoice.signedAt}}<div class="note">Signed on {{formatDate invoice.signedAt locale="en-US" dateStyle="medium" timeStyle="short"}}</div>{{/if}}
    </div>
  </div>

  <div class="foot">
    <div>
      {{#if invoice.lookupUrl}}<div>Verify this invoice: {{invoice.lookupUrl}}</div>{{/if}}
      {{#if invoice.note}}<div>{{invoice.note}}</div>{{/if}}
    </div>
    {{#if invoice.lookupUrl}}<div>{{qr invoice.lookupUrl size=78}}</div>{{/if}}
  </div>
</body></html>`;

const POS_RECEIPT_80MM = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
  @page { margin: 0; }
  body { width: 72mm; margin: 0 auto; padding: 4mm 0 6mm; font-family: "Helvetica Neue", Arial, sans-serif;
         font-size: 10.5px; line-height: 1.42; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  h1 { font-size: 13px; margin: 0 0 2px; }
  .kind { font-size: 11.5px; font-weight: 700; letter-spacing: .04em; margin: 5px 0 1px; }
  hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1.5px 0; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  .total td { font-size: 12.5px; font-weight: 700; padding-top: 3px; }
  .meta { font-size: 9.5px; color: #222; }
</style></head>
<body>
  <div class="center">
    <h1>{{seller.name}}</h1>
    <div>{{seller.address}}</div>
    <div>VAT no: {{seller.taxCode}}</div>
    {{#if seller.phone}}<div>Tel: {{seller.phone}}</div>{{/if}}
    <div class="kind">TAX INVOICE</div>
    <div class="meta">No: {{invoice.number}}</div>
    <div class="meta">{{formatDate invoice.date locale="en-US" dateStyle="medium" timeStyle="short"}}</div>
  </div>
  <hr>
  <div>Customer: {{#if buyer.name}}{{buyer.name}}{{else}}Walk-in customer{{/if}}</div>
  {{#if buyer.taxCode}}<div>VAT no: {{buyer.taxCode}}</div>{{/if}}
  {{#if invoice.cashier}}<div>Cashier: {{invoice.cashier}}</div>{{/if}}
  <hr>
  <table>
    {{#each items}}
    <tr><td colspan="2">{{inc @index}}. {{name}}</td></tr>
    <tr>
      <td>&nbsp;&nbsp;{{formatNumber qty locale="en-US"}} {{unit}} x {{formatNumber price locale="en-US" digits=2}}</td>
      <td class="num">{{formatNumber (mul qty price) locale="en-US" digits=2}}</td>
    </tr>
    {{/each}}
  </table>
  <hr>
  <table>
    <tr><td>Net total</td><td class="num">{{formatNumber subtotal locale="en-US" digits=2}}</td></tr>
    {{#if discount}}<tr><td>Discount</td><td class="num">-{{formatNumber discount locale="en-US" digits=2}}</td></tr>{{/if}}
    <tr><td>Tax ({{taxRate}}%)</td><td class="num">{{formatNumber taxAmount locale="en-US" digits=2}}</td></tr>
    <tr class="total"><td>TOTAL</td><td class="num">{{formatNumber total locale="en-US" digits=2}}</td></tr>
    {{#if paid}}<tr><td>Paid ({{#if paymentMethod}}{{paymentMethod}}{{else}}cash{{/if}})</td><td class="num">{{formatNumber paid locale="en-US" digits=2}}</td></tr>{{/if}}
    {{#if change}}<tr><td>Change</td><td class="num">{{formatNumber change locale="en-US" digits=2}}</td></tr>{{/if}}
  </table>
  <hr>
  {{#if invoice.lookupUrl}}
  <div class="center">{{qr invoice.lookupUrl size=76}}</div>
  <div class="center meta" style="margin-top:2px">Scan to verify this invoice</div>
  {{/if}}
  <div class="center" style="margin-top:4px">Thank you, please come again!</div>
</body></html>`;

const CASH_RECEIPT_A5 = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
  * { font-family: -apple-system, "Segoe UI", Roboto, "Times New Roman", serif; box-sizing: border-box; }
  body { font-size: 12.5px; color: #111; margin: 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; font-size: 11.5px; }
  .org { max-width: 58%; }
  .org .name { font-weight: 700; text-transform: uppercase; }
  .org .addr { color: #555; }
  .form { text-align: right; color: #555; }
  .title { text-align: center; margin: 16px 0 4px; }
  .title h1 { font-size: 21px; margin: 0; letter-spacing: .08em; }
  .title .date { margin-top: 4px; }
  .title .serial { margin-top: 2px; color: #555; font-size: 11.5px; }
  .rows { margin-top: 14px; }
  .row { display: flex; gap: 8px; padding: 3.5px 0; align-items: baseline; }
  .row .label { min-width: 132px; color: #444; }
  .row .value { flex: 1; border-bottom: 1px dotted #999; padding-bottom: 1px; }
  .amount { font-weight: 700; }
  .words { font-style: italic; }
  .signs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 26px;
           text-align: center; font-size: 10.5px; }
  .signs .role { font-weight: 700; }
  .signs .note { color: #888; font-size: 9.5px; }
  .signs .space { height: 52px; }
  .foot { margin-top: 14px; font-size: 10.5px; color: #666; }
</style></head>
<body>
  <div class="top">
    <div class="org">
      <div class="name">{{unitName}}</div>
      <div class="addr">{{unitAddress}}</div>
    </div>
    <div class="form">
      <div>Form no: {{#if formNumber}}{{formNumber}}{{else}}CR-01{{/if}}</div>
      {{#if issuedUnder}}<div>{{issuedUnder}}</div>{{/if}}
    </div>
  </div>

  <div class="title">
    <h1>CASH RECEIPT</h1>
    <div class="date">{{formatDate date locale="en-US" dateStyle="long"}}</div>
    <div class="serial">Book no: {{bookNumber}} &middot; Receipt no: {{receiptNumber}}{{#if account}} &middot; Account: {{account}}{{/if}}</div>
  </div>

  <div class="rows">
    <div class="row"><span class="label">Received from</span><span class="value">{{payer.name}}</span></div>
    {{#if payer.address}}<div class="row"><span class="label">Address</span><span class="value">{{payer.address}}</span></div>{{/if}}
    <div class="row"><span class="label">Being payment for</span><span class="value">{{reason}}</span></div>
    <div class="row"><span class="label">Amount</span><span class="value amount">{{currency amount locale="en-US" currency=currencyCode}}</span></div>
    <div class="row"><span class="label">In words</span><span class="value words">{{enWords amount currency=currencyCode}}</span></div>
    <div class="row"><span class="label">Payment method</span><span class="value">{{#if method}}{{method}}{{else}}Cash{{/if}}</span></div>
    {{#if attachments}}<div class="row"><span class="label">Attachments</span><span class="value">{{attachments}}</span></div>{{/if}}
  </div>

  <div class="signs">
    <div><div class="role">Director</div><div class="note">Signature, full name</div><div class="space"></div></div>
    <div><div class="role">Chief accountant</div><div class="note">Signature, full name</div><div class="space"></div></div>
    <div><div class="role">Preparer</div><div class="note">Signature, full name</div><div class="space"></div></div>
    <div><div class="role">Cashier</div><div class="note">Signature, full name</div><div class="space"></div></div>
    <div><div class="role">Payer</div><div class="note">Signature, full name</div><div class="space"></div></div>
  </div>

  {{#if note}}<div class="foot">{{note}}</div>{{/if}}
</body></html>`;

const TAX_INVOICE_DATA = {
  currencyCode: 'USD',
  invoice: {
    number: 'INV-2026-00125',
    date: '2026-01-15T08:20:00.000Z',
    dueDate: '2026-02-14T00:00:00.000Z',
    orderRef: 'PO-88213',
    terms: 'Net 30',
    signedAt: '2026-01-15T08:25:00.000Z',
    lookupUrl: 'https://invoices.example.com/verify/INV-2026-00125',
    note: 'Please quote the invoice number with your payment.',
  },
  seller: {
    name: 'ABC TRADING LTD',
    taxCode: 'US-27-1234567',
    address: '128 Market Street, Suite 400, San Francisco, CA 94103',
    phone: '+1 415 555 0142',
    bankName: 'First National Bank',
    bankAccount: 'IBAN US64 SVBK 0000 0000 1234 5678',
    signedBy: 'Emily Nguyen, Finance Director',
  },
  buyer: {
    name: 'Northwind Supplies Inc.',
    taxCode: 'US-45-7654321',
    address: '900 Harbor Blvd, Seattle, WA 98101',
    email: 'ap@northwind.example.com',
    payment: 'Bank transfer',
  },
  items: [
    { name: '80mm thermal printer', unit: 'pcs', qty: 2, price: 249 },
    { name: 'Thermal paper roll 80mm (box of 50)', unit: 'box', qty: 3, price: 85 },
    { name: 'On-site installation and setup', unit: 'service', qty: 1, price: 150 },
  ],
  subtotal: 903,
  discount: 0,
  taxRate: 8.5,
  taxAmount: 76.76,
  total: 979.76,
};

const POS_RECEIPT_DATA = {
  invoice: {
    number: 'POS-2026-004512',
    date: '2026-01-15T12:05:00.000Z',
    cashier: 'Sarah L.',
    lookupUrl: 'https://invoices.example.com/verify/POS-2026-004512',
  },
  seller: {
    name: 'ABC BISTRO',
    taxCode: 'US-27-1234567',
    address: '45 Union Square, San Francisco, CA 94108',
    phone: '+1 415 555 0177',
  },
  buyer: { name: '', taxCode: '' },
  items: [
    { name: 'Grilled chicken rice', unit: 'plate', qty: 2, price: 12.5 },
    { name: 'Tom yum soup', unit: 'bowl', qty: 1, price: 9.0 },
    { name: 'Iced tea', unit: 'glass', qty: 3, price: 2.5 },
  ],
  subtotal: 41.5,
  discount: 0,
  taxRate: 8.5,
  taxAmount: 3.53,
  total: 45.03,
  paid: 50,
  change: 4.97,
  paymentMethod: 'card',
};

const CASH_RECEIPT_DATA = {
  unitName: 'ABC TRADING LTD',
  unitAddress: '128 Market Street, Suite 400, San Francisco, CA 94103',
  formNumber: 'CR-01',
  issuedUnder: 'Accounting policy ref. FIN-2026',
  date: '2026-01-15T00:00:00.000Z',
  bookNumber: '01',
  receiptNumber: '000125',
  account: 'Cash on hand 1111 / Trade receivables 1311',
  currencyCode: 'USD',
  payer: {
    name: 'John Carter',
    address: 'Northwind Supplies Inc., 900 Harbor Blvd, Seattle, WA 98101',
  },
  reason: 'Payment of invoice INV-2026-00125',
  amount: 979.76,
  method: 'Cash',
  attachments: '01 original document',
  note: 'Cashier must count the cash in the presence of the payer before signing.',
};

export const SEEDS_EN = [
  {
    id: 'invoice-a4-en',
    name: 'Sales invoice (A4)',
    description: 'A4 sales invoice with QR code, amount in words and tax line',
    engine: 'html',
    content: INVOICE_A4,
    page: { format: 'A4', marginTop: '14mm', marginRight: '14mm', marginBottom: '14mm', marginLeft: '14mm' },
    sampleData: SAMPLE_DATA,
  },
  {
    id: 'bill-80mm-en',
    name: 'Thermal receipt (80mm)',
    description: '80mm receipt for a thermal printer, rendered through PDF',
    engine: 'html',
    content: BILL_80MM,
    page: { width: '80mm', height: '297mm', marginTop: '0mm', marginRight: '0mm', marginBottom: '0mm', marginLeft: '0mm' },
    sampleData: SAMPLE_DATA,
  },
  {
    id: 'receipt-escpos-en',
    name: 'ESC/POS receipt (raw text)',
    description: 'Plain text sent straight to a thermal printer in raw mode, no PDF step',
    engine: 'text',
    content: RECEIPT_TEXT,
    page: {},
    printing: { raw: true },
    sampleData: SAMPLE_DATA,
  },
  {
    id: 'tax-invoice-a4-en',
    name: 'Tax invoice (A4)',
    description:
      'A4 tax invoice with supplier and customer VAT numbers, per-line tax rate, net total, tax amount, total due, amount in words, signature blocks and a verification QR code',
    engine: 'html',
    content: TAX_INVOICE_A4,
    page: { format: 'A4', marginTop: '12mm', marginRight: '12mm', marginBottom: '12mm', marginLeft: '12mm' },
    sampleData: TAX_INVOICE_DATA,
  },
  {
    id: 'pos-receipt-80mm-en',
    name: 'POS tax receipt (80mm)',
    description: '80mm point-of-sale tax receipt: VAT number, invoice number, tax rate, amount paid, change and a verification QR code',
    engine: 'html',
    content: POS_RECEIPT_80MM,
    page: { width: '80mm', height: 'auto', marginTop: '0mm', marginRight: '0mm', marginBottom: '0mm', marginLeft: '0mm' },
    sampleData: POS_RECEIPT_DATA,
  },
  {
    id: 'cash-receipt-a5-en',
    name: 'Cash receipt (A5)',
    description: 'A5 cash receipt: book and receipt number, debit/credit accounts, amount in figures and words, five signature blocks',
    engine: 'html',
    content: CASH_RECEIPT_A5,
    page: { format: 'A5', marginTop: '10mm', marginRight: '12mm', marginBottom: '10mm', marginLeft: '12mm' },
    sampleData: CASH_RECEIPT_DATA,
  },
];
