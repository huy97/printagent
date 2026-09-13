import { readFileSync, writeFileSync, existsSync, statSync, copyFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { lookup } from 'node:dns/promises';
import { PATHS, ensureDataDirs } from './paths.js';
import { getConfig } from './config.js';
import * as jobs from './jobs.js';
import * as printers from '../printers/index.js';
import { renderTemplate, readPdfPageSize, isStandardPaperSize } from '../render/pdf.js';
import { getTemplate } from '../render/templates.js';
import { badRequest } from '../util/errors.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('print');
const dnsLookup = lookup;

const PDF_MAGIC = Buffer.from('%PDF-');

function isPdf(buffer) {
  return buffer.length > 5 && buffer.subarray(0, 5).equals(PDF_MAGIC);
}

function isPrivateAddress(address, family) {
  const value = String(address).toLowerCase();
  if (family === 6) {
    if (value === '::1' || value === '::') return true;
    if (value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return true;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1], 4);
    return false;
  }
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function assertUrlAllowed(target) {
  const config = getConfig().printing;
  if (config.allowRemoteUrl === false) throw badRequest('error.url_printing_disabled');
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    throw badRequest('error.url_invalid', { url: target });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw badRequest('error.url_scheme');
  }
  if (config.allowPrivateNetworkUrl) return parsed;

  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try {
    addresses = await dnsLookup(host, { all: true, verbatim: true });
  } catch {
    throw badRequest('error.url_dns_failed', { host });
  }
  const blocked = addresses.find((entry) => isPrivateAddress(entry.address, entry.family));
  if (blocked) {
    throw badRequest('error.url_private_network', { host, address: blocked.address });
  }
  return parsed;
}

/** Tự đi theo redirect để kiểm tra từng chặng, tránh bị vòng về mạng nội bộ. */
async function fetchChecked(url, maxBytes) {
  let current = await assertUrlAllowed(url);
  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw badRequest('error.redirect_no_location', { url: current });
      current = await assertUrlAllowed(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw badRequest('error.download_failed', { status: response.status, url: current });
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw badRequest('error.file_too_large', { limit: maxBytes / 1024 / 1024 });
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body ?? []) {
      size += chunk.length;
      if (size > maxBytes) throw badRequest('error.file_too_large', { limit: maxBytes / 1024 / 1024 });
      chunks.push(Buffer.from(chunk));
    }
    return { buffer: Buffer.concat(chunks), url: current };
  }
  throw badRequest('error.too_many_redirects');
}

function assertFilePathAllowed(filePath) {
  const config = getConfig().printing;
  if (!config.allowLocalFilePath) {
    throw badRequest('error.file_path_disabled');
  }
  const resolved = existsSync(filePath) ? realpathSync(filePath) : path.resolve(filePath);
  const roots = (config.allowedFileRoots ?? []).map((root) => path.resolve(root));
  if (roots.length > 0 && !roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw badRequest('error.file_path_outside_roots');
  }
  if (!existsSync(resolved)) throw badRequest('error.file_not_found', { path: filePath });
  if (!statSync(resolved).isFile()) throw badRequest('error.not_a_file', { path: filePath });
  return resolved;
}

async function loadSource({ content, contentBase64, url, filePath, fileName }) {
  const base64 = contentBase64 ?? (typeof content === 'string' ? content : null);
  if (Buffer.isBuffer(content)) {
    return { buffer: content, fileName: fileName ?? 'document.pdf', kind: 'buffer' };
  }
  if (base64) {
    const cleaned = base64.replace(/^data:application\/pdf;base64,/, '').replace(/\s/g, '');
    const buffer = Buffer.from(cleaned, 'base64');
    if (buffer.length === 0) throw badRequest('error.base64_empty');
    return { buffer, fileName: fileName ?? 'document.pdf', kind: 'base64' };
  }
  if (url) {
    const maxBytes = (getConfig().printing.maxDownloadMb ?? 64) * 1024 * 1024;
    const downloaded = await fetchChecked(url, maxBytes);
    const name = fileName ?? (path.basename(downloaded.url.pathname) || 'document.pdf');
    return { buffer: downloaded.buffer, fileName: name, kind: 'url' };
  }
  if (filePath) {
    const resolved = assertFilePathAllowed(filePath);
    return { path: resolved, fileName: fileName ?? path.basename(resolved), kind: 'path' };
  }
  throw badRequest('error.source_required');
}

