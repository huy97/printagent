import { existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import puppeteer from 'puppeteer';
import { getConfig, updateConfig } from '../core/config.js';
import { createHandlebars } from './helpers.js';
import { getTemplate } from './templates.js';
import { createLogger } from '../util/logger.js';
import { badRequest } from '../util/errors.js';

const log = createLogger('render');
const handlebars = createHandlebars();
const compiled = new Map();


const SYSTEM_CHROME_PATHS = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ],
};

const PATH_EXECUTABLES = {
  darwin: ['google-chrome', 'chromium'],
  win32: ['chrome.exe', 'msedge.exe'],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'],
};

function windowsUserPaths() {
  const local = process.env.LOCALAPPDATA;
  if (!local) return [];
  return [
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(local, 'Chromium', 'Application', 'chrome.exe'),
  ];
}

function searchInPath() {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const name of PATH_EXECUTABLES[process.platform] ?? []) {
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// Không có Chromium của Puppeteer thì dò trình duyệt sẵn có trên máy.
export function findSystemChrome() {
  const candidates = [
    ...(SYSTEM_CHROME_PATHS[process.platform] ?? []),
    ...(process.platform === 'win32' ? windowsUserPaths() : []),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? searchInPath();
}

async function launchWithFallback(launchOptions) {
  try {
    return await puppeteer.launch(launchOptions);
  } catch (error) {
    if (launchOptions.executablePath) throw error;
    const systemChrome = findSystemChrome();
    if (!systemChrome) throw error;
    log.warn(`Không dùng được Chromium của Puppeteer, chuyển sang ${systemChrome}`);
    const instance = await puppeteer.launch({ ...launchOptions, executablePath: systemChrome });
    // Ghi lại để lần sau khỏi dò và người dùng thấy đường dẫn trong tab Cài đặt.
    updateConfig({ render: { chromePath: systemChrome } });
    return instance;
  }
}

let browserPromise = null;
let browser = null;
let idleTimer = null;
let activeRenders = 0;

async function getBrowser() {
  if (browser?.connected) {
    scheduleIdleClose();
    return browser;
  }
  if (!browserPromise) {
    const config = getConfig().render;
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    };
    if (config.chromePath) launchOptions.executablePath = config.chromePath;
    browserPromise = launchWithFallback(launchOptions)
      .then((instance) => {
        browser = instance;
        instance.on('disconnected', () => {
          browser = null;
          browserPromise = null;
        });
        log.info('Đã khởi động Chromium để render PDF');
        return instance;
      })
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  const instance = await browserPromise;
  scheduleIdleClose();
  return instance;
}

function scheduleIdleClose() {
  const timeout = getConfig().render.browserIdleTimeoutMs;
  if (idleTimer) clearTimeout(idleTimer);
  if (!timeout || timeout <= 0) return;
  idleTimer = setTimeout(() => {
    if (activeRenders > 0) {
      scheduleIdleClose();
      return;
    }
    closeBrowser().catch(() => {});
  }, timeout);
  idleTimer.unref?.();
}

export async function closeBrowser() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const pending = browserPromise;
  const instance = browser ?? (pending ? await pending.catch(() => null) : null);
  browser = null;
  browserPromise = null;
  if (instance) {
    log.info('Đóng Chromium do nhàn rỗi');
    await instance.close().catch(() => {});
  }
}

export function compileTemplate(source, cacheKey, noEscape = false) {
  const key = cacheKey ? `${cacheKey}:${noEscape ? 'raw' : 'html'}` : null;
  if (key && compiled.has(key)) {
    const entry = compiled.get(key);
    if (entry.source === source) return entry.fn;
  }
  const fn = handlebars.compile(source, { noEscape });
  if (key) compiled.set(key, { source, fn });
  return fn;
}

export function renderTemplateString(source, data, cacheKey, noEscape = false) {
  try {
    return compileTemplate(source, cacheKey, noEscape)(data ?? {});
  } catch (error) {
    throw badRequest('error.template_compile', { message: error.message });
  }
}

/** Chiều cao để trống hoặc ghi "auto" đều là đo theo nội dung. */
export function isAutoHeight(height) {
  return !height || String(height).trim().toLowerCase() === 'auto';
}

function buildPdfOptions(page = {}) {
  const config = getConfig().render;
  const options = {
    printBackground: page.printBackground ?? config.printBackground,
    scale: Number(page.scale ?? config.scale) || 1,
    landscape: Boolean(page.landscape),
    margin: {
      top: page.marginTop ?? config.marginTop,
      right: page.marginRight ?? config.marginRight,
      bottom: page.marginBottom ?? config.marginBottom,
      left: page.marginLeft ?? config.marginLeft,
    },
    preferCSSPageSize: Boolean(page.preferCSSPageSize),
  };
  if (page.width) {
    options.width = page.width;
    // Bỏ trống chiều cao nghĩa là theo nội dung; htmlToPdf đo trước và thay bằng số đo thật,
    // còn 297mm chỉ là lối thoát khi đo hụt.
    options.height = isAutoHeight(page.height) ? '297mm' : page.height;
  } else if (page.height && !isAutoHeight(page.height)) {
    options.height = page.height;
    options.width = page.width ?? '210mm';
  } else {
    options.format = page.format ?? config.format ?? 'A4';
  }
  if (page.headerTemplate || page.footerTemplate) {
    options.displayHeaderFooter = true;
    options.headerTemplate = page.headerTemplate ?? '<span></span>';
    options.footerTemplate = page.footerTemplate ?? '<span></span>';
  }
  return options;
}


const MEDIA_BOX = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/;
const STANDARD_PAPER_PT = [
  [842, 1191],
  [595, 842],
  [420, 595],
  [612, 792],
  [612, 1008],
];

function objectStreamChunks(buffer, text) {
  const chunks = [];
  const pattern = /\d+\s+\d+\s+obj\s*(<<[\s\S]*?>>)\s*stream\r?\n/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const dict = match[1];
    if (!/\/Type\s*\/ObjStm/.test(dict) || !/\/FlateDecode/.test(dict)) continue;
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    const first = Number(/\/First\s+(\d+)/.exec(dict)?.[1]);
    if (end < 0 || !Number.isFinite(first)) continue;
    let content;
    try {
      content = zlib.inflateSync(buffer.subarray(start, end), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('latin1');
    } catch {
      continue;
    }
    const offsets = content.slice(0, first).trim().split(/\s+/).filter((_, index) => index % 2 === 1).map(Number);
    offsets.forEach((offset, index) => {
      chunks.push(content.slice(first + offset, index + 1 < offsets.length ? first + offsets[index + 1] : undefined));
    });
  }
  return chunks;
}

function pdfChunks(buffer) {
  const text = buffer.toString('latin1');
  return [...text.split('endobj'), ...(text.includes('/ObjStm') ? objectStreamChunks(buffer, text) : [])];
}

/** Số trang của PDF, lấy từ /Count lớn nhất của cây /Pages; 1 nếu không đọc được. */
export function readPdfPageCount(buffer) {
  let count = 0;
  for (const chunk of pdfChunks(buffer)) {
    if (!/\/Type\s*\/Pages\b/.test(chunk)) continue;
    const value = Number(/\/Count\s+(\d+)/.exec(chunk)?.[1]);
    if (Number.isFinite(value)) count = Math.max(count, value);
  }
  return count || 1;
}

/** Khổ trang đầu tiên của PDF theo point (đã tính /Rotate), hoặc null nếu không đọc được. */
export function readPdfPageSize(buffer) {
  const chunks = pdfChunks(buffer);
  let inherited = null;
  let page = null;
  for (const chunk of chunks) {
    if (/\/Type\s*\/Pages\b/.test(chunk)) {
      inherited ??= MEDIA_BOX.exec(chunk);
    } else if (!page && /\/Type\s*\/Page\b/.test(chunk)) {
      page = chunk;
    }
  }
  const box = (page && MEDIA_BOX.exec(page)) ?? inherited;
  if (!box) return null;
  const [x0, y0, x1, y1] = box.slice(1).map(Number);
  const width = Math.abs(x1 - x0);
  const height = Math.abs(y1 - y0);
  if (!width || !height) return null;
  const rotate = Math.abs(Number(/\/Rotate\s+(-?\d+)/.exec(page ?? '')?.[1] ?? 0)) % 180;
  return rotate === 90 ? { width: height, height: width } : { width, height };
}

export function isStandardPaperSize({ width, height }) {
  const [short, long] = width < height ? [width, height] : [height, width];
  return STANDARD_PAPER_PT.some(([w, h]) => Math.abs(short - w) <= 3 && Math.abs(long - h) <= 3);
}

const CSS_UNITS = { px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };

function cssLengthToPx(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = /^\s*([\d.]+)\s*(px|pt|pc|in|cm|mm)?\s*$/i.exec(String(value ?? ''));
  if (!match) return null;
  const unit = (match[2] ?? 'px').toLowerCase();
  return Number(match[1]) * (CSS_UNITS[unit] ?? 1);
}

// Khổ giấy cuộn (máy in nhiệt) không có chiều cao cố định: đo nội dung rồi cắt đúng chỗ.
async function measureAutoHeight(tab, page) {
  const config = getConfig().render;
  // Lề phải lấy đúng thứ buildPdfOptions sẽ dùng, kể cả khi template bỏ trống và rơi về config,
  // nếu không thì đo hụt và trang bị cắt làm đôi.
  const margin = (side) => cssLengthToPx(page[side] ?? config[side]) ?? 0;
  const width = cssLengthToPx(page.width);
  if (!width) return null;
  const inner = Math.max(Math.floor(width - margin('marginLeft') - margin('marginRight')), 1);
  await tab.setViewport({ width: inner, height: 600 });
  // Đo theo nội dung chứ không theo body hay documentElement: cả hai đều không nhỏ hơn khung nhìn
  // nên bill ngắn cũng bị kéo thành 600px.
  const content = await tab.evaluate(() => {
    const body = document.body;
    const range = document.createRange();
    range.selectNodeContents(body);
    let bottom = range.getBoundingClientRect().bottom;
    for (const node of body.querySelectorAll('*')) {
      bottom = Math.max(bottom, node.getBoundingClientRect().bottom);
    }
    // Nội dung không bao gồm padding và margin dưới của body, nhưng giấy thì có.
    const tail = (element) => {
      const style = getComputedStyle(element);
      return (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.marginBottom) || 0);
    };
    return Math.max(bottom + tail(body) + tail(document.documentElement) + window.scrollY, 0);
  });
  const vertical = margin('marginTop') + margin('marginBottom');
  const padding = cssLengthToPx(page.autoHeightPadding ?? '2mm') ?? 0;
  return `${Math.max(Math.ceil(content + vertical + padding), 1)}px`;
}

