import { Router } from 'express';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../../render/templates.js';
import { previewTemplate } from '../../core/printService.js';

export const templatesRouter = Router();

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
    // Không truyền data thì lấy sampleData của template để xem trước có nội dung.
    const template = getTemplate(req.params.id, { withContent: false });
    const rendered = await previewTemplate({
      templateId: req.params.id,
      data: req.body?.data ?? template.sampleData ?? {},
      page: req.body?.page,
      engine: req.body?.engine,
    });
    if (req.query.format === 'html' && rendered.html) {
      res.type('html').send(rendered.html);
      return;
    }
    res.type(rendered.contentType).send(rendered.buffer);
  } catch (error) {
    next(error);
  }
});
