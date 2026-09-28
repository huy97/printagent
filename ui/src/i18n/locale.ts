import { en } from './en'
import { vi } from './vi'

export type Locale = 'vi' | 'en'
export type MessageKey = keyof typeof en

export const LOCALES: Locale[] = ['en', 'vi']
export const LOCALE_LABELS: Record<Locale, string> = { vi: 'Tiếng Việt', en: 'English' }
export const LOCALE_SHORT: Record<Locale, string> = { vi: 'VI', en: 'EN' }

const CATALOGS: Record<Locale, Record<string, string>> = { en, vi }
const STORAGE_KEY = 'printagent.locale'
const DEFAULT_LOCALE: Locale = 'en'

function readStored(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'en' || value === 'vi') return value
  } catch {
    // localStorage throws when the browser blocks third-party storage
  }
  return DEFAULT_LOCALE
}

let current: Locale = readStored()

export function getLocale(): Locale {
  return current
}

export function storeLocale(locale: Locale) {
  current = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Still applies to the current session when it cannot be persisted
  }
}

export function translate(locale: Locale, key: MessageKey, params?: Record<string, string | number>) {
  const template = CATALOGS[locale]?.[key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key
  return interpolate(template, params)
}

export function translateOptional(locale: Locale, key: string, params?: Record<string, string | number>) {
  const template = CATALOGS[locale]?.[key] ?? CATALOGS[DEFAULT_LOCALE][key]
  return template ? interpolate(template, params) : null
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  )
}
