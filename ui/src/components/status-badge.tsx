import { useI18n } from '@/i18n'
import { translateOptional } from '@/i18n/locale'
import { Badge } from '@/components/ui/badge'
import { statusTone } from '@/lib/format'
import { cn } from '@/lib/utils'

const TONE_CLASS: Record<string, string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  err: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  muted: 'border-border bg-muted text-muted-foreground',
}

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  const { locale } = useI18n()
  const value = status ?? 'unknown'
  return (
    <Badge variant="outline" className={cn('font-medium', TONE_CLASS[statusTone(value)], className)}>
      {translateOptional(locale, `status.${value}`) ?? value}
    </Badge>
  )
}
