import { Router } from 'express';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../../render/templates.js';
import { previewTemplate } from '../../core/printService.js';
import { sendLayoutHeaders } from './print.js';
import { seedTemplates, seedCatalog } from '../../render/seed.js';
import { getConfig } from '../../core/config.js';
import { localeFromRequest, LOCALES } from '../../i18n/index.js';

export const templatesRouter = Router();

templatesRouter.get('/seeds', (req, res) => {
  const locale = LOCALES.includes(req.query.lang) ? req.query.lang : localeFromRequest(req);
  res.json({ locale, seeds: seedCatalog(locale) });
});

templatesRouter.post('/seed', (req, res, next) => {
  try {
    const locale = LOCALES.includes(req.body?.locale) ? req.body.locale : getConfig().agent.locale;
    // force: a set in another language can still be created after setup has already run once.
    res.status(201).json({ locale, ...seedTemplates({ locale, force: true }) });
  } catch (error) {
    next(error);
  }
});

templatesRouter.get('/', (req, res) => {
  res.json({ templates: listTemplates() });
});

templatesRouter.post('/', (req, res, next) => {
  try {
    res.status(201).json(createTemplate(req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

templatesRouter.get('/:id', (req, res, next) => {
  try {
    res.json(getTemplate(req.params.id));
  } catch (error) {
    next(error);
  }
});

templatesRouter.put('/:id', (req, res, next) => {
  try {
    res.json(updateTemplate(req.params.id, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

templatesRouter.delete('/:id', (req, res, next) => {
  try {
    res.json(deleteTemplate(req.params.id));
  } catch (error) {
    next(error);
  }
});

templatesRouter.post('/:id/preview', async (req, res, next) => {
  try {
    // Without data, preview with the template's sampleData so it is not empty.
    const template = getTemplate(req.params.id, { withContent: false });
    const rendered = await previewTemplate({
      templateId: req.params.id,
      data: req.body?.data ?? template.sampleData ?? {},
      page: req.body?.page,
      engine: req.body?.engine,
    });
    sendLayoutHeaders(res, rendered.layout);
    if (req.query.format === 'html' && rendered.html) {
      res.type('html').send(rendered.html);
      return;
    }
    res.type(rendered.contentType).send(rendered.buffer);
  } catch (error) {
    next(error);
  }
});
