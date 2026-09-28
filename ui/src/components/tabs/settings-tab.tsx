import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PlayCircle, Power, RefreshCw, Save, StopCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SelectField } from '@/components/select-field'
import { CopyButton } from '@/components/copy-button'
import { Field } from '@/components/field'
import { StatusBadge } from '@/components/status-badge'
import { useAgent, reportError } from '@/hooks/use-agent'
import { LOCALE_LABELS, LOCALES, useT } from '@/i18n'
import { api, runSetupUntilDone, type AgentConfig, type ServiceStatus } from '@/lib/api'

type Draft = AgentConfig | null

export function SettingsTab() {
  const t = useT()
  const { config, printers, refreshConfig, refreshAll } = useAgent()
  const [draft, setDraft] = useState<Draft>(config)
  const [busy, setBusy] = useState(false)
  const [service, setService] = useState<ServiceStatus | null>(null)
  const [serviceLocal, setServiceLocal] = useState(false)

  useEffect(() => {
    setDraft(config)
  }, [config])

  const loadService = useCallback(async () => {
    try {
      const state = await api.setup()
      setService(state.service)
      setServiceLocal(state.local)
    } catch (error) {
      reportError(error)
    }
  }, [])

  useEffect(() => {
    void loadService()
  }, [loadService])

  const rerunSetup = async () => {
    setBusy(true)
    try {
      // Setup and the service read the saved config, so save first to avoid running with stale values.
      if (dirty) await persist()
      const result = await runSetupUntilDone({ enableService: false })
      const warnings = result.steps.filter((step) => step.status === 'warn')
      if (!result.ok) toast.error(t('settings.setup_stopped', { step: result.failed?.title ?? '' }))
      else if (warnings.length > 0)
        toast.warning(
          t('settings.setup_warnings', {
            count: warnings.length,
            items: warnings.map((item) => item.title).join(', '),
          }),
        )
      else toast.success(t('settings.setup_ready'))
      await loadService()
      await refreshAll()
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  const toggleService = async (action: 'install' | 'uninstall') => {
    setBusy(true)
    try {
      if (action === 'install' && dirty) await persist()
      setService(await api.setupService(action))
      toast.success(action === 'install' ? t('settings.service_installed') : t('settings.service_removed'))
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(config)

  if (!draft) return <p className="text-sm text-muted-foreground">{t('settings.loading')}</p>

  const patch = <K extends keyof AgentConfig>(section: K, values: Partial<AgentConfig[K]>) =>
    setDraft((prev) => (prev ? { ...prev, [section]: { ...prev[section], ...values } } : prev))

  const persist = async () => {
    const result = await api.saveSettings({
      agent: { name: draft.agent.name, locale: draft.agent.locale },
      server: {
        host: draft.server.host,
        port: Number(draft.server.port),
        corsOrigins: draft.server.corsOrigins,
      },
      auth: {
        enabled: draft.auth.enabled,
        allowLocalhostWithoutKey: draft.auth.allowLocalhostWithoutKey,
      },
      printing: {
        defaultPrinter: draft.printing.defaultPrinter,
        copies: Number(draft.printing.copies),
        duplex: draft.printing.duplex,
        paperSize: draft.printing.paperSize,
        orientation: draft.printing.orientation,
        sumatraPath: draft.printing.sumatraPath || null,
        rawShareName: draft.printing.rawShareName || null,
        allowLocalFilePath: draft.printing.allowLocalFilePath,
        allowedFileRoots: draft.printing.allowedFileRoots,
        allowRemoteUrl: draft.printing.allowRemoteUrl,
        maxDownloadMb: Number(draft.printing.maxDownloadMb),
      },
      render: {
        chromePath: draft.render.chromePath || null,
        format: draft.render.format,
        marginTop: draft.render.marginTop,
        marginRight: draft.render.marginRight,
        marginBottom: draft.render.marginBottom,
        marginLeft: draft.render.marginLeft,
        printBackground: draft.render.printBackground,
      },
      queue: {
        concurrency: Number(draft.queue.concurrency),
        maxRetries: Number(draft.queue.maxRetries),
        keepJobs: Number(draft.queue.keepJobs),
        keepFilesHours: Number(draft.queue.keepFilesHours),
      },
      discovery: { autoRefreshSeconds: Number(draft.discovery.autoRefreshSeconds) },
    })
    if (result.rejectedFields?.length) {
      toast.warning(t('settings.rejected_fields', { fields: result.rejectedFields.join(', ') }))
    }
    await refreshConfig()
    await refreshAll()
    return result
  }

  const save = async () => {
    setBusy(true)
    try {
      const result = await persist()
      if (!result.rejectedFields?.length) toast.success(t('settings.saved'))
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.server_title')}</CardTitle>
          <CardDescription>{t('settings.server_description')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('settings.agent_name')}>
            <Input value={draft.agent.name} onChange={(event) => patch('agent', { name: event.target.value })} />
          </Field>
          <Field label={t('settings.agent_locale')} hint={t('settings.agent_locale_hint')}>
            <SelectField
              value={draft.agent.locale ?? 'vi'}
              onChange={(value) => patch('agent', { locale: value })}
              options={LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }))}
            />
          </Field>
          <Field label={t('settings.host')}>
            <Input value={draft.server.host} onChange={(event) => patch('server', { host: event.target.value })} />
          </Field>
          <Field label={t('settings.port')}>
            <Input
              type="number"
              value={draft.server.port}
              onChange={(event) => patch('server', { port: Number(event.target.value) || 7788 })}
            />
          </Field>
          <Field label={t('settings.cors')} hint={t('settings.cors_hint')}>
            <Input
              value={draft.server.corsOrigins.join(', ')}
              onChange={(event) =>
                patch('server', {
                  corsOrigins: event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.security')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('settings.require_key')}>
            <div className="flex h-9 items-center">
              <Switch
                checked={draft.auth.enabled}
                onCheckedChange={(checked) => patch('auth', { enabled: checked })}
              />
            </div>
          </Field>
          <Field label={t('settings.skip_key_localhost')}>
            <div className="flex h-9 items-center">
              <Switch
                checked={draft.auth.allowLocalhostWithoutKey}
                onCheckedChange={(checked) => patch('auth', { allowLocalhostWithoutKey: checked })}
              />
            </div>
          </Field>
          <Field label={t('settings.allow_url')}>
            <div className="flex h-9 items-center">
              <Switch
                checked={draft.printing.allowRemoteUrl}
                onCheckedChange={(checked) => patch('printing', { allowRemoteUrl: checked })}
              />
            </div>
          </Field>
          <Field label={t('settings.allow_local_path')} hint={t('settings.allow_local_path_hint')}>
            <div className="flex h-9 items-center">
              <Switch
                checked={draft.printing.allowLocalFilePath}
                onCheckedChange={(checked) => patch('printing', { allowLocalFilePath: checked })}
              />
            </div>
          </Field>
          <Field label={t('settings.allowed_roots')} className="sm:col-span-2 lg:col-span-3">
            <Input
              value={draft.printing.allowedFileRoots.join(', ')}
              placeholder="/Users/me/print-inbox"
              onChange={(event) =>
                patch('printing', {
                  allowedFileRoots: event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label={t('settings.max_download')}>
            <Input
              type="number"
              value={draft.printing.maxDownloadMb}
              onChange={(event) => patch('printing', { maxDownloadMb: Number(event.target.value) || 64 })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.printing')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('settings.default_printer')}>
            <SelectField
              value={draft.printing.defaultPrinter ?? '__none'}
              onChange={(value) => patch('printing', { defaultPrinter: value === '__none' ? null : value })}
              options={[
                { value: '__none', label: t('settings.printer_os') },
                ...printers.map((printer) => ({ value: printer.name, label: printer.name })),
              ]}
            />
          </Field>
          <Field label={t('settings.default_copies')}>
            <Input
              type="number"
              min={1}
              value={draft.printing.copies}
              onChange={(event) => patch('printing', { copies: Number(event.target.value) || 1 })}
            />
          </Field>
          <Field label={t('settings.duplex')}>
            <SelectField
              value={draft.printing.duplex}
              onChange={(value) => patch('printing', { duplex: value })}
              options={[
                { value: 'none', label: t('settings.duplex_none') },
                { value: 'long-edge', label: t('settings.duplex_long') },
                { value: 'short-edge', label: t('settings.duplex_short') },
              ]}
            />
          </Field>
          <Field label={t('templates.paper')}>
            <Input
              value={draft.printing.paperSize}
              onChange={(event) => patch('printing', { paperSize: event.target.value })}
            />
          </Field>
          <Field label={t('settings.orientation')}>
            <SelectField
              value={draft.printing.orientation}
              onChange={(value) => patch('printing', { orientation: value })}
              options={[
                { value: 'portrait', label: t('settings.portrait') },
                { value: 'landscape', label: t('settings.landscape') },
              ]}
            />
          </Field>
          <Field label={t('settings.sumatra')} className="lg:col-span-2" hint={t('settings.sumatra_hint')}>
            <Input
              value={draft.printing.sumatraPath ?? ''}
              onChange={(event) => patch('printing', { sumatraPath: event.target.value })}
            />
          </Field>
          <Field label={t('settings.raw_share')} hint={t('settings.raw_share_hint')}>
            <Input
              value={draft.printing.rawShareName ?? ''}
              onChange={(event) => patch('printing', { rawShareName: event.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.render_queue')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('settings.default_format')}>
            <Input value={draft.render.format} onChange={(event) => patch('render', { format: event.target.value })} />
          </Field>
          <Field label={t('settings.margin_top')}>
            <Input
              value={draft.render.marginTop}
              onChange={(event) => patch('render', { marginTop: event.target.value })}
            />
          </Field>
          <Field label={t('settings.margin_right')}>
            <Input
              value={draft.render.marginRight}
              onChange={(event) => patch('render', { marginRight: event.target.value })}
            />
          </Field>
          <Field label={t('settings.margin_bottom')}>
            <Input
              value={draft.render.marginBottom}
              onChange={(event) => patch('render', { marginBottom: event.target.value })}
            />
          </Field>
          <Field label={t('settings.margin_left')}>
            <Input
              value={draft.render.marginLeft}
              onChange={(event) => patch('render', { marginLeft: event.target.value })}
            />
          </Field>
          <Field label={t('settings.print_background')}>
            <div className="flex h-9 items-center">
              <Switch
                checked={draft.render.printBackground}
                onCheckedChange={(checked) => patch('render', { printBackground: checked })}
              />
            </div>
          </Field>
          <Field
            label={t('settings.chrome_path')}
            className="lg:col-span-2"
            action={
              draft.render.chromePath ? (
                <CopyButton value={draft.render.chromePath} label={t('settings.copy_chrome_path')} className="size-6" />
              ) : null
            }
          >
            <Input
              value={draft.render.chromePath ?? ''}
              placeholder={t('settings.chrome_placeholder')}
              onChange={(event) => patch('render', { chromePath: event.target.value })}
            />
          </Field>
          <Field label={t('settings.concurrency')}>
            <Input
              type="number"
              min={1}
              value={draft.queue.concurrency}
              onChange={(event) => patch('queue', { concurrency: Number(event.target.value) || 1 })}
            />
          </Field>
          <Field label={t('settings.max_retries')}>
            <Input
              type="number"
              min={0}
              value={draft.queue.maxRetries}
              onChange={(event) => patch('queue', { maxRetries: Number(event.target.value) || 0 })}
            />
          </Field>
          <Field label={t('settings.keep_jobs')}>
            <Input
              type="number"
              value={draft.queue.keepJobs}
              onChange={(event) => patch('queue', { keepJobs: Number(event.target.value) || 200 })}
            />
          </Field>
          <Field label={t('settings.keep_files')}>
            <Input
              type="number"
              value={draft.queue.keepFilesHours}
              onChange={(event) => patch('queue', { keepFilesHours: Number(event.target.value) || 24 })}
            />
          </Field>
          <Field label={t('settings.scan_interval')}>
            <Input
              type="number"
              value={draft.discovery.autoRefreshSeconds}
              onChange={(event) => patch('discovery', { autoRefreshSeconds: Number(event.target.value) || 60 })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="size-4" /> {t('settings.service_title')}
          </CardTitle>
          <CardDescription>
            {service?.supported === false
              ? t('settings.service_unsupported')
              : t('settings.service_description', { manager: service?.manager ?? t('settings.service_manager_default') })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <StatusBadge status={service?.installed ? (service.running ? 'running' : 'registered') : 'unregistered'} />
          {service?.unit ? (
            <span className="text-muted-foreground flex items-center gap-1 font-mono text-xs">
              <span className="min-w-0 truncate">{service.unit}</span>
              <CopyButton value={service.unit} label={t('settings.copy_service_id')} className="size-6 shrink-0" />
            </span>
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              disabled={busy || !serviceLocal}
              onClick={() => void rerunSetup()}
            >
              <RefreshCw /> {t('settings.rerun_setup')}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !serviceLocal || service?.supported === false || service?.installed}
              onClick={() => void toggleService('install')}
            >
              <PlayCircle /> {t('settings.service_install')}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || !serviceLocal || !service?.installed}
              onClick={() => void toggleService('uninstall')}
            >
              <StopCircle /> {t('settings.service_uninstall')}
            </Button>
          </div>
          {!serviceLocal ? (
            <p className="w-full text-xs text-amber-600 dark:text-amber-400">
              {t('settings.local_only')}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {dirty ? <span className="text-xs text-amber-600 dark:text-amber-400">{t('common.unsaved')}</span> : null}
        <Button onClick={save} disabled={busy}>
          <Save /> {t('tunnel.save')}
        </Button>
      </div>
    </div>
  )
}
