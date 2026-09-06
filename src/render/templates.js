import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { PATHS, ensureDataDirs } from '../core/paths.js';
import { slugify, shortId } from '../util/id.js';
import { notFound, badRequest } from '../util/errors.js';

const DEFAULT_PAGE = {
  format: 'A4',
  landscape: false,
  marginTop: '10mm',
  marginRight: '10mm',
  marginBottom: '10mm',
  marginLeft: '10mm',
  width: null,
  height: null,
  printBackground: true,
  scale: 1,
};

function safeId(id) {
  const value = String(id ?? '');
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)) {
    throw badRequest('error.template_id_invalid', { id: value });
  }
  return value;
}

function templateDir(id) {
  const dir = path.join(PATHS.templates, safeId(id));
  const root = path.resolve(PATHS.templates);
  if (!path.resolve(dir).startsWith(`${root}${path.sep}`)) {
    throw badRequest('error.template_path_invalid');
  }
  return dir;
}

function readMeta(id) {
  let metaPath;
  try {
    metaPath = path.join(templateDir(id), 'meta.json');
  } catch {
    return null;
  }
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

export function listTemplates() {
  ensureDataDirs();
  return readdirSync(PATHS.templates, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readMeta(entry.name))
    .filter(Boolean)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function getTemplate(id, { withContent = true } = {}) {
  const meta = readMeta(id);
  if (!meta) throw notFound('error.template_not_found', { id });
  if (!withContent) return meta;
  const file = path.join(templateDir(id), meta.engine === 'text' ? 'template.txt' : 'template.hbs');
  return { ...meta, content: existsSync(file) ? readFileSync(file, 'utf8') : '' };
}

export function templateExists(id) {
  return Boolean(readMeta(id));
}

export function createTemplate(input) {
  ensureDataDirs();
  if (!input?.name) throw badRequest('error.template_name_required');
  if (typeof input.content !== 'string' || input.content.trim() === '') {
    throw badRequest('error.template_content_required');
  }
  const base = input.id ? slugify(input.id) : slugify(input.name) || shortId('tpl');
  let id = base;
  let counter = 2;
  while (existsSync(templateDir(id))) {
    id = `${base}-${counter}`;
    counter += 1;
  }
  const now = new Date().toISOString();
  const meta = {
    id,
    name: input.name,
    description: input.description ?? '',
    engine: input.engine === 'text' ? 'text' : 'html',
    page: { ...DEFAULT_PAGE, ...(input.page ?? {}) },
    printing: {
      printer: input.printing?.printer ?? null,
      copies: Number(input.printing?.copies) || 1,
      raw: Boolean(input.printing?.raw),
    },
    sampleData: input.sampleData ?? {},
    createdAt: now,
    updatedAt: now,
  };
  mkdirSync(templateDir(id), { recursive: true });
  writeContent(id, meta.engine, input.content);
  writeFileSync(path.join(templateDir(id), 'meta.json'), JSON.stringify(meta, null, 2));
  return { ...meta, content: input.content };
}

function writeContent(id, engine, content) {
  const file = path.join(templateDir(id), engine === 'text' ? 'template.txt' : 'template.hbs');
  writeFileSync(file, content);
}

export function updateTemplate(id, patch) {
  const meta = getTemplate(id, { withContent: false });
  const engine = patch.engine === 'text' ? 'text' : patch.engine === 'html' ? 'html' : meta.engine;
  const next = {
    ...meta,
    name: patch.name ?? meta.name,
    description: patch.description ?? meta.description,
    engine,
    page: { ...meta.page, ...(patch.page ?? {}) },
    printing: { ...meta.printing, ...(patch.printing ?? {}) },
    sampleData: patch.sampleData ?? meta.sampleData,
    updatedAt: new Date().toISOString(),
  };
  if (typeof patch.content === 'string') {
    if (engine !== meta.engine) {
      const oldFile = path.join(templateDir(id), meta.engine === 'text' ? 'template.txt' : 'template.hbs');
      if (existsSync(oldFile)) rmSync(oldFile);
    }
    writeContent(id, engine, patch.content);
  } else if (engine !== meta.engine) {
    const current = getTemplate(id).content;
    const oldFile = path.join(templateDir(id), meta.engine === 'text' ? 'template.txt' : 'template.hbs');
    if (existsSync(oldFile)) rmSync(oldFile);
    writeContent(id, engine, current);
  }
  writeFileSync(path.join(templateDir(id), 'meta.json'), JSON.stringify(next, null, 2));
  return getTemplate(id);
}

export function deleteTemplate(id) {
  if (!readMeta(id)) throw notFound('error.template_not_found', { id });
  rmSync(templateDir(id), { recursive: true, force: true });
  return { id, deleted: true };
}

export const defaultPage = DEFAULT_PAGE;