function storeFile(jobId, buffer, extension = 'pdf') {
  ensureDataDirs();
  const target = path.join(PATHS.files, `${jobId}.${extension}`);
  writeFileSync(target, buffer);
  return target;
}

function mergeOptions(input = {}) {
  const config = getConfig().printing;
  return {
    duplex: input.duplex ?? config.duplex,
    paperSize: input.paperSize ?? config.paperSize,
    orientation: input.orientation ?? config.orientation,
    media: input.media ?? null,
    fitToPage: input.fitToPage ?? true,
    extraOptions: input.extraOptions ?? config.extraOptions ?? [],
    raw: Boolean(input.raw),
    rawShareName: config.rawShareName ?? null,
  };
}

function hasExplicitPaper(input) {
  return Boolean(input?.paperSize || input?.media);
}

// PDF khổ riêng (bill 80mm, tem) mà vẫn gắn khổ mặc định A4 thì driver thu cả trang vào giấy, chữ bé tí.
function fitPaperToPdf(options, buffer) {
  if (options.raw) return;
  const size = readPdfPageSize(buffer);
  if (!size || isStandardPaperSize(size)) return;
  options.paperSize = null;
  options.media = null;
  log.info(`PDF khổ riêng ${Math.round((size.width * 25.4) / 72)}x${Math.round((size.height * 25.4) / 72)}mm, dùng khổ giấy của máy in`);
}

export async function submitPdfJob(input = {}) {
  const printer = await printers.resolvePrinterName(input.printer);
  const source = await loadSource(input);
  const options = mergeOptions(input.options ?? input);
  const explicitPaper = hasExplicitPaper(input.options ?? input);

  if (source.buffer && !options.raw && !isPdf(source.buffer) && !input.allowNonPdf) {
    throw badRequest('error.not_pdf');
  }

  const job = jobs.createJob({
    type: 'pdf',
    printer,
    copies: Number(input.copies) || getConfig().printing.copies || 1,
    title: input.title ?? source.fileName ?? 'PrintAgent PDF',
    fileName: source.fileName,
    bytes: source.buffer?.length ?? (source.path ? statSync(source.path).size : null),
    options,
    source: { kind: source.kind, url: input.url ?? null, path: input.filePath ?? null },
    origin: input.origin ?? 'api',
    clientId: input.clientId ?? null,
  });

  jobs.enqueue(job, async (currentJob) => {
    if (source.buffer) {
      if (!explicitPaper) fitPaperToPdf(currentJob.options, source.buffer);
      const stored = storeFile(job.id, source.buffer, options.raw ? 'bin' : 'pdf');
      return { filePath: stored, bytes: source.buffer.length };
    }
    const stored = path.join(PATHS.files, `${job.id}${path.extname(source.path) || '.pdf'}`);
    copyFileSync(source.path, stored);
    if (!explicitPaper) fitPaperToPdf(currentJob.options, readFileSync(stored));
    return { filePath: stored, bytes: statSync(stored).size };
  });

  log.info(`Đã nhận job PDF ${job.id} -> ${printer}`);
  return input.wait ? jobs.waitForJob(job.id, input.waitTimeoutMs ?? 60000) : job;
}

