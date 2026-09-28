import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import {
  api,
  ApiError,
  apiKeyStore,
  type AgentConfig,
  type Health,
  type Job,
  type LogEntry,
  type Printer,
  type QueueStats,
  type Template,
  type TunnelStatus,
} from '@/lib/api'
import { connectAgentSocket } from '@/lib/ws'
import { getLocale, translate } from '@/i18n/locale'

interface AgentState {
  health: Health | null
  config: AgentConfig | null
  printers: Printer[]
  templates: Template[]
  jobs: Job[]
  stats: QueueStats | null
  logs: LogEntry[]
  tunnel: TunnelStatus | null
  wsConnected: boolean
  wsReason?: string
  needsKey: boolean
  loading: boolean
  refreshAll: () => Promise<void>
  refreshPrinters: (force?: boolean) => Promise<void>
  refreshTemplates: () => Promise<void>
  refreshJobs: (status?: string) => Promise<void>
  refreshConfig: () => Promise<void>
  setTunnel: (status: TunnelStatus) => void
  saveApiKey: (key: string) => void
}

const AgentContext = createContext<AgentState | null>(null)

export function reportError(error: unknown, fallback?: string) {
  const message = error instanceof Error ? error.message : (fallback ?? translate(getLocale(), 'common.error'))
  toast.error(message)
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [printers, setPrinters] = useState<Printer[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [tunnel, setTunnel] = useState<TunnelStatus | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [wsReason, setWsReason] = useState<string>()
  const [needsKey, setNeedsKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const jobFilter = useRef<string | undefined>(undefined)

  const refreshPrinters = useCallback(async (force = false) => {
    const result = await api.printers(force)
    setPrinters(result.printers)
  }, [])

  const refreshTemplates = useCallback(async () => {
    const result = await api.templates()
    setTemplates(result.templates)
  }, [])

  const refreshJobs = useCallback(async (status?: string) => {
    jobFilter.current = status
    const result = await api.jobs({ limit: 60, status })
    setJobs(result.jobs)
    setStats(result.stats)
  }, [])

  const refreshConfig = useCallback(async () => {
    setConfig(await api.settings())
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    try {
      setHealth(await api.health())
      await Promise.all([
        refreshConfig(),
        refreshPrinters(),
        refreshTemplates(),
        refreshJobs(jobFilter.current),
        api.logs().then((result) => setLogs(result.logs)),
        api.tunnel().then((result) => setTunnel(result.status)),
      ])
      setNeedsKey(false)
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        // A stored key that still gets rejected must be reported, otherwise the dialog just flickers and reappears.
        if (apiKeyStore.get()) toast.error(translate(getLocale(), 'agent.key_rejected'))
        setNeedsKey(true)
      }
      else reportError(error, translate(getLocale(), 'agent.connect_failed'))
    } finally {
      setLoading(false)
    }
  }, [refreshConfig, refreshJobs, refreshPrinters, refreshTemplates])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  useEffect(() => {
    const disconnect = connectAgentSocket({
      onStatus: (connected, reason) => {
        setWsConnected(connected)
        setWsReason(reason)
        if (reason === 'auth_required') setNeedsKey(true)
      },
      onEvent: (event, payload) => {
        if (event === 'log') {
          setLogs((current) => [...current.slice(-250), payload as LogEntry])
          return
        }
        if (event.startsWith('job.')) {
          const job = payload as Job
          setJobs((current) => {
            const index = current.findIndex((item) => item.id === job.id)
            if (index >= 0) {
              const next = [...current]
              next[index] = job
              return next
            }
            return [job, ...current].slice(0, 60)
          })
          return
        }
        if (event === 'printer.changed') {
          setPrinters((payload as { printers: Printer[] }).printers ?? [])
          return
        }
        if (event === 'tunnel.changed') setTunnel(payload as TunnelStatus)
      },
    })
    return disconnect
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      api
        .health()
        .then(setHealth)
        .catch(() => {})
    }, 15000)
    return () => window.clearInterval(timer)
  }, [])

  const saveApiKey = useCallback(
    (key: string) => {
      apiKeyStore.set(key.trim())
      setNeedsKey(false)
      void refreshAll()
    },
    [refreshAll],
  )

  const value = useMemo<AgentState>(
    () => ({
      health,
      config,
      printers,
      templates,
      jobs,
      stats,
      logs,
      tunnel,
      wsConnected,
      wsReason,
      needsKey,
      loading,
      refreshAll,
      refreshPrinters,
      refreshTemplates,
      refreshJobs,
      refreshConfig,
      setTunnel,
      saveApiKey,
    }),
    [
      health,
      config,
      printers,
      templates,
      jobs,
      stats,
      logs,
      tunnel,
      wsConnected,
      wsReason,
      needsKey,
      loading,
      refreshAll,
      refreshPrinters,
      refreshTemplates,
      refreshJobs,
      refreshConfig,
      saveApiKey,
    ],
  )

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

export function useAgent() {
  const context = useContext(AgentContext)
  if (!context) throw new Error('useAgent must be used within AgentProvider')
  return context
}
