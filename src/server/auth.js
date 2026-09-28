import { timingSafeEqual } from 'node:crypto';
import { getConfig, saveConfig } from '../core/config.js';
import { unauthorized, AppError } from '../util/errors.js';
import { blockedFor, recordAuthFailure, recordAuthSuccess } from './guard.js';

const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

const PROXY_HEADERS = [
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'cf-ray',
  'ngrok-agent-ips',
  'x-original-forwarded-for',
];

const LAST_USED_THROTTLE_MS = 60000;

/**
 * Requests through cloudflared/ngrok also arrive from 127.0.0.1, and requests started by
 * an arbitrary web page carry a foreign Origin header. Neither may use the
 * "no API key for localhost" exemption.
 *
 * The three checks below are independent and deliberately do not rely only on missing proxy
 * headers: an attacker coming through the tunnel must defeat all three to reach the exemption.
 */
export function isLocalRequest(req) {
  const address = req.socket?.remoteAddress ?? req.ip ?? '';
  if (!LOCAL_ADDRESSES.has(address)) return false;
  if (!isLoopbackHost(req)) return false;
  if (PROXY_HEADERS.some((header) => req.headers?.[header])) return false;
  if (!isSameSiteFetch(req)) return false;
  return isSameOrigin(req);
}

/**
 * Browsers set Sec-Fetch-Site and pages cannot forge it, even for <img>/<script>
 * requests that send no Origin. Only direct navigation (none) or requests from the
 * agent's own page (same-origin) are accepted.
 */
export function isSameSiteFetch(req) {
  const site = req.headers?.['sec-fetch-site'];
  if (!site) return true;
  return site === 'same-origin' || site === 'none';
}

/** Through a tunnel Host is the public domain; only a browser on this machine sends a loopback Host. */
export function isLoopbackHost(req) {
  const host = req.headers?.host;
  if (!host) return true;
  const hostname = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0];
  return LOCAL_ADDRESSES.has(hostname);
}

export function isSameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    if (!LOCAL_ADDRESSES.has(originUrl.hostname)) return false;
    const host = req.headers?.host;
    return !host || originUrl.host === host;
  } catch {
    return false;
  }
}

/**
 * Pages served by the agent itself (even through a tunnel) have an Origin matching Host.
 * Used for WebSocket; it does not widen the key exemption of isLocalRequest.
 */
export function isSelfServedOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers?.host;
  } catch {
    return false;
  }
}

export function extractKey(req) {
  const header = req.headers?.['x-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const queryKey = req.query?.apiKey ?? req.query?.api_key;
  if (typeof queryKey === 'string' && queryKey.trim()) return queryKey.trim();
  return null;
}

function keysMatch(candidate, stored) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyKey(key) {
  if (!key) return null;
  const config = getConfig();
  const entry = config.auth.apiKeys.find((item) => keysMatch(key, item.key));
  if (!entry) return null;
  const last = entry.lastUsedAt ? Date.parse(entry.lastUsedAt) : 0;
  if (Date.now() - last > LAST_USED_THROTTLE_MS) {
    entry.lastUsedAt = new Date().toISOString();
    saveConfig(config, { silent: true });
  }
  return entry;
}

export function authorize(req) {
  const config = getConfig();
  const local = isLocalRequest(req);
  if (!config.auth.enabled) return { ok: true, key: null, local, reason: 'auth_disabled' };
  const key = extractKey(req);
  const entry = verifyKey(key);
  if (entry) return { ok: true, key: entry, local, reason: 'api_key' };
  if (config.auth.allowLocalhostWithoutKey && local) {
    return { ok: true, key: null, local, reason: 'localhost' };
  }
  return { ok: false, local };
}

export function requireAuth(req, res, next) {
  const blocked = blockedFor(req);
  if (blocked > 0) {
    res.setHeader('retry-after', String(Math.ceil(blocked / 1000)));
    next(new AppError('error.too_many_attempts', {
      status: 429,
      code: 'too_many_attempts',
      params: { seconds: Math.ceil(blocked / 1000) },
    }));
    return;
  }
  const result = authorize(req);
  if (!result.ok) {
    recordAuthFailure(req);
    next(unauthorized());
    return;
  }
  if (!result.local) recordAuthSuccess(req);
  req.auth = result;
  next();
}
