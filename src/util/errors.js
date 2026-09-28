import { t } from '../i18n/index.js';

export class AppError extends Error {
  /**
   * `key` is the i18n catalog key clients use to translate the error themselves;
   * `message` is rendered in the agent's current locale for logs and the CLI.
   */
  constructor(key, { status = 400, code = 'bad_request', params, details } = {}) {
    super(t(key, params));
    this.name = 'AppError';
    this.key = key;
    this.params = params;
    this.status = status;
    this.code = code;
    this.details = details;
  }

  localize(locale) {
    return t(this.key, this.params, locale);
  }
}

export const badRequest = (key, params, details) =>
  new AppError(key, { status: 400, code: 'bad_request', params, details });
export const unauthorized = (key = 'error.unauthorized', params) =>
  new AppError(key, { status: 401, code: 'unauthorized', params });
export const notFound = (key = 'error.not_found', params) =>
  new AppError(key, { status: 404, code: 'not_found', params });
export const serverError = (key, params, details) =>
  new AppError(key, { status: 500, code: 'internal_error', params, details });

const MULTER_KEYS = {
  LIMIT_FILE_SIZE: ['error.upload_too_large', 413],
  LIMIT_FILE_COUNT: ['error.upload_too_many_files', 400],
  LIMIT_UNEXPECTED_FILE: ['error.upload_unexpected_field', 400],
};

/** Wraps any thrown value into an AppError so every error response carries an i18n key. */
export function toAppError(error) {
  if (error instanceof AppError) return error;
  const message = error?.stderr?.trim() || error?.message || String(error ?? '');
  if (error?.type === 'entity.parse.failed') {
    return new AppError('error.invalid_json_body', { status: 400, code: 'bad_request' });
  }
  if (error?.type === 'entity.too.large') {
    return new AppError('error.payload_too_large', { status: 413, code: 'payload_too_large' });
  }
  if (error?.name === 'MulterError' && MULTER_KEYS[error.code]) {
    const [key, status] = MULTER_KEYS[error.code];
    return new AppError(key, { status, code: 'bad_request', params: { field: error.field } });
  }
  const raw = Number(error?.status ?? error?.statusCode);
  const status = raw >= 400 && raw < 600 ? raw : 500;
  if (status < 500) {
    return new AppError('error.request_failed', { status, code: 'bad_request', params: { message } });
  }
  return new AppError('error.internal', {
    status,
    code: 'internal_error',
    params: { message },
    details: error?.details,
  });
}

/** Wire format shared by REST, WebSocket and MCP error payloads. */
export function serializeError(error, locale) {
  const appError = toAppError(error);
  return {
    code: appError.code,
    key: appError.key,
    params: appError.params ?? undefined,
    message: appError.localize(locale),
    details: appError.details,
  };
}
