import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  FileText,
  Globe,
  Loader2,
  Play,
  Printer,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { reportError } from '@/hooks/use-agent'
import { LocaleSwitch } from '@/components/locale-switch'
import { useI18n, useT, type MessageKey } from '@/i18n'
import { api, runSetupUntilDone, type SetupProgress, type SetupState, type SetupStep } from '@/lib/api'
import { CopyButton } from '@/components/copy-button'
import { cn } from '@/lib/utils'

type RowState = 'pending' | 'running' | 'fixing' | SetupStep['status']

interface Row {
  id: string
  title: string
  state: RowState
  detail?: string
  hint?: string
}

const PITCH: { icon: typeof Globe; titleKey: MessageKey; textKey: MessageKey }[] = [
  { icon: ArrowLeftRight, titleKey: 'setup.pitch.api', textKey: 'setup.pitch.api_text' },
  { icon: FileText, titleKey: 'setup.pitch.template', textKey: 'setup.pitch.template_text' },
  { icon: Globe, titleKey: 'setup.pitch.tunnel', textKey: 'setup.pitch.tunnel_text' },
]

function StepMarker({ state }: { state: RowState }) {
  if (state === 'ok') {
    return (
      <span className="bg-ok flex size-5.5 shrink-0 items-center justify-center rounded-full text-white">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    )
  }
  if (state === 'warn') {
    return (
      <span className="bg-warn flex size-5.5 shrink-0 items-center justify-center rounded-full text-white">
        <AlertTriangle className="size-3" strokeWidth={2.6} />
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span className="bg-destructive flex size-5.5 shrink-0 items-center justify-center rounded-full text-white">
        <X className="size-3.5" strokeWidth={3} />
      </span>
    )
  }
  if (state === 'running' || state === 'fixing') {
    return <span className="border-brand size-5.5 shrink-0 animate-spin rounded-full border-2 border-t-transparent" />
  }
  return <span className="border-border size-5.5 shrink-0 rounded-full border-[1.5px]" />
}

const STATE_LABEL: Record<RowState, MessageKey> = {
  pending: 'setup.state.pending',
  running: 'setup.state.running',
  fixing: 'setup.state.fixing',
  ok: 'setup.state.ok',
  warn: 'setup.state.warn',
  error: 'setup.state.error',
}