export async function submitTemplateJob(input = {}) {
  if (!input.templateId && !input.template) {
    throw badRequest('error.template_required');
  }
  const meta = input.templateId ? getTemplate(input.templateId, { withContent: false }) : null;
  const printer = await printers.resolvePrinterName(input.printer ?? meta?.printing?.printer ?? null);
  const options = mergeOptions({
    ...(input.options ?? {}),
    raw: input.options?.raw ?? input.raw ?? meta?.printing?.raw ?? false,
  });
  const explicitPaper = hasExplicitPaper(input.options);

  const job = jobs.createJob({
    type: 'template',
    printer,
    copies: Number(input.copies) || meta?.printing?.copies || getConfig().printing.copies || 1,
    title: input.title ?? meta?.name ?? 'PrintAgent template',
    templateId: input.templateId ?? null,
    data: input.data ?? null,
    templateSource: input.templateId ? null : (input.template ?? null),
    engine: input.engine ?? null,
    page: input.page ?? null,
    fileName: `${input.templateId ?? 'inline'}.pdf`,
    options,
    source: { kind: 'template', templateId: input.templateId ?? null },
    origin: input.origin ?? 'api',
    clientId: input.clientId ?? null,
  });

  jobs.enqueue(job, async (currentJob) => {
    const rendered = await renderTemplate({
      templateId: input.templateId,
      template: input.template,
      engine: input.engine,
      data: input.data ?? {},
      page: input.page,
    });
    if (rendered.engine === 'text') {
      currentJob.options.raw = true;
      const payload = buildRawPayload(rendered.text, input.escpos ?? {});
      const stored = storeFile(currentJob.id, payload, 'bin');
      return { filePath: stored, bytes: payload.length, fileName: `${currentJob.id}.bin` };
    }
    if (!explicitPaper) fitPaperToPdf(currentJob.options, rendered.buffer);
    const stored = storeFile(currentJob.id, rendered.buffer, 'pdf');
    return { filePath: stored, bytes: rendered.buffer.length, fileName: `${currentJob.id}.pdf` };
  });

  log.info(`Đã nhận job template ${job.id} (${input.templateId ?? 'inline'}) -> ${printer}`);
  return input.wait ? jobs.waitForJob(job.id, input.waitTimeoutMs ?? 60000) : job;
}

function buildRawPayload(text, escpos = {}) {
  const chunks = [];
  if (escpos.init !== false) chunks.push(Buffer.from([0x1b, 0x40]));
  if (escpos.codepage) chunks.push(Buffer.from([0x1b, 0x74, Number(escpos.codepage)]));
  chunks.push(Buffer.from(text, escpos.encoding ?? 'utf8'));
  if (escpos.feed !== false) chunks.push(Buffer.from('\n\n\n'));
  if (escpos.cut !== false) chunks.push(Buffer.from([0x1d, 0x56, 0x42, 0x00]));
  if (escpos.openDrawer) chunks.push(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]));
  return Buffer.concat(chunks);
}

export async function previewTemplate(input = {}) {
  const rendered = await renderTemplate({
    templateId: input.templateId,
    template: input.template,
    engine: input.engine,
    data: input.data ?? {},
    page: input.page,
  });
  return rendered;
}

export async function printTestPage(printerName) {
  const printer = await printers.resolvePrinterName(printerName);
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:32px}
h1{font-size:22px;margin:0 0 8px}table{border-collapse:collapse;margin-top:16px;font-size:13px}
td,th{border:1px solid #999;padding:6px 10px;text-align:left}</style></head>
<body><h1>PrintAgent - Trang in thử</h1>
<p>Máy in: <strong>${escapeHtml(printer)}</strong></p>
<table><tr><th>Thời điểm</th><td>${new Date().toLocaleString('vi-VN')}</td></tr>
<tr><th>Agent</th><td>${escapeHtml(getConfig().agent.name)} (${getConfig().agent.id})</td></tr>
<tr><th>Nền tảng</th><td>${process.platform} / node ${process.version}</td></tr></table>
<p style="margin-top:24px">Nếu bạn đọc được trang này, cấu hình in đang hoạt động bình thường.</p>
</body></html>`;
  return submitTemplateJob({
    template: html,
    engine: 'html',
    printer,
    title: 'PrintAgent test page',
    origin: 'test',
    wait: true,
    waitTimeoutMs: 45000,
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}
