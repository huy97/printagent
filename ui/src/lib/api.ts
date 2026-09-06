import { getLocale } from '@/i18n/locale'

export interface Printer {
  name: string
  description?: string | null
  location?: string | null
  status: string
  statusText?: string
  connection?: string | null
  driver?: string | null
  accepting?: boolean
  isSystemDefault?: boolean
  isAgentDefault?: boolean
}

export interface PrinterOption {
  key: string
  label: string
  values: string[]
  current: string | null
}

export interface TemplatePage {
  format?: string | null
  landscape?: boolean
  width?: string | null
  height?: string | null
  marginTop?: string
  marginRight?: string
  marginBottom?: string
  marginLeft?: string
  printBackground?: boolean
  scale?: number
}

export interface Template {
  id: string
  name: string
  description?: string
  engine: 'html' | 'text'
  page: TemplatePage
  printing: { printer?: string | null; copies?: number; raw?: boolean }
  sampleData?: Record<string, unknown>
  content?: string
  createdAt?: string
  updatedAt?: string
}

export interface Job {
  id: string
  type: string
  status: 'queued' | 'rendering' | 'printing' | 'completed' | 'failed' | 'canceled'
  printer: string | null
  copies: number
  title: string
  templateId: string | null
  fileName: string | null
  filePath: string | null
  bytes: number | null
  options: Record<string, unknown>
  origin: string
  error: string | null
  output: string | null
  createdAt: string
  finishedAt: string | null
}

export interface QueueStats {
  total: number
  running: number
  queued: number
  counts: Record<string, number>
}

export interface Health {
  ok: boolean
  agent?: { name: string; id: string }
  version?: string
  uptimeSeconds?: number
  platform?: string
  node?: string
  printerDriver?: string
  queue?: QueueStats
  tunnel?: { status: string; url: string | null }
}

export interface ApiKey {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
  preview?: string
  key?: string
}

export interface AgentConfig {
  agent: { name: string; id: string; locale: string }
  server: { host: string; port: number; corsOrigins: string[] }
  auth: { enabled: boolean; allowLocalhostWithoutKey: boolean; apiKeys: ApiKey[] }
  printing: {
    defaultPrinter: string | null
    copies: number
    duplex: string
    paperSize: string
    orientation: string
    sumatraPath: string | null
    rawShareName: string | null
    allowLocalFilePath: boolean
    allowedFileRoots: string[]
    allowRemoteUrl: boolean
    maxDownloadMb: number
  }
  render: {
    chromePath: string | null
    format: string
    marginTop: string
    marginRight: string
    marginBottom: string
    marginLeft: string
    printBackground: boolean
    browserIdleTimeoutMs: number
  }
  queue: { concurrency: number; maxRetries: number; keepJobs: number; keepFilesHours: number }
  discovery: { autoRefreshSeconds: number }
  tunnel: {
    provider: 'none' | 'cloudflare' | 'ngrok'
    autoStart: boolean
    cloudflare: { binPath: string; token: string | null; hostname: string | null }
    ngrok: { binPath: string; authtoken: string | null; domain: string | null; region: string | null }
  }
}

export interface TunnelStatus {
  provider: string | null
  status: string
  url: string | null
  pid: number | null
  error: string | null
  warning?: string | null
  logs: string[]
}

export interface TunnelInfo {
  status: TunnelStatus
  config: AgentConfig['tunnel']
  binaries: Record<string, { installed: boolean; path: string | null; version: string | null; install: string }>
}

export interface SetupStep {
  id: string
  title: string
  status: 'ok' | 'warn' | 'error'
  detail?: string
  hint?: string
}

export interface ServiceStatus {
  installed: boolean
  running: boolean
  supported: boolean
  manager?: string | null
  unit?: string | null
}

export interface SetupPlanStep {
  id: string
  title: string
  required: boolean
}

export interface SetupLog {
  at: string
  message: string
}

export interface SetupProgress {
  running: boolean
  ok: boolean | null
  startedAt: string | null
  finishedAt: string | null
  current: { id: string; title: string } | null
  phase: 'check' | 'fix' | null
  plan: SetupPlanStep[]
  steps: SetupStep[]
  logs: SetupLog[]
  failed: SetupStep | null
  summary?: SetupState | null
  service?: ServiceStatus | null
}

export interface SetupState {
  complete: boolean
  version: number
  currentVersion: number
  completedAt: string | null
  updatedAt: string | null
  platform: string
  local: boolean
  steps: SetupStep[]
  plan: SetupPlanStep[]
  service: ServiceStatus
}

export interface LogEntry {
  time: string
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  message: string
}

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const KEY_STORAGE = 'printagent.apiKey'

export const apiKeyStore = {
  get: () => localStorage.getItem(KEY_STORAGE) ?? '',
  set: (value: string) => localStorage.setItem(KEY_STORAGE, value),
  clear: () => localStorage.removeItem(KEY_STORAGE),
}