function StepRow({ row, last, log }: { row: Row; last: boolean; log?: string[] }) {
  const t = useT()
  const busy = row.state === 'running' || row.state === 'fixing'
  const muted = row.state === 'pending'

  return (
    <div
      className={cn(
        'relative flex gap-3.5 break-inside-avoid',
        busy ? 'border-brand/25 bg-brand/5 -mx-3.5 rounded-[10px] border px-3.5 py-3' : 'py-3',
      )}
    >
      <StepMarker state={row.state} />
      {last ? null : (
        <span
          className={cn(
            'absolute top-[2.125rem] -bottom-1.5 w-px 2xl:hidden',
            busy ? 'bg-brand/25 left-[1.09rem]' : 'bg-border left-[0.65rem]',
          )}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={cn('text-sm', muted ? 'text-muted-foreground' : 'font-medium')}>{row.title}</span>
          <span
            className={cn(
              'font-mono text-xs break-all',
              row.state === 'warn' && 'text-warn',
              row.state === 'error' && 'text-destructive',
              row.state === 'ok' && 'text-muted-foreground',
              busy && 'text-brand',
              muted && 'text-muted-foreground/60',
            )}
          >
            {row.detail ?? t(STATE_LABEL[row.state])}
          </span>
          {row.state === 'error' && row.detail ? (
            <CopyButton
              value={[row.title, row.detail, row.hint].filter(Boolean).join('\n')}
              label={t('jobs.copy_error')}
              className="size-6"
            />
          ) : null}
        </div>
        {row.hint ? <p className="text-muted-foreground text-xs leading-relaxed">{row.hint}</p> : null}
        {busy && log?.length ? (
          <div className="bg-card border-brand/20 text-muted-foreground flex max-h-24 flex-col gap-1 overflow-y-auto rounded-lg border p-2.5 font-mono text-[11px] leading-relaxed">
            {log.map((line, index) => (
              <span key={index} className="break-all">
                {line}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function buildRows(state: SetupState, progress: SetupProgress | null): Row[] {
  const plan = progress?.plan.length ? progress.plan : state.plan
  const done = new Map((progress?.steps ?? state.steps).map((step) => [step.id, step]))
  return plan.map((item) => {
    const result = done.get(item.id)
    if (result) {
      return { id: item.id, title: item.title, state: result.status, detail: result.detail, hint: result.hint }
    }
    if (progress?.current?.id === item.id) {
      return { id: item.id, title: item.title, state: progress.phase === 'fix' ? 'fixing' : 'running' }
    }
    return { id: item.id, title: item.title, state: 'pending' }
  })
}

export function SetupScreen({ state, onDone }: { state: SetupState; onDone: () => void }) {
  const t = useT()
  const { locale } = useI18n()
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [enableService, setEnableService] = useState(!state.service.installed)
  const [seedTemplates, setSeedTemplates] = useState(state.templates.count === 0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!state.local) return
    let stopped = false
    const poll = async () => {
      while (!stopped) {
        const current = await api.setupProgress()
        setProgress(current)
        if (!current.running) break
        setRunning(true)
        await new Promise((resolve) => setTimeout(resolve, 700))
      }
      if (!stopped) setRunning(false)
    }
    api
      .setupProgress()
      .then((current) => {
        if (current.running) void poll()
      })
      .catch(() => {})
    return () => {
      stopped = true
    }
  }, [state.local])

  const rows = useMemo(() => buildRows(state, progress), [state, progress])
  const failed = progress && !progress.running ? progress.failed : null
  const finished = Boolean(progress && !progress.running && progress.ok)
  const ready = finished || state.complete
  const doneCount = rows.filter((row) => row.state !== 'pending' && row.state !== 'running' && row.state !== 'fixing').length
  const percent = rows.length ? Math.round((doneCount / rows.length) * 100) : 0
  const tail = (progress?.logs ?? []).slice(-3).map((entry) => entry.message)

  const run = async () => {
    setRunning(true)
    try {
      const result = await runSetupUntilDone({ enableService, seedTemplates, locale }, setProgress)
      if (result.ok) toast.success(t('setup.done_toast'))
      else toast.error(t('settings.setup_stopped', { step: result.failed?.title ?? '' }))
    } catch (error) {
      reportError(error)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-card text-foreground flex min-h-dvh flex-col lg:flex-row">
      <div className="relative flex shrink-0 flex-col gap-12 overflow-hidden border-b bg-black px-8 py-10 text-white lg:w-[468px] lg:border-r lg:border-b-0 lg:px-11 lg:py-12 2xl:w-[540px] 2xl:px-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_8%_-5%,color-mix(in_oklch,var(--brand)_38%,transparent),transparent_72%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_100%_100%,color-mix(in_oklch,var(--brand)_14%,transparent),transparent_70%)]" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-white/15 bg-white/5">
            <Printer className="size-5" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">PrintAgent</span>
          <LocaleSwitch className="ml-auto border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" />
        </div>

        <div className="relative flex flex-col gap-4 lg:mt-10">
          <h1 className="text-3xl leading-[1.12] font-semibold tracking-tight text-pretty lg:text-[38px]">
            {t('setup.headline_top')}
            <br />
            {t('setup.headline_bottom')}
          </h1>
          <p className="max-w-83 text-[15px] leading-relaxed text-pretty text-white/70">
            {t('setup.subhead')}
          </p>
        </div>

        <div className="relative hidden flex-col gap-4.5 lg:flex">
          {PITCH.map((item) => (
            <div key={item.titleKey} className="flex gap-3">
              <item.icon className="mt-0.5 size-4.5 shrink-0 text-white/55" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{t(item.titleKey)}</span>
                <span className="text-[13px] text-white/60">{t(item.textKey)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-auto flex flex-col gap-2.5">
          <div className="flex justify-between text-xs text-white/65">
            <span>{t('setup.progress')}</span>
            <span className="font-mono">
              {doneCount} / {rows.length}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/12">
            <div
              className="bg-ok h-full rounded-full transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center px-6 py-9 sm:px-10 lg:px-13 lg:py-11">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-tight">{t('setup.title')}</h2>
            <p className="text-muted-foreground text-[13px]">
              {t('setup.platform_note', { platform: state.platform })}
            </p>
          </div>
          {running ? (
            <span className="bg-brand/10 text-brand ml-auto flex h-7 items-center gap-2 rounded-full px-3 text-xs font-medium">
              <span className="bg-brand size-1.5 rounded-full" />
              {t('setup.running_step', { step: doneCount + 1 })}
            </span>
          ) : null}
        </div>

        <div className="mt-7 flex flex-col 2xl:block 2xl:columns-2 2xl:gap-x-16">
          {rows.map((row, index) => (
            <StepRow key={row.id} row={row} last={index === rows.length - 1} log={tail} />
          ))}
        </div>

        {failed ? (
          <div className="border-destructive/40 bg-destructive/5 mt-5 rounded-[10px] border p-3.5 text-sm">
            <div className="text-destructive font-medium">{t('setup.failed_at', { step: failed.title })}</div>
            {failed.hint ? <p className="text-muted-foreground mt-1">{failed.hint}</p> : null}
            <p className="text-muted-foreground mt-1">{t('setup.retry_hint')}</p>
          </div>
        ) : null}

        {!state.local ? (
          <p className="text-warn mt-5 text-xs">
            {t('setup.remote_warning')}
          </p>
        ) : null}

        <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4 border-t pt-5">
          <div className="flex items-center gap-3">
            <Switch
              id="enable-service"
              checked={enableService}
              disabled={!state.service.supported || running}
              onCheckedChange={setEnableService}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="enable-service" className="text-[13px] font-medium">
                {t('setup.service_label')}
              </Label>
              <span className="text-muted-foreground text-xs">{t('setup.service_hint')}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="seed-templates"
              checked={seedTemplates}
              disabled={running}
              onCheckedChange={setSeedTemplates}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="seed-templates" className="text-[13px] font-medium">
                {t('setup.templates_label', { count: state.templates.catalog.length })}
              </Label>
              <span className="text-muted-foreground text-xs">
                {state.templates.count > 0
                  ? t('setup.templates_existing', { count: state.templates.count })
                  : t('setup.templates_hint')}
              </span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <Button variant="ghost" onClick={onDone} disabled={running}>
              {ready ? t('setup.enter') : t('setup.skip')}
              <ArrowRight />
            </Button>
            <Button size="lg" variant={ready ? 'outline' : 'default'} onClick={run} disabled={running || !state.local}>
              {running ? <Loader2 className="animate-spin" /> : <Play />}
              {running ? t('setup.installing') : ready ? t('setup.rerun') : t('setup.install')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
