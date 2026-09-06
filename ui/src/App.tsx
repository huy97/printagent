import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  FileText,
  Globe,
  LayoutGrid,
  Layers,
  Printer,
  RefreshCw,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import { AgentProvider, useAgent } from '@/hooks/use-agent'
import { OverviewTab } from '@/components/tabs/overview-tab'
import { PrintersTab } from '@/components/tabs/printers-tab'
import { TemplatesTab } from '@/components/tabs/templates-tab'
import { JobsTab } from '@/components/tabs/jobs-tab'
import { TunnelTab } from '@/components/tabs/tunnel-tab'
import { ApiTab } from '@/components/tabs/api-tab'
import { SettingsTab } from '@/components/tabs/settings-tab'
import { SetupScreen } from '@/components/setup-screen'
import { LocaleSwitch } from '@/components/locale-switch'
import { I18nProvider, useI18n, useT, type MessageKey } from '@/i18n'
import { api, type SetupState } from '@/lib/api'
import { formatUptime } from '@/lib/format'
import { cn } from '@/lib/utils'

const TABS = [
  { value: 'overview', labelKey: 'nav.overview', icon: LayoutGrid, element: <OverviewTab /> },
  { value: 'printers', labelKey: 'nav.printers', icon: Printer, element: <PrintersTab /> },
  { value: 'templates', labelKey: 'nav.templates', icon: FileText, element: <TemplatesTab /> },
  { value: 'jobs', labelKey: 'nav.jobs', icon: Layers, element: <JobsTab /> },
  { value: 'tunnel', labelKey: 'nav.tunnel', icon: Globe, element: <TunnelTab /> },
  { value: 'api', labelKey: 'nav.api', icon: ArrowLeftRight, element: <ApiTab /> },
  { value: 'settings', labelKey: 'nav.settings', icon: Settings, element: <SettingsTab /> },
] satisfies { value: string; labelKey: MessageKey; icon: typeof LayoutGrid; element: ReactNode }[]

