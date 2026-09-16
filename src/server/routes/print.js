import { Router } from 'express';
import multer from 'multer';
import { submitPdfJob, submitTemplateJob, previewTemplate } from '../../core/printService.js';
import { badRequest } from '../../util/errors.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 * 1024 } });

export const printRouter = Router();

/**
 * Khổ thật của bản render đi kèm response để màn xem trước báo số đo và cảnh báo tràn khổ.
 * Đặt ở header nên thân response vẫn là PDF thuần, tải thẳng ra file được.
 */
export function sendLayoutHeaders(res, layout) {
  if (!layout) return;
  res.set('X-Render-Width-Mm', String(layout.widthMm));
  res.set('X-Render-Height-Mm', String(layout.heightMm));
  res.set('X-Render-Pages', String(layout.pages));
  res.set('Access-Control-Expose-Headers', 'X-Render-Width-Mm, X-Render-Height-Mm, X-Render-Pages');
}


function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === '1' || value === 1;
}

function clean(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw badRequest('error.json_field_invalid');
  }
}

printRouter.post('/pdf', upload.single('file'), async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const job = await submitPdfJob({
      content: req.file?.buffer,
      contentBase64: body.content ?? body.contentBase64 ?? body.base64,
      url: body.url,
      filePath: body.filePath ?? body.path,
      fileName: req.file?.originalname ?? body.fileName,
      printer: body.printer,
      copies: body.copies,
      title: body.title,
      options: {
        ...clean({
          duplex: body.duplex,
          paperSize: body.paperSize,
          orientation: body.orientation,
          raw: body.raw === undefined ? undefined : parseBool(body.raw),
          fitToPage: body.fitToPage === undefined ? undefined : parseBool(body.fitToPage),
        }),
        ...parseJson(body.options, {}),
      },
      wait: parseBool(body.wait),
      waitTimeoutMs: Number(body.waitTimeoutMs) || undefined,
      origin: req.auth?.key ? `api:${req.auth.key.name}` : 'api',
      clientId: body.clientId,
    });
    res.status(202).json(job);
  } catch (error) {
    next(error);
  }
});

printRouter.post('/template', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const job = await submitTemplateJob({
      templateId: body.templateId ?? body.template_id,
      template: body.template,
      engine: body.engine,
      data: body.data ?? body.variables ?? {},
      page: body.page,
      printer: body.printer,
      copies: body.copies,
      title: body.title,
      options: body.options ?? {},
      escpos: body.escpos,
      wait: parseBool(body.wait),
      waitTimeoutMs: Number(body.waitTimeoutMs) || undefined,
      origin: req.auth?.key ? `api:${req.auth.key.name}` : 'api',
      clientId: body.clientId,
    });
    res.status(202).json(job);
  } catch (error) {
    next(error);
  }
});

printRouter.post('/render', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const rendered = await previewTemplate({
      templateId: body.templateId,
      template: body.template,
      engine: body.engine,
      data: body.data ?? body.variables ?? {},
      page: body.page,
    });
    sendLayoutHeaders(res, rendered.layout);
    if (req.query.format === 'html' && rendered.html) {
      res.type('html').send(rendered.html);
      return;
    }
    if (req.query.format === 'base64') {
      res.json({ contentType: rendered.contentType, base64: rendered.buffer.toString('base64') });
      return;
    }
    res.type(rendered.contentType).send(rendered.buffer);
  } catch (error) {
    next(error);
  }
});
