import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { tryRun } from '../util/exec.js';

export function hasCommand(command) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [command], { windowsHide: true }).status === 0;
}

/**
 * Chạy lệnh cài đặt và cho người dùng thấy tiến độ: có `log` thì đẩy từng dòng
 * về web UI, không thì đổ thẳng ra terminal.
 * Node chặn spawn .cmd/.bat khi không qua shell nên Windows phải tự bật shell.
 */
export function runVisible(command, args = [], { timeout = 900000, shell, log } = {}) {
  const useShell = shell ?? (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command));
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: log ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
      shell: useShell,
    });
    const timer = setTimeout(() => child.kill(), timeout);

    if (log) {
      let buffer = '';
      const forward = (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const text = line.trim();
          if (text) log(text);
        }
      };
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', forward);
      child.stderr?.on('data', forward);
    }

    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export function runBash(script, options = {}) {
  return runVisible('bash', ['-lc', script], options);
}

/**
 * Ưu tiên sudo không hỏi mật khẩu. Chỉ hỏi khi đang ở terminal thật: chạy từ web
 * UI mà bật prompt mật khẩu thì người dùng không thấy đâu mà nhập.
 */
export async function sudo(args, options = {}) {
  const quiet = await tryRun('sudo', ['-n', ...args], { timeout: options.timeout ?? 300000 });
  if (!quiet.failed) return true;
  if (!process.stdin.isTTY || options.log) return false;
  return runVisible('sudo', args, { ...options, log: undefined });
}

export function detectPackageManager() {
  if (process.platform === 'darwin') return hasCommand('brew') ? 'brew' : null;
  if (process.platform === 'win32') {
    if (hasCommand('winget')) return 'winget';
    if (hasCommand('choco')) return 'choco';
    return null;
  }
  for (const name of ['apt-get', 'dnf', 'pacman', 'zypper', 'apk']) {
    if (hasCommand(name)) return name;
  }
  return null;
}

const LINUX_INSTALL = {
  'apt-get': (packages) => ['apt-get', ['install', '-y', ...packages]],
  dnf: (packages) => ['dnf', ['install', '-y', ...packages]],
  pacman: (packages) => ['pacman', ['-S', '--noconfirm', ...packages]],
  zypper: (packages) => ['zypper', ['--non-interactive', 'install', ...packages]],
  apk: (packages) => ['apk', ['add', ...packages]],
};

/**
 * Cài gói theo trình quản lý gói của từng hệ điều hành.
 * `names` là map: brew/winget/choco/linux -> tên gói.
 */
export async function installPackage(names, options = {}) {
  const manager = detectPackageManager();
  if (!manager) return { ok: false, manager: null };

  if (manager === 'brew') {
    if (!names.brew) return { ok: false, manager };
    const cask = names.brewCask ? ['install', '--cask', names.brew] : ['install', names.brew];
    return { ok: await runVisible('brew', cask, options), manager };
  }
  if (manager === 'winget') {
    if (!names.winget) return { ok: false, manager };
    return {
      ok: await runVisible(
        'winget',
        [
          'install',
          '-e',
          '--id',
          names.winget,
          '--silent',
          '--accept-package-agreements',
          '--accept-source-agreements',
        ],
        options,
      ),
      manager,
    };
  }
  if (manager === 'choco') {
    if (!names.choco) return { ok: false, manager };
    return { ok: await runVisible('choco', ['install', '-y', names.choco], options), manager };
  }

  if (!names.linux) return { ok: false, manager };
  const [command, args] = LINUX_INSTALL[manager](names.linux);
  if (manager === 'apt-get') await sudo(['apt-get', 'update'], options);
  return { ok: await sudo([command, ...args], options), manager };
}

export function openBrowser(url) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? [process.env.ComSpec || 'cmd.exe', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