function KeyDialog() {
  const t = useT()
  const { needsKey, saveApiKey } = useAgent()
  const [value, setValue] = useState('')

  return (
    <Dialog open={needsKey}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('key_dialog.title')}</DialogTitle>
          <DialogDescription>{t('key_dialog.description')}</DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          placeholder="pa_..."
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value.trim()) saveApiKey(value)
          }}
        />
        <DialogFooter>
          <Button onClick={() => saveApiKey(value)} disabled={!value.trim()}>
            {t('key_dialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NavItem({
  active,
  label,
  icon: Icon,
  badge,
  onSelect,
}: {
  active: boolean
  label: string
  icon: typeof LayoutGrid
  badge?: number
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors',
        active
          ? 'bg-accent text-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      {active ? <span className="bg-brand absolute inset-y-1.5 left-0 w-0.5 rounded-full" /> : null}
      <Icon className={cn('size-4.5 shrink-0', active && 'text-brand')} />
      <span className="truncate">{label}</span>
      {badge ? (
        <span
          className={cn(
            'ml-auto inline-flex h-4.5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px]',
            active ? 'bg-brand/15 text-brand' : 'bg-muted text-muted-foreground',
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  )
}

function Shell() {
  const { t } = useI18n()
  const { health, config, printers, stats, wsConnected, wsReason, loading, refreshAll } = useAgent()
  const [active, setActive] = useState('overview')
  const current = TABS.find((tab) => tab.value === active) ?? TABS[0]
  const pending = (stats?.queued ?? 0) + (stats?.running ?? 0)
  const counts: Record<string, number | undefined> = {
    printers: printers.length || undefined,
    jobs: pending || undefined,
  }
  const reasonText = wsReason === 'auth_required' ? t('ws.auth_required') : wsReason
  const defaultPrinter = config?.printing.defaultPrinter
  const defaultMissing = Boolean(defaultPrinter) && !loading && !printers.some((printer) => printer.name === defaultPrinter)

  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <aside className="bg-card hidden w-59 shrink-0 flex-col overflow-y-auto border-r p-3.5 lg:flex">
        <div className="flex items-center gap-2.5 px-1.5 pt-1 pb-4">
          <div className="bg-foreground text-background flex size-8 items-center justify-center rounded-lg">
            <Printer className="size-4.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm leading-tight font-semibold">{health?.agent?.name ?? 'PrintAgent'}</div>
            <div className="text-muted-foreground font-mono text-[11px]">v{health?.version ?? '1.0.0'}</div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 pb-4">
          {TABS.map((tab) => (
            <NavItem
              key={tab.value}
              active={tab.value === active}
              label={t(tab.labelKey)}
              icon={tab.icon}
              badge={counts[tab.value]}
              onSelect={() => setActive(tab.value)}
            />
          ))}
        </nav>

        <div className="bg-card mt-auto flex flex-col gap-2.5 rounded-[10px] border p-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'size-1.75 rounded-full',
                wsConnected ? 'bg-ok ring-ok/20 ring-3' : 'bg-muted-foreground',
              )}
            />
            <span className="text-xs font-medium">{wsConnected ? t('header.agent_running') : t('header.disconnected')}</span>
          </div>
          <dl className="text-muted-foreground flex flex-col gap-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt>{t('header.uptime')}</dt>
              <dd className="text-foreground/80 font-mono">{formatUptime(health?.uptimeSeconds)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t('header.driver')}</dt>
              <dd className="text-foreground/80 truncate font-mono">{health?.printerDriver ?? '-'}</dd>
            </div>
          </dl>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="bg-card z-10 shrink-0 border-b">
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
            <div className="min-w-0">
              <h1 className="text-[15px] leading-tight font-semibold tracking-tight">{t(current.labelKey)}</h1>
              <p className="text-muted-foreground truncate text-xs">
                {health?.platform ?? ''}
                {health?.node ? ` · Node ${health.node}` : ''}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <span
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
                  wsConnected ? 'bg-ok/10 text-ok' : 'bg-muted text-muted-foreground',
                )}
                title={reasonText ?? (wsConnected ? t('ws.connected') : t('ws.disconnected'))}
              >
                {wsConnected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
                {wsConnected ? t('header.realtime') : (reasonText ?? t('header.disconnected'))}
              </span>
              <Button variant="outline" size="sm" disabled={loading} onClick={() => void refreshAll()}>
                <RefreshCw className={loading ? 'animate-spin' : ''} /> {t('header.refresh')}
              </Button>
              <LocaleSwitch />
              {defaultPrinter ? (
                <span
                  className={cn(
                    'bg-card hidden h-8 items-center gap-2 rounded-full border py-0 pr-3 pl-1 text-xs xl:flex',
                    defaultMissing && 'border-warn/40',
                  )}
                  title={
                    defaultMissing
                      ? t('header.default_printer_missing', { printer: defaultPrinter })
                      : t('header.default_printer')
                  }
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full',
                      defaultMissing ? 'bg-warn/15 text-warn' : 'bg-brand text-brand-foreground',
                    )}
                  >
                    <Printer className="size-3" />
                  </span>
                  <span className={cn('max-w-44 truncate', defaultMissing ? 'text-warn' : 'text-foreground/80')}>
                    {defaultPrinter}
                    {defaultMissing ? t('header.default_printer_offline') : ''}
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 sm:px-6 lg:hidden">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActive(tab.value)}
                className={cn(
                  'h-8 shrink-0 rounded-full px-3 text-sm transition-colors',
                  tab.value === active
                    ? 'bg-brand text-brand-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </nav>
        </header>

        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6">{current.element}</main>
      </div>

      <KeyDialog />
      <Toaster position="top-right" richColors />
    </div>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <AppRoutes />
    </I18nProvider>
  )
}

function AppRoutes() {
  const { locale } = useI18n()
  const [setup, setSetup] = useState<SetupState | null>(null)
  const [checked, setChecked] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    api
      .setup()
      .then(setSetup)
      .catch(() => setSetup(null))
      .finally(() => setChecked(true))
  }, [locale])

  if (!checked) return null

  if (setup && !setup.complete && !dismissed) {
    return (
      <>
        <SetupScreen
          state={setup}
          onDone={() => {
            setDismissed(true)
            api.setup().then(setSetup).catch(() => {})
          }}
        />
        <Toaster position="top-right" richColors />
      </>
    )
  }

  return (
    <AgentProvider>
      <Shell />
    </AgentProvider>
  )
}