// HTML người dùng dán vào không tự biết khổ giấy: chèn sẵn khung để lề mặc định 8px của
// trình duyệt và padding không đẩy nội dung tràn ra ngoài tem. Style đứng trước mọi style của
// template nên template tự đặt lại được; đặt page.frame = false để bỏ hẳn.
const FRAME_ANCHORS = [/<head[^>]*>/i, /<body[^>]*>/i, /<html[^>]*>/i, /<!doctype[^>]*>/i];

function pageFrameStyle(page) {
  const rules = ['html,body{margin:0;padding:0}', '*,*::before,*::after{box-sizing:border-box}'];
  if (page.width && !isAutoHeight(page.height)) {
    rules.unshift(`@page{size:${page.width} ${page.height}}`);
  }
  return `<style data-printagent-frame>${rules.join('')}</style>`;
}

export function withPageFrame(html, page = {}) {
  const custom = page.width || (page.height && !isAutoHeight(page.height));
  if (!custom || page.frame === false) return html;
  const style = pageFrameStyle(page);
  // Thiếu doctype là trình duyệt vào quirks mode, ở đó body bị kéo cao bằng khung nhìn và
  // phép đo chiều cao tự động hụt hẳn so với nội dung thật.
  const doctype = /^\s*<!doctype/i.test(html) ? '' : '<!doctype html>';
  for (const anchor of FRAME_ANCHORS) {
    const match = anchor.exec(html);
    if (match) {
      const at = match.index + match[0].length;
      return `${doctype}${html.slice(0, at)}${style}${html.slice(at)}`;
    }
  }
  return `${doctype}${style}${html}`;
}

