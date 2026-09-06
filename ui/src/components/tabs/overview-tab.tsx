import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Printer as PrinterIcon } from 'lucide-react'
import { CopyButton } from '@/components/copy-button'
import { LogView } from '@/components/log-view'
import { StatusBadge } from '@/components/status-badge'
import { useAgent } from '@/hooks/use-agent'
import { useI18n } from '@/i18n'
import { translateOptional } from '@/i18n/locale'
import { formatBytes, formatClock, formatUptime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

function Metric({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'brand' | 'ok'
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5 p-4 sm:p-5', className)}>
      <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">{label}</span>
      <span
        className={cn(
          'font-mono text-3xl leading-none font-medium tracking-tight tabular-nums',
          tone === 'brand' && 'text-brand',
          tone === 'ok' && 'text-ok',
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-muted-foreground truncate text-xs">{hint}</span> : null}
    </div>
  )
}

function Fact({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: 'ok' | 'warn' }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span
        className={cn(
          'truncate text-[13px]',
          mono && 'font-mono text-xs',
          tone === 'ok' && 'text-ok',
          tone === 'warn' && 'text-warn',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Endpoint({ label, value }: { label: string; value: string }) {
  const { t } = useI18n()
  return (
    <div className="group/endpoint flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">{label}</span>
      <div className="flex items-center gap-1">
        <code className="text-foreground/80 min-w-0 flex-1 truncate font-mono text-xs">{value}</code>
        <CopyButton
          value={value}
          label={t('overview.copy_endpoint', { name: label })}
          className="size-6 shrink-0 opacity-0 transition-opacity group-hover/endpoint:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        />
      </div>
    </div>
  )
}

export function OverviewTab() {
  const { t, locale } = useI18n()
  const { health, config, printers, templates, jobs, logs, tunnel, stats } = useAgent()
  const queue = stats ?? health?.queue
  const base = location.origin
  const recent = jobs.slice(0, 12)
  const defaultPrinter = config?.printing.defaultPrinter
  const defaultMissing = Boolean(defaultPrinter) && !printers.some((printer) => printer.name === defaultPrinter)

  return (
    <div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1">
      <div className="bg-card grid shrink-0 grid-cols-1 divide-y rounded-[10px] border sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
        <Metric
          label={t('overview.metric.printers')}
          value={printers.length}
          hint={
            defaultPrinter ? (
              <span className={defaultMissing ? 'text-warn' : undefined}>
                {defaultMissing
                  ? t('overview.metric.printer_missing', { printer: defaultPrinter })
                  : t('overview.metric.printer_default', { printer: defaultPrinter })}
              </span>
            ) : (
              t('overview.metric.printer_none')
            )
          }
          className="sm:border-r sm:border-b xl:border-b-0"
        />
        <Metric
          label={t('overview.metric.queued')}
          value={queue?.queued ?? 0}
          tone="brand"
          hint={t('overview.metric.running', { count: queue?.running ?? 0 })}
          className="sm:border-b xl:border-b-0"
        />
        <Metric
          label={t('overview.metric.total_jobs')}
          value={queue?.total ?? 0}
          hint={t('overview.metric.failed', { count: queue?.counts?.failed ?? 0 })}
          className="sm:border-r"
        />
        <Metric
          label={t('overview.metric.tunnel')}
          value={
            <span className="text-xl">
              {translateOptional(locale, `status.${tunnel?.status ?? 'stopped'}`) ?? tunnel?.status}
            </span>
          }
          hint={tunnel?.url ?? t('overview.metric.tunnel_closed')}
        />
      </div>

      <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="gap-0 overflow-hidden py-0 xl:min-h-0">
          <CardHeader className="flex shrink-0 flex-row items-center gap-2.5 border-b px-4 py-3 sm:px-5">
            <CardTitle className="text-sm font-medium">{t('overview.recent_jobs')}</CardTitle>
            <span className="text-muted-foreground text-xs">{t('overview.recent_count', { count: recent.length })}</span>
          </CardHeader>
          <CardContent className="px-0 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {recent.length === 0 ? (
              <p className="text-muted-foreground px-4 py-10 text-center text-sm sm:px-5">
                {t('overview.jobs_empty')}
              </p>
            ) : (
              <div className="divide-y">
                <div className="text-muted-foreground bg-card sticky top-0 z-10 hidden grid-cols-[64px_minmax(0,1fr)_88px_84px_150px_96px] items-center gap-3 border-b px-4 py-1.5 text-[10px] font-medium tracking-wider uppercase sm:px-5 md:grid">
                  <span>{t('overview.col.time')}</span>
                  <span>{t('overview.col.document')}</span>
                  <span>{t('overview.col.origin')}</span>
                  <span className="text-right">{t('overview.col.size')}</span>
                  <span>{t('overview.col.printer')}</span>
                  <span className="text-right">{t('overview.col.status')}</span>
                </div>
                {recent.map((job) => (
                  <div
                    key={job.id}
                    className="hover:bg-muted/40 grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 transition-colors sm:px-5 md:grid-cols-[64px_minmax(0,1fr)_88px_84px_150px_96px]"
                  >
                    <span className="text-muted-foreground font-mono text-xs">{formatClock(job.createdAt)}</span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[13px]">
                        {job.templateId ? t('overview.job_template', { id: job.templateId }) : (job.fileName ?? job.title)}
                      </span>
                      <span className="text-muted-foreground truncate text-[11px] md:hidden">
                        {job.origin} · {t('overview.copies', { count: job.copies })}
                      </span>
                    </div>
                    <span className="text-muted-foreground hidden truncate text-xs md:block">
                      {job.origin}
                      {job.copies > 1 ? ` ×${job.copies}` : ''}
                    </span>
                    <span className="text-muted-foreground hidden text-right font-mono text-[11px] md:block">
                      {job.bytes ? formatBytes(job.bytes) : '-'}
                    </span>
                    <span className="text-foreground/70 hidden truncate text-[13px] md:block">
                      {job.printer ?? '-'}
                    </span>
                    <StatusBadge status={job.status} className="justify-self-end" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 xl:min-h-0 xl:overflow-y-auto">
          <Card className="shrink-0">
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('overview.endpoints')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0">
              <Endpoint label="REST" value={`${base}/api`} />
              <Endpoint label="WebSocket" value={`${base.replace(/^http/, 'ws')}/ws`} />
              <Endpoint label="MCP" value={`${base}/mcp`} />
              {tunnel?.url ? (
                <div className="border-t pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                      {t('overview.public')}
                    </span>
                    <div className="flex items-center gap-1">
                      <code className="text-brand min-w-0 flex-1 truncate font-mono text-xs">{tunnel.url}</code>
                      <CopyButton value={tunnel.url} label={t('overview.copy_public')} className="size-6 shrink-0" />
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="shrink-0">
            <CardHeader className="flex flex-row items-center gap-2">
              <CardTitle className="text-sm font-medium">{t('overview.agent_state')}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 pt-0 text-sm">
              <Fact label={t('overview.fact.agent')} value={health?.agent?.name ?? '-'} />
              <Fact label={t('overview.fact.platform')} value={health?.platform ?? '-'} mono />
              <Fact label={t('overview.fact.driver')} value={health?.printerDriver ?? '-'} mono />
              <Fact label="Node" value={health?.node ?? '-'} mono />
              <Fact label={t('header.uptime')} value={formatUptime(health?.uptimeSeconds)} mono />
              <Fact label={t('nav.templates')} value={t('overview.fact.template_count', { count: templates.length })} mono />
              <Fact
                label={t('overview.fact.auth')}
                value={config?.auth.enabled ? t('overview.fact.on') : t('overview.fact.off')}
                mono
                tone={config?.auth.enabled ? 'ok' : 'warn'}
              />
              <Fact
                label={t('overview.fact.listen')}
                value={config ? `${config.server.host}:${config.server.port}` : '-'}
                mono
              />
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0 xl:min-h-0 xl:flex-1">
            <CardHeader className="flex shrink-0 flex-row items-center gap-2.5 border-b px-4 py-3">
              <CardTitle className="text-sm font-medium">{t('nav.printers')}</CardTitle>
              <span className="text-muted-foreground text-xs">{t('overview.device_count', { count: printers.length })}</span>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto px-0 py-0">
              {printers.length === 0 ? (
                <p className="text-muted-foreground px-4 py-6 text-center text-xs">
                  {t('overview.printers_empty')}
                </p>
              ) : (
                <div className="divide-y">
                  {printers.map((printer) => (
                    <div key={printer.name} className="group/printer flex items-center gap-2.5 px-4 py-2">
                      <PrinterIcon
                        className={cn(
                          'size-3.5 shrink-0',
                          printer.status === 'ready' ? 'text-ok' : 'text-muted-foreground',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{printer.name}</span>
                      <CopyButton
                        value={printer.name}
                        label={t('overview.copy_printer')}
                        className="size-6 shrink-0 opacity-0 transition-opacity group-hover/printer:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                      />
                      {printer.isAgentDefault ? (
                        <span className="bg-brand/12 text-brand rounded-full px-1.5 py-0.5 text-[10px]">{t('overview.default_short')}</span>
                      ) : null}
                      <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                        {translateOptional(locale, `status.${printer.status}`) ?? printer.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0 xl:min-h-52 xl:shrink-0 xl:basis-64">
        <CardHeader className="flex shrink-0 flex-row items-center gap-2 border-b px-4 py-3 sm:px-5">
          <CardTitle className="text-sm font-medium">{t('overview.logs')}</CardTitle>
          <span className="bg-ok size-1.5 rounded-full" />
          <span className="text-muted-foreground ml-auto text-xs">{t('overview.logs_live')}</span>
          <CopyButton
            value={logs.map((entry) => `${formatClock(entry.time)} [${entry.scope}] ${entry.message}`).join('\n')}
            label={t('overview.copy_logs')}
          />
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <LogView logs={logs} className="h-56 rounded-none px-4 py-3 sm:px-5 xl:h-full" />
        </CardContent>
      </Card>
    </div>
  )
}