interface RequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await rawRequest(path, options)
  const text = await response.text()
  let data: unknown = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  if (!response.ok) {
    const payload = data as { error?: { message?: string; code?: string } }
    throw new ApiError(payload?.error?.message ?? `HTTP ${response.status}`, response.status, payload?.error?.code)
  }
  return data as T
}

async function rawRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const url = new URL(path, location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  const headers: Record<string, string> = { 'x-locale': getLocale() }
  const apiKey = apiKeyStore.get()
  if (apiKey) headers['x-api-key'] = apiKey
  let body: BodyInit | undefined
  if (options.body instanceof FormData) {
    body = options.body
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  return fetch(url, { method: options.method ?? 'GET', headers, body })
}

async function blobRequest(path: string, options: RequestOptions = {}): Promise<Blob> {
  const response = await rawRequest(path, options)
  if (!response.ok) {
    const text = await response.text()
    let message = `HTTP ${response.status}`
    try {
      message = JSON.parse(text)?.error?.message ?? message
    } catch {
      /* giữ nguyên message mặc định */
    }
    throw new ApiError(message, response.status)
  }
  return response.blob()
}

export const api = {
  health: () => request<Health>('/api/health'),
  info: () => request<Record<string, unknown>>('/api/info'),
  logs: (limit = 150) => request<{ logs: LogEntry[] }>('/api/logs', { query: { limit } }),

  settings: () => request<AgentConfig>('/api/settings'),
  saveSettings: (patch: unknown) =>
    request<AgentConfig & { rejectedFields?: string[] }>('/api/settings', { method: 'PUT', body: patch }),

  printers: (refresh = false) =>
    request<{ printers: Printer[]; lastScanAt: number | null; driver: string; defaultPrinter: string | null }>(
      '/api/printers',
      { query: { refresh: refresh ? 1 : undefined } },
    ),
  printer: (name: string) => request<Printer & { options: PrinterOption[] }>(`/api/printers/${encodeURIComponent(name)}`),
  setDefaultPrinter: (name: string) =>
    request<{ defaultPrinter: string }>(`/api/printers/${encodeURIComponent(name)}/default`, { method: 'POST' }),
  testPrinter: (name: string) => request<Job>(`/api/printers/${encodeURIComponent(name)}/test`, { method: 'POST' }),

  templates: () => request<{ templates: Template[] }>('/api/templates'),
  template: (id: string) => request<Template>(`/api/templates/${encodeURIComponent(id)}`),
  createTemplate: (body: Partial<Template>) => request<Template>('/api/templates', { method: 'POST', body }),
  updateTemplate: (id: string, body: Partial<Template>) =>
    request<Template>(`/api/templates/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteTemplate: (id: string) =>
    request<{ deleted: boolean }>(`/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  jobs: (query: { limit?: number; status?: string } = {}) =>
    request<{ jobs: Job[]; stats: QueueStats }>('/api/jobs', { query }),
  cancelJob: (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  retryJob: (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  jobFile: (id: string) => blobRequest(`/api/jobs/${encodeURIComponent(id)}/file`),

  printPdf: (body: FormData | Record<string, unknown>) => request<Job>('/api/print/pdf', { method: 'POST', body }),
  printTemplate: (body: Record<string, unknown>) => request<Job>('/api/print/template', { method: 'POST', body }),
  renderPreview: (body: Record<string, unknown>) => blobRequest('/api/print/render', { method: 'POST', body }),

  apiKeys: () => request<{ apiKeys: ApiKey[] }>('/api/apikeys'),
  createApiKey: (name: string) => request<ApiKey>('/api/apikeys', { method: 'POST', body: { name } }),
  revealApiKey: (id: string) => request<ApiKey>(`/api/apikeys/${encodeURIComponent(id)}/reveal`),
  deleteApiKey: (id: string) =>
    request<{ deleted: boolean }>(`/api/apikeys/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  setup: () => request<SetupState>('/api/setup'),
  runSetup: (body: { enableService?: boolean; autoFix?: boolean }) =>
    request<SetupProgress>(
      '/api/setup/run',
      { method: 'POST', body },
    ),
  setupProgress: () => request<SetupProgress>('/api/setup/progress'),
  setupService: (action: 'install' | 'uninstall') =>
    request<ServiceStatus>('/api/setup/service', { method: 'POST', body: { action } }),

  tunnel: () => request<TunnelInfo>('/api/tunnel'),
  startTunnel: (provider: string) => request<TunnelStatus>('/api/tunnel/start', { method: 'POST', body: { provider } }),
  stopTunnel: () => request<TunnelStatus>('/api/tunnel/stop', { method: 'POST' }),
}

/**
 * Chạy cài đặt rồi hỏi tiến độ tới khi xong, vì các bước có thể tải Chromium hoặc Node.
 */
export async function runSetupUntilDone(
  body: { enableService?: boolean; autoFix?: boolean },
  onProgress?: (progress: SetupProgress) => void,
): Promise<SetupProgress> {
  let progress = await api.runSetup(body)
  onProgress?.(progress)
  while (progress.running) {
    await new Promise((resolve) => setTimeout(resolve, 700))
    progress = await api.setupProgress()
    onProgress?.(progress)
  }
  return progress
}
