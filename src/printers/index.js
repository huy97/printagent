import os from 'node:os';
import { EventEmitter } from 'node:events';
import * as cups from './cups.js';
import * as windows from './windows.js';
import { getConfig } from '../core/config.js';
import { createLogger } from '../util/logger.js';
import { badRequest } from '../util/errors.js';

const log = createLogger('printers');
export const printerEvents = new EventEmitter();

const platform = os.platform();
export const driver = platform === 'win32' ? windows : cups;
export const driverName = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'cups-macos' : 'cups';

let cachedPrinters = [];
let lastScanAt = null;
let scanning = null;

export function getCachedPrinters() {
  return { printers: cachedPrinters, lastScanAt, driver: driverName, platform };
}

let lastScanFailed = false;

export async function scanPrinters({ force = false } = {}) {
  const maxAge = (getConfig().discovery.autoRefreshSeconds || 60) * 1000;
  if (!force && lastScanAt && Date.now() - lastScanAt < maxAge) {
    return getCachedPrinters();
  }
  if (scanning) return scanning;
  scanning = (async () => {
    try {
      const printers = await driver.listPrinters();
      lastScanFailed = false;
      const defaultPrinter = getConfig().printing.defaultPrinter;
      const previous = new Map(cachedPrinters.map((item) => [item.name, item.status]));
      cachedPrinters = printers.map((printer) => ({
        ...printer,
        isAgentDefault: printer.name === defaultPrinter,
      }));
      lastScanAt = Date.now();
      const changed =
        printers.length !== previous.size ||
        printers.some((printer) => previous.get(printer.name) !== printer.status);
      if (changed) printerEvents.emit('changed', getCachedPrinters());
      log.debug(`Quét thấy ${printers.length} máy in`);
      return getCachedPrinters();
    } catch (error) {
      lastScanFailed = true;
      log.error(`Quét máy in thất bại: ${error.message}`);
      return getCachedPrinters();
    } finally {
      scanning = null;
    }
  })();
  return scanning;
}

export async function findPrinter(name) {
  const { printers } = await scanPrinters();
  return printers.find((printer) => printer.name === name) ?? null;
}

export async function resolvePrinterName(requested) {
  const config = getConfig();
  const name = requested || config.printing.defaultPrinter;
  const { printers } = await scanPrinters();
  if (!name) {
    const systemDefault = printers.find((printer) => printer.isSystemDefault);
    if (systemDefault) return systemDefault.name;
    if (printers.length === 1) return printers[0].name;
    throw badRequest('error.printer_default_missing');
  }
  if (printers.length === 0) {
    throw badRequest(lastScanFailed ? 'error.printer_scan_failed' : 'error.printer_none_installed');
  }
  if (printers.length > 0 && !printers.some((printer) => printer.name === name)) {
    const insensitive = printers.find(
      (printer) => printer.name.toLowerCase() === String(name).toLowerCase(),
    );
    if (insensitive) return insensitive.name;
    throw badRequest('error.printer_not_found', { name });
  }
  return name;
}

export function getPrinterOptions(name) {
  return driver.getPrinterOptions(name);
}

export function printFile(filePath, options) {
  return driver.printFile(filePath, options);
}

export function getNativeJobState(nativeJobId) {
  return driver.getNativeJobState(nativeJobId);
}

export function cancelNativeJob(nativeJobId) {
  return driver.cancelNativeJob(nativeJobId);
}

export function isPrintingAvailable() {
  return driver.isAvailable();
}

let timer = null;
export function startAutoScan() {
  stopAutoScan();
  const seconds = getConfig().discovery.autoRefreshSeconds;
  if (!seconds || seconds <= 0) return;
  timer = setInterval(() => {
    scanPrinters({ force: true }).catch(() => {});
  }, seconds * 1000);
  timer.unref?.();
}

export function stopAutoScan() {
  if (timer) clearInterval(timer);
  timer = null;
}
