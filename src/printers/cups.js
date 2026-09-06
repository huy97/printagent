import { run, tryRun } from '../util/exec.js';

function parseStatusBlocks(stdout) {
  const printers = [];
  let current = null;
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const header = line.match(/^printer\s+(\S+)\s+(is|now)\s+(.*)$/);
    if (header) {
      if (current) printers.push(current);
      const state = header[3].toLowerCase();
      current = {
        name: header[1],
        description: header[1].replace(/_/g, ' '),
        location: null,
        status: state.includes('idle')
          ? 'idle'
          : state.includes('printing')
            ? 'printing'
            : state.includes('disabled')
              ? 'disabled'
              : 'unknown',
        statusText: header[3].trim(),
        connection: null,
        accepting: !state.includes('disabled'),
      };
      continue;
    }
    if (!current) continue;
    const detail = line.trim();
    if (detail.startsWith('Description:')) current.description = detail.slice(12).trim() || current.description;
    else if (detail.startsWith('Location:')) current.location = detail.slice(9).trim() || null;
    else if (detail.startsWith('Connection:')) current.connection = detail.slice(11).trim() || null;
    else if (detail.startsWith('Interface:')) current.driver = detail.slice(10).trim() || null;
  }
  if (current) printers.push(current);
  return printers;
}

export async function listPrinters() {
  const status = await tryRun('lpstat', ['-l', '-p']);
  const printers = parseStatusBlocks(status.stdout);
  if (printers.length === 0) {
    const simple = await tryRun('lpstat', ['-e']);
    for (const name of simple.stdout.split('\n').map((line) => line.trim()).filter(Boolean)) {
      printers.push({
        name,
        description: name.replace(/_/g, ' '),
        location: null,
        status: 'unknown',
        statusText: '',
        connection: null,
        accepting: true,
      });
    }
  }
  const defaultResult = await tryRun('lpstat', ['-d']);
  const defaultMatch = defaultResult.stdout.match(/:\s*(\S+)/);
  const systemDefault = defaultMatch ? defaultMatch[1] : null;
  return printers.map((printer) => ({ ...printer, isSystemDefault: printer.name === systemDefault }));
}

export async function getPrinterOptions(name) {
  const result = await tryRun('lpoptions', ['-p', name, '-l']);
  const options = [];
  for (const line of result.stdout.split('\n')) {
    const match = line.match(/^([^/:]+)(?:\/([^:]+))?:\s*(.+)$/);
    if (!match) continue;
    const values = match[3].trim().split(/\s+/);
    options.push({
      key: match[1].trim(),
      label: (match[2] || match[1]).trim(),
      values: values.map((value) => value.replace(/^\*/, '')),
      current: values.find((value) => value.startsWith('*'))?.slice(1) ?? null,
    });
  }
  return options;
}

function buildOptions({ copies, duplex, paperSize, orientation, media, extraOptions, raw, fitToPage }) {
  const args = [];
  if (raw) args.push('-o', 'raw');
  if (paperSize && !raw) args.push('-o', `media=${media || paperSize}`);
  if (!raw && duplex && duplex !== 'none') {
    const value =
      duplex === 'long' || duplex === 'two-sided-long-edge'
        ? 'two-sided-long-edge'
        : duplex === 'short' || duplex === 'two-sided-short-edge'
          ? 'two-sided-short-edge'
          : 'one-sided';
    args.push('-o', `sides=${value}`);
  }
  if (!raw && orientation === 'landscape') args.push('-o', 'orientation-requested=4');
  if (!raw && fitToPage) args.push('-o', 'fit-to-page');
  for (const option of extraOptions ?? []) {
    if (typeof option === 'string' && option.trim()) args.push('-o', option.trim());
  }
  if (copies && copies > 1) args.unshift('-n', String(copies));
  return args;
}

export async function printFile(filePath, options = {}) {
  const args = ['-d', options.printer, '-t', (options.title || 'PrintAgent job').slice(0, 120)];
  args.push(...buildOptions(options));
  args.push(filePath);
  const { stdout } = await run('lp', args, { timeout: options.timeout ?? 60000 });
  const match = stdout.match(/request id is (\S+)/i);
  return { nativeJobId: match ? match[1] : null, output: stdout.trim() };
}

export async function getNativeJobState(nativeJobId) {
  if (!nativeJobId) return 'unknown';
  const pending = await tryRun('lpstat', ['-W', 'not-completed', '-o']);
  if (pending.stdout.includes(nativeJobId)) return 'pending';
  const completed = await tryRun('lpstat', ['-W', 'completed', '-o']);
  if (completed.stdout.includes(nativeJobId)) return 'completed';
  return 'unknown';
}

export async function cancelNativeJob(nativeJobId) {
  if (!nativeJobId) return false;
  const result = await tryRun('cancel', [nativeJobId]);
  return !result.failed;
}

export async function isAvailable() {
  const result = await tryRun('lpstat', ['-r']);
  return !result.failed;
}
