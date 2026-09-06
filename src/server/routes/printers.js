import { Router } from 'express';
import * as printers from '../../printers/index.js';
import { getConfig, updateConfig } from '../../core/config.js';
import { printTestPage } from '../../core/printService.js';
import { notFound } from '../../util/errors.js';

export const printersRouter = Router();

printersRouter.get('/', async (req, res, next) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    const result = await printers.scanPrinters({ force });
    res.json({ ...result, defaultPrinter: getConfig().printing.defaultPrinter });
  } catch (error) {
    next(error);
  }
});

printersRouter.post('/scan', async (req, res, next) => {
  try {
    res.json(await printers.scanPrinters({ force: true }));
  } catch (error) {
    next(error);
  }
});

printersRouter.get('/:name', async (req, res, next) => {
  try {
    const printer = await printers.findPrinter(req.params.name);
    if (!printer) throw notFound('error.printer_not_found', { name: req.params.name });
    res.json({ ...printer, options: await printers.getPrinterOptions(printer.name) });
  } catch (error) {
    next(error);
  }
});

printersRouter.post('/:name/default', async (req, res, next) => {
  try {
    const printer = await printers.findPrinter(req.params.name);
    if (!printer) throw notFound('error.printer_not_found', { name: req.params.name });
    updateConfig({ printing: { defaultPrinter: printer.name } });
    await printers.scanPrinters({ force: true });
    res.json({ defaultPrinter: printer.name });
  } catch (error) {
    next(error);
  }
});

printersRouter.post('/:name/test', async (req, res, next) => {
  try {
    res.json(await printTestPage(req.params.name));
  } catch (error) {
    next(error);
  }
});