async function waitForAssets(tab, timeoutMs) {
  const wait = tab
    .evaluate(async () => {
      const images = Array.from(document.images).filter((image) => !image.complete);
      await Promise.all(
        images.map(
          (image) =>
            new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            }),
        ),
      );
      if (document.fonts?.ready) await document.fonts.ready;
    })
    .catch(() => {});
  await Promise.race([wait, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

export async function htmlToPdf(html, page = {}) {
  const instance = await getBrowser();
  activeRenders += 1;
  let tab;
  try {
    tab = await instance.newPage();
    await tab.emulateMediaType('print');
    await tab.setContent(withPageFrame(html, page), { waitUntil: 'load', timeout: page.timeout ?? 30000 });
    if (page.waitForSelector) {
      await tab.waitForSelector(page.waitForSelector, { timeout: 10000 }).catch(() => {});
    }
    await waitForAssets(tab, page.assetTimeout ?? 10000);
    let effective = page;
    if (page.width && isAutoHeight(page.height)) {
      const height = await measureAutoHeight(tab, page);
      if (height) effective = { ...page, height };
    }
    const buffer = await tab.pdf(buildPdfOptions(effective));
    return Buffer.from(buffer);
  } finally {
    activeRenders -= 1;
    await tab?.close().catch(() => {});
    scheduleIdleClose();
  }
}

export async function renderTemplate({ templateId, template, engine, data, page }) {
  let source = template;
  let meta = null;
  let effectiveEngine = engine ?? 'html';
  let effectivePage = page ?? {};

  if (templateId) {
    meta = getTemplate(templateId);
    source = meta.content;
    effectiveEngine = engine ?? meta.engine;
    effectivePage = { ...meta.page, ...(page ?? {}) };
  }
  if (!source) throw badRequest('error.template_required');

  const output = renderTemplateString(
    source,
    data,
    templateId ? `tpl:${templateId}` : null,
    effectiveEngine === 'text',
  );

  if (effectiveEngine === 'text') {
    return {
      engine: 'text',
      meta,
      text: output,
      buffer: Buffer.from(output, 'utf8'),
      contentType: 'text/plain; charset=utf-8',
      extension: 'txt',
    };
  }

  const buffer = await htmlToPdf(output, effectivePage);
  return {
    engine: 'html',
    meta,
    html: output,
    buffer,
    contentType: 'application/pdf',
    extension: 'pdf',
  };
}

export async function renderHealth() {
  try {
    const instance = await getBrowser();
    return { ok: true, version: await instance.version(), executablePath: instance.process()?.spawnfile ?? null };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
