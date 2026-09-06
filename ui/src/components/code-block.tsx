import { CopyButton } from '@/components/copy-button'

export function CodeBlock({ code, title }: { code: string; title?: string }) {
  return (
    <div className="relative">
      {title ? <div className="text-muted-foreground mb-1.5 text-xs font-medium">{title}</div> : null}
      <CopyButton value={code} className="absolute top-1.5 right-1.5 z-10" />
      <pre className="bg-muted/50 overflow-x-auto rounded-lg border p-3 pr-10 font-mono text-xs leading-relaxed">
        {code}
      </pre>
    </div>
  )
}
