import { apiKeyStore, type ErrorPayload } from './api'

export type WsEvent =
  | { type: 'event'; event: string; payload: unknown; at: string }
  | { type: 'welcome'; payload: unknown }
  | { type: 'auth_required'; key: string; message: string }
  | { type: 'result'; id?: string; payload: unknown }
  | { type: 'error'; id?: string; payload: ErrorPayload }

interface WsHandlers {
  onEvent: (event: string, payload: unknown) => void
  onStatus: (connected: boolean, reason?: string) => void
}

const CHANNELS = ['job', 'printer', 'tunnel', 'log']

export function connectAgentSocket({ onEvent, onStatus }: WsHandlers) {
  let socket: WebSocket | null = null
  let retryTimer: number | undefined
  let closed = false

  const open = () => {
    if (closed) return
    const url = new URL('/ws', location.origin.replace(/^http/, 'ws'))
    socket = new WebSocket(url)

    socket.addEventListener('open', () => onStatus(true))

    socket.addEventListener('message', (raw) => {
      const message = JSON.parse(raw.data as string) as WsEvent
      if (message.type === 'auth_required') {
        const apiKey = apiKeyStore.get()
        if (apiKey) socket?.send(JSON.stringify({ id: 'auth', type: 'auth', payload: { apiKey } }))
        else {
          onStatus(false, 'auth_required')
          socket?.close()
        }
        return
      }
      if (message.type === 'welcome' || (message.type === 'result' && message.id === 'auth')) {
        socket?.send(JSON.stringify({ type: 'subscribe', payload: { events: CHANNELS } }))
        onStatus(true)
        return
      }
      if (message.type === 'event') onEvent(message.event, message.payload)
    })

    socket.addEventListener('close', () => {
      onStatus(false)
      if (closed) return
      retryTimer = window.setTimeout(open, 3000)
    })

    socket.addEventListener('error', () => socket?.close())
  }

  open()

  return () => {
    closed = true
    window.clearTimeout(retryTimer)
    socket?.close()
  }
}
