import { existsSync, createReadStream, readFileSync } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import * as jobs from '../../core/jobs.js';
import { submitPdfJob, submitTemplateJob } from '../../core/printService.js';
import { PATHS } from '../../core/paths.js';
import { notFound, badRequest } from '../../util/errors.js';

export const jobsRouter = Router();

jobsRouter.get('/', (req, res) => {
  res.json({
    jobs: jobs.listJobs({ limit: req.query.limit, status: req.query.status, printer: req.query.printer }),
    stats: jobs.stats(),
  });
});

jobsRouter.get('/:id', (req, res, next) => {
  try {
    res.json(jobs.getJob(req.params.id));
  } catch (error) {
    next(error);
  }
});

jobsRouter.get('/:id/file', (req, res, next) => {
  try {
    const job = jobs.getJob(req.params.id);
    const filePath = job.filePath ? path.resolve(job.filePath) : null;
    const root = path.resolve(PATHS.files);
    if (!filePath || !filePath.startsWith(`${root}${path.sep}`)) {
      throw notFound('error.job_no_file');
    }
    if (!existsSync(filePath)) throw notFound('error.job_file_gone');
    res.type(filePath.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    const stream = createReadStream(filePath);
    stream.on('error', (error) => {
      if (!res.headersSent) next(badRequest('error.job_file_unreadable', { message: error.message }));
      else res.destroy(error);
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

jobsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    res.json(await jobs.cancelJob(req.params.id));
  } catch (error) {
    next(error);
  }
});

jobsRouter.post('/:id/retry', async (req, res, next) => {
  try {
    const job = jobs.getJob(req.params.id);
    const common = {
      printer: job.printer,
      copies: job.copies,
      title: job.title,
      options: job.options,
      origin: 'retry',
    };
    if (job.type === 'template' && (job.templateId || job.templateSource)) {
      res.json(
        await submitTemplateJob({
          ...common,
          templateId: job.templateId ?? undefined,
          template: job.templateId ? undefined : job.templateSource,
          engine: job.engine ?? undefined,
          page: job.page ?? undefined,
          data: job.data ?? {},
        }),
      );
      return;
    }
    const filePath = job.filePath ? path.resolve(job.filePath) : null;
    const root = path.resolve(PATHS.files);
    if (!filePath || !filePath.startsWith(`${root}${path.sep}`) || !existsSync(filePath)) {
      throw badRequest('error.job_no_source');
    }
    res.json(await submitPdfJob({ ...common, content: readFileSync(filePath), fileName: job.fileName }));
  } catch (error) {
    next(error);
  }
});
