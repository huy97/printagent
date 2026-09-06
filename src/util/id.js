import { randomBytes, randomUUID } from 'node:crypto';

export function uuid() {
  return randomUUID();
}

export function shortId(prefix = '') {
  const raw = randomBytes(6).toString('hex');
  return prefix ? `${prefix}_${raw}` : raw;
}

export function apiKeyValue() {
  return `pa_${randomBytes(24).toString('base64url')}`;
}

export function slugify(input) {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
