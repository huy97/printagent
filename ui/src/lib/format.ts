import { getLocale, translate } from '@/i18n/locale'

const INTL_LOCALE: Record<string, string> = { vi: 'vi-VN', en: 'en-US' }

function intlLocale() {
  return INTL_LOCALE[getLocale()] ?? 'vi-VN'
}

export function formatTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(intlLocale())
}

export function formatClock(value?: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString(intlLocale())
}

export function formatBytes(value?: number | null) {
  if (!value && value !== 0) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

export function formatUptime(seconds?: number) {
  const locale = getLocale()
  if (!seconds) return translate(locale, 'common.minutes', { minutes: 0 })
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return hours > 0
    ? translate(locale, 'common.hours_minutes', { hours, minutes })
    : translate(locale, 'common.minutes', { minutes })
}

export type Tone = 'ok' | 'warn' | 'err' | 'info' | 'muted'

export function statusTone(status: string): Tone {
  switch (status) {
    case 'completed':
    case 'idle':
    case 'running':
      return 'ok'
    case 'printing':
    case 'rendering':
    case 'starting':
    case 'registered':
      return 'info'
    case 'queued':
    case 'warmup':
      return 'warn'
    case 'failed':
    case 'error':
    case 'offline':
    case 'disabled':
    case 'stopped':
      return 'err'
    default:
      return 'muted'
  }
}
