import path from 'node:path';
import { existsSync } from 'node:fs';
import { run, tryRun, powershell } from '../util/exec.js';
import { getConfig } from '../core/config.js';
import { PATHS } from '../core/paths.js';

const STATUS_MAP = {
  0: 'unknown',
  1: 'other',
  2: 'unknown',
  3: 'idle',
  4: 'printing',
  5: 'warmup',
  6: 'stopped',
  7: 'offline',
};

export async function listPrinters() {
  const script =
    'Get-Printer | Select-Object Name,DriverName,PortName,Location,Comment,Shared,ShareName,PrinterStatus | ConvertTo-Json -Compress -Depth 3';
  const result = await tryRun('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  let parsed = [];
  try {
    const json = JSON.parse(result.stdout || '[]');
    parsed = Array.isArray(json) ? json : [json];
  } catch {
    parsed = [];
  }
  const defaultResult = await tryRun('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '(Get-CimInstance -ClassName Win32_Printer -Filter "Default=True").Name',
  ]);
  const systemDefault = defaultResult.stdout.trim() || null;

  return parsed.filter(Boolean).map((printer) => ({
    name: printer.Name,
    description: printer.Comment || printer.Name,
    location: printer.Location || null,
    status: STATUS_MAP[printer.PrinterStatus] ?? 'unknown',
    statusText: String(printer.PrinterStatus ?? ''),
    connection: printer.PortName || null,
    driver: printer.DriverName || null,
    shareName: printer.Shared ? printer.ShareName : null,
    accepting: true,
    isSystemDefault: printer.Name === systemDefault,
  }));
}

export async function getPrinterOptions(name) {
  const script = `Get-PrintConfiguration -PrinterName '${name.replace(/'/g, "''")}' | ConvertTo-Json -Compress`;
  const result = await tryRun('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  try {
    const config = JSON.parse(result.stdout || '{}');
    return Object.entries(config)
      .filter(([key]) => !key.startsWith('Cim') && !key.startsWith('PS'))
      .map(([key, value]) => ({ key, label: key, values: [], current: value === null ? null : String(value) }));
  } catch {
    return [];
  }
}

export function findSumatra() {
  const candidates = [
    getConfig().printing.sumatraPath,
    process.env.SUMATRA_PATH,
    path.join(PATHS.data, 'tools', 'SumatraPDF.exe'),
    path.join(process.env['ProgramFiles'] ?? 'C:/Program Files', 'SumatraPDF', 'SumatraPDF.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'SumatraPDF', 'SumatraPDF.exe'),
    path.join(process.env['LOCALAPPDATA'] ?? '', 'SumatraPDF', 'SumatraPDF.exe'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function buildSumatraSettings({ copies, duplex, paperSize, orientation, fitToPage }) {
  const settings = [];
  if (copies && copies > 1) settings.push(`${copies}x`);
  if (duplex === 'long' || duplex === 'two-sided-long-edge') settings.push('duplexlong');
  else if (duplex === 'short' || duplex === 'two-sided-short-edge') settings.push('duplexshort');
  else if (duplex === 'none' || duplex === 'one-sided') settings.push('simplex');
  if (paperSize) settings.push(`paper=${paperSize}`);
  if (orientation === 'landscape') settings.push('landscape');
  else if (orientation === 'portrait') settings.push('portrait');
  settings.push(fitToPage === false ? 'noscale' : 'fit');
  return settings.join(',');
}

export async function printFile(filePath, options = {}) {
  if (options.raw) return printRaw(filePath, options);
  const sumatra = findSumatra();
  if (sumatra) {
    const args = [
      '-print-to',
      options.printer,
      '-silent',
      '-exit-when-done',
      '-print-settings',
      buildSumatraSettings(options),
      filePath,
    ];
    await run(sumatra, args, { timeout: options.timeout ?? 120000 });
    return { nativeJobId: null, output: `sumatra:${path.basename(sumatra)}` };
  }
  const escapedFile = filePath.replace(/'/g, "''");
  const escapedPrinter = String(options.printer).replace(/'/g, "''");
  const copies = Math.max(1, Number(options.copies) || 1);
  const script = `for ($i = 1; $i -le ${copies}; $i++) { Start-Process -FilePath '${escapedFile}' -Verb PrintTo -ArgumentList '${escapedPrinter}' -PassThru | Out-Null; Start-Sleep -Seconds 2 }`;
  await powershell(script, { timeout: options.timeout ?? 120000 });
  return {
    nativeJobId: null,
    output: 'powershell:PrintTo (khuyến nghị cài SumatraPDF để in ổn định hơn)',
  };
}

export async function printRaw(filePath, options = {}) {
  const share = options.rawShareName || getConfig().printing.rawShareName;
  if (!share) {
    throw new Error(
      'In raw trên Windows cần chia sẻ máy in và cấu hình printing.rawShareName (ví dụ: \\\\localhost\\POS58)',
    );
  }
  const target = share.startsWith('\\\\') ? share : `\\\\localhost\\${share}`;
  await run('cmd.exe', ['/c', 'copy', '/b', filePath, target], { timeout: options.timeout ?? 60000 });
  return { nativeJobId: null, output: `raw copy -> ${target}` };
}

export async function getNativeJobState() {
  return 'unknown';
}

export async function cancelNativeJob() {
  return false;
}

export async function isAvailable() {
  const result = await tryRun('powershell.exe', ['-NoProfile', '-Command', 'echo ok']);
  return !result.failed;
}
