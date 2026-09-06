import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Globe, Play, Square, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SelectField } from '@/components/select-field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Field } from '@/components/field'
import { StatusBadge } from '@/components/status-badge'
import { CodeBlock } from '@/components/code-block'
import { CopyButton, CopyRow } from '@/components/copy-button'
import { useAgent, reportError } from '@/hooks/use-agent'
import { useT, type MessageKey } from '@/i18n'
import { api, type TunnelInfo } from '@/lib/api'
import { cn } from '@/lib/utils'

const PROVIDERS: { value: string; labelKey?: MessageKey; label?: string }[] = [
  { value: 'none', labelKey: 'tunnel.provider_none' },
  { value: 'cloudflare', label: 'Cloudflare Tunnel' },
  { value: 'ngrok', label: 'ngrok' },
]

function ClearSecretButton({ onClear }: { onClear: () => void }) {
  const t = useT()
  return (
    <button type="button" className="text-muted-foreground hover:text-foreground text-xs underline" onClick={onClear}>
      {t('tunnel.token_clear')}
    </button>
  )
}

export function TunnelTab() {
  const t = useT()
  const { tunnel, setTunnel, config } = useAgent()
  const [info, setInfo] = useState<TunnelInfo | null>(null)
  const [form, setForm] = useState({
    provider: 'none',
    autoStart: false,
    cloudflareBin: 'cloudflared',
    cloudflareToken: '',
    cloudflareHostname: '',
    ngrokBin: 'ngrok',
    ngrokAuthtoken: '',
    ngrokDomain: '',
    ngrokRegion: '',
  })
  const [busy, setBusy] = useState(false)
  const [clearSecret, setClearSecret] = useState(false)
  const savedToken = info?.config.cloudflare.token === '***' && !clearSecret
  const savedAuthtoken = info?.config.ngrok.authtoken === '***' && !clearSecret

  const load = async () => {
    try {
      const result = await api.tunnel()
      setInfo(result)
      setTunnel(result.status)
      setForm({
        provider: result.config.provider ?? 'none',
        autoStart: Boolean(result.config.autoStart),
        cloudflareBin: result.config.cloudflare.binPath ?? 'cloudflared',
        cloudflareToken: result.config.cloudflare.token === '***' ? '' : (result.config.cloudflare.token ?? ''),
        cloudflareHostname: result.config.cloudflare.hostname ?? '',
        ngrokBin: result.config.ngrok.binPath ?? 'ngrok',
        ngrokAuthtoken: result.config.ngrok.authtoken === '***' ? '' : (result.config.ngrok.authtoken ?? ''),
        ngrokDomain: result.config.ngrok.domain ?? '',
        ngrokRegion: result.config.ngrok.region ?? '',
      })
    } catch (error) {
      reportError(error)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = async () => {
    await api.saveSettings({
      tunnel: {
        provider: form.provider,
        autoStart: form.autoStart,
        cloudflare: {
          binPath: form.cloudflareBin,
          token: form.cloudflareToken || (savedToken ? '***' : null),
          hostname: form.cloudflareHostname || null,
        },
        ngrok: {
          binPath: form.ngrokBin,
          authtoken: form.ngrokAuthtoken || (savedAuthtoken ? '***' : null),
          domain: form.ngrokDomain || null,
          region: form.ngrokRegion || null,
        },
      },
    })
    setClearSecret(false)
  }

  const save = async () => {
    setBusy(true)
    try {
      await persist()
      toast.success(t('tunnel.saved'))
      await load()
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  const control = async (kind: 'start' | 'stop') => {
    setBusy(true)
    try {
      // Bật tunnel luôn dùng đúng những gì đang nhập trên form, tránh chạy nhầm cấu hình cũ.
      if (kind === 'start') await persist()
      const status = kind === 'start' ? await api.startTunnel(form.provider) : await api.stopTunnel()
      setTunnel(status)
      toast.success(kind === 'start' ? t('tunnel.starting') : t('tunnel.stopped'))
      await load()
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  const dirty = info
    ? form.provider !== (info.config.provider ?? 'none') ||
      form.autoStart !== Boolean(info.config.autoStart) ||
      form.cloudflareBin !== (info.config.cloudflare.binPath ?? 'cloudflared') ||
      form.cloudflareHostname !== (info.config.cloudflare.hostname ?? '') ||
      form.ngrokBin !== (info.config.ngrok.binPath ?? 'ngrok') ||
      form.ngrokDomain !== (info.config.ngrok.domain ?? '') ||
      form.ngrokRegion !== (info.config.ngrok.region ?? '') ||
      form.cloudflareToken !== '' ||
      form.ngrokAuthtoken !== '' ||
      clearSecret
    : false

  const protection = config
    ? !config.auth.enabled
      ? { safe: false, text: t('tunnel.protection_auth_off') }
      : config.auth.apiKeys.length === 0
        ? { safe: false, text: t('tunnel.protection_no_key') }
        : { safe: true, text: t('tunnel.protection_ok', { count: config.auth.apiKeys.length }) }
    : null

  const status = tunnel ?? info?.status ?? null
  const providerLabel = (value: string) => {
    const item = PROVIDERS.find((entry) => entry.value === value)
    return item ? (item.label ?? t(item.labelKey!)) : value
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('tunnel.title')}</CardTitle>
            <CardDescription>{t('tunnel.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('tunnel.provider')}>
                <SelectField
                  value={form.provider}
                  onChange={(value) => setForm((prev) => ({ ...prev, provider: value }))}
                  options={PROVIDERS.map((item) => ({ value: item.value, label: item.label ?? t(item.labelKey!) }))}
                />
              </Field>
              <Field label={t('tunnel.autostart')}>
                <div className="flex h-9 items-center">
                  <Switch
                    checked={form.autoStart}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, autoStart: checked }))}
                  />
                </div>
              </Field>
            </div>

            {form.provider === 'cloudflare' ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t('tunnel.cloudflare_bin')}>
                  <Input
                    value={form.cloudflareBin}
                    onChange={(event) => setForm((prev) => ({ ...prev, cloudflareBin: event.target.value }))}
                  />
                </Field>
                <Field
                  label={t('tunnel.cloudflare_token')}
                  hint={savedToken ? t('tunnel.token_saved') : t('tunnel.cloudflare_token_hint')}
                  action={savedToken ? <ClearSecretButton onClear={() => setClearSecret(true)} /> : null}
                >
                  <Input
                    type="password"
                    placeholder={savedToken ? '••••••••' : undefined}
                    value={form.cloudflareToken}
                    onChange={(event) => setForm((prev) => ({ ...prev, cloudflareToken: event.target.value }))}
                  />
                </Field>
                <Field
                  label={t('tunnel.cloudflare_hostname')}
                  hint={
                    form.cloudflareHostname && !form.cloudflareToken && !savedToken
                      ? t('tunnel.hostname_needs_token')
                      : undefined
                  }
                >
                  <Input
                    value={form.cloudflareHostname}
                    placeholder="print.example.com"
                    onChange={(event) => setForm((prev) => ({ ...prev, cloudflareHostname: event.target.value }))}
                  />
                </Field>
              </div>
            ) : null}

            {form.provider === 'ngrok' ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t('tunnel.ngrok_bin')}>
                  <Input
                    value={form.ngrokBin}
                    onChange={(event) => setForm((prev) => ({ ...prev, ngrokBin: event.target.value }))}
                  />
                </Field>
                <Field
                  label={t('tunnel.ngrok_authtoken')}
                  hint={savedAuthtoken ? t('tunnel.token_saved') : undefined}
                  action={savedAuthtoken ? <ClearSecretButton onClear={() => setClearSecret(true)} /> : null}
                >
                  <Input
                    type="password"
                    placeholder={savedAuthtoken ? '••••••••' : undefined}
                    value={form.ngrokAuthtoken}
                    onChange={(event) => setForm((prev) => ({ ...prev, ngrokAuthtoken: event.target.value }))}
                  />
                </Field>
                <Field label={t('tunnel.ngrok_domain')}>
                  <Input
                    value={form.ngrokDomain}
                    onChange={(event) => setForm((prev) => ({ ...prev, ngrokDomain: event.target.value }))}
                  />
                </Field>
                <Field label={t('tunnel.ngrok_region')}>
                  <Input
                    value={form.ngrokRegion}
                    placeholder="ap"
                    onChange={(event) => setForm((prev) => ({ ...prev, ngrokRegion: event.target.value }))}
                  />
                </Field>
              </div>
            ) : null}

            {protection ? (
              <div
                className={cn(
                  'rounded-lg border p-2.5 text-xs',
                  protection.safe
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                    : 'border-destructive/40 bg-destructive/5 text-destructive',
                )}
              >
                {protection.text}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={busy}>
                {t('tunnel.save')}
              </Button>
              <Button variant="outline" onClick={() => void control('start')} disabled={busy || form.provider === 'none'}>
                <Play /> {t('tunnel.start')}
              </Button>
              <Button variant="outline" onClick={() => void control('stop')} disabled={busy}>
                <Square /> {t('tunnel.stop')}
              </Button>
              {dirty ? (
                <span className="flex items-center text-xs text-amber-600 dark:text-amber-400">
                  {t('common.unsaved')}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('tunnel.logs')}</CardTitle>
            <CopyButton value={(status?.logs ?? []).join('\n')} label={t('tunnel.copy_logs')} />
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[220px] rounded-lg border bg-muted/40 p-3">
              <pre className="font-mono text-xs whitespace-pre-wrap">
                {(status?.logs ?? []).join('\n') || t('tunnel.logs_empty')}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="size-4" /> {t('overview.col.status')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('overview.col.status')}</span>
              <StatusBadge status={status?.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Provider</span>
              <span>{providerLabel(status?.provider ?? 'none')}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">PID</span>
              {status?.pid ? (
                <CopyRow value={String(status.pid)} label={t('tunnel.copy_pid')} className="max-w-32 justify-end" />
              ) : (
                <span className="font-mono text-xs">-</span>
              )}
            </div>
            {status?.error ? (
              <div className="text-destructive flex items-start gap-1 text-xs">
                <span className="min-w-0 flex-1">{status.error}</span>
                <CopyButton value={status.error} label={t('jobs.copy_error')} className="size-6 shrink-0" />
              </div>
            ) : null}
            {status?.warning ? (
              <div className="flex items-start gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                <span className="min-w-0 flex-1">{status.warning}</span>
                <CopyButton value={status.warning} label={t('tunnel.copy_warning')} className="size-6 shrink-0" />
              </div>
            ) : null}
            {status?.url ? (
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">{t('tunnel.public_url')}</span>
                <CodeBlock code={status.url} />
                <a
                  href={`${status.url}/api/health`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline"
                >
                  {t('tunnel.open_health')}
                </a>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('tunnel.binaries')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(info?.binaries ?? {}).map(([name, item]) => (
              <div key={name} className="space-y-1 rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {item.installed ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : (
                    <XCircle className="size-4 text-muted-foreground" />
                  )}
                  {name}
                  {item.version ? <span className="text-xs text-muted-foreground">{item.version}</span> : null}
                </div>
                {item.installed ? (
                  <div className="text-muted-foreground flex items-center gap-1">
                    <p className="min-w-0 flex-1 truncate font-mono text-xs">{item.path}</p>
                    <CopyButton value={item.path ?? ''} label={t('tunnel.copy_path')} className="size-6 shrink-0" />
                  </div>
                ) : (
                  <CodeBlock code={item.install} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
