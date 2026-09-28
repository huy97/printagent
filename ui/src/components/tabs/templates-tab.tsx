import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, FileText, Plus, Printer, RefreshCw, Save, Sparkles, TriangleAlert, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CopyButton } from '@/components/copy-button'
import { SelectField } from '@/components/select-field'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Field } from '@/components/field'
import { useConfirm } from '@/components/confirm-dialog'
import { useAgent, reportError } from '@/hooks/use-agent'
import { useI18n, useT, type Translate } from '@/i18n'
import { api, type RenderLayout, type Template } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'

function newTemplate(t: Translate): Template {
  return {
    id: '',
    name: t('templates.new_name'),
    description: '',
    engine: 'html',
    page: {
      format: 'A4',
      marginTop: '10mm',
      marginRight: '10mm',
      marginBottom: '10mm',
      marginLeft: '10mm',
    },
    printing: { printer: null, copies: 1, raw: false },
    sampleData: { code: 'HD001', total: 100000 },
    content: t('templates.new_content'),
  }
}

export function TemplatesTab() {
  const t = useT()
  const blank = newTemplate(t)
  const { templates, refreshTemplates, refreshJobs, printers } = useAgent()
  const { locale } = useI18n()
  const { confirm, dialog } = useConfirm()
  const [current, setCurrent] = useState<Template>(blank)
  const [saved, setSaved] = useState<Template | null>(null)
  const [savedSample, setSavedSample] = useState('{}')
  const [sampleText, setSampleText] = useState('{}')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [layout, setLayout] = useState<RenderLayout | null>(null)
  const [busy, setBusy] = useState(false)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    if (!current.id && templates.length > 0) void select(templates[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.length])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const select = async (id: string) => {
    try {
      const template = await api.template(id)
      const sample = JSON.stringify(template.sampleData ?? {}, null, 2)
      setCurrent(template)
      setSaved(template)
      setSavedSample(sample)
      setSampleText(sample)
      setPreviewUrl(null)
      setPreviewText(null)
      setPreviewError(null)
      setLayout(null)
      void renderPreview(template, template.sampleData ?? {})
    } catch (error) {
      reportError(error)
    }
  }

  const renderPreview = async (template: Template, data: Record<string, unknown>) => {
    setPreviewing(true)
    try {
      const { blob, layout: rendered } = await api.renderPreview({
        template: template.content,
        engine: template.engine,
        data,
        page: template.page,
      })
      // Text receipts render directly in <pre>: a text/plain blob in an iframe does not work in every browser.
      setPreviewText(template.engine === 'text' ? await blob.text() : null)
      setPreviewUrl(URL.createObjectURL(blob))
      setLayout(rendered)
      setPreviewError(null)
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setPreviewing(false)
    }
  }

  const patch = (values: Partial<Template>) => setCurrent((prev) => ({ ...prev, ...values }))
  const patchPage = (values: Partial<Template['page']>) =>
    setCurrent((prev) => ({ ...prev, page: { ...prev.page, ...values } }))
  const patchPrinting = (values: Partial<Template['printing']>) =>
    setCurrent((prev) => ({ ...prev, printing: { ...prev.printing, ...values } }))

  const payload = () => {
    let sampleData: Record<string, unknown>
    try {
      sampleData = JSON.parse(sampleText || '{}')
    } catch {
      throw new Error(t('templates.sample_invalid'))
    }
    return { ...current, sampleData }
  }

  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    withBusy(async () => {
      const body = payload()
      const result = current.id ? await api.updateTemplate(current.id, body) : await api.createTemplate(body)
      const sample = JSON.stringify(result.sampleData ?? {}, null, 2)
      setCurrent(result)
      setSaved(result)
      setSavedSample(sample)
      setSampleText(sample)
      await refreshTemplates()
      toast.success(t('templates.saved', { id: result.id }))
    })

  const preview = () =>
    withBusy(async () => {
      const body = payload()
      await renderPreview(body, body.sampleData)
    })

  const print = () =>
    withBusy(async () => {
      const body = payload()
      const useDraft = !current.id || dirty
      if (useDraft && current.id) toast.info(t('templates.printing_draft'))
      const job = await api.printTemplate({
        templateId: useDraft ? undefined : current.id,
        template: useDraft ? body.content : undefined,
        engine: body.engine,
        data: body.sampleData,
        page: body.page,
        printer: body.printing.printer || undefined,
        copies: body.printing.copies ?? 1,
        options: { raw: Boolean(body.printing.raw) },
        wait: true,
      })
      if (job.status === 'completed') toast.success(t('templates.printed', { id: job.id }))
      else toast.error(`Job ${job.id}: ${job.status} ${job.error ?? ''}`)
      await refreshJobs()
    })

  const remove = () => {
    if (!current.id) return
    confirm({
      title: t('templates.delete_title', { name: current.name }),
      description: t('templates.delete_description'),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: () =>
        withBusy(async () => {
          await api.deleteTemplate(current.id)
          await refreshTemplates()
          resetToBlank()
          toast.success(t('templates.deleted'))
        }),
    })
  }

  const resetToBlank = () => {
    const fresh = newTemplate(t)
    setCurrent(fresh)
    setSaved(null)
    setSavedSample(JSON.stringify(fresh.sampleData, null, 2))
    setSampleText(JSON.stringify(fresh.sampleData, null, 2))
  }

  const dirty = saved
    ? JSON.stringify({ ...current, sampleData: null, updatedAt: null }) !==
        JSON.stringify({ ...saved, sampleData: null, updatedAt: null }) || sampleText !== savedSample
    : current.content !== blank.content || current.name !== blank.name || sampleText !== savedSample

  /** Confirm before leaving a template with unsaved edits. */
  const leaveDraft = (action: () => void) => {
    if (!dirty) {
      action()
      return
    }
    confirm({
      title: t('common.discard_title'),
      description: t('common.discard_description'),
      confirmLabel: t('common.discard_confirm'),
      destructive: true,
      onConfirm: action,
    })
  }

  const seed = async () => {
    setSeeding(true)
    try {
      const result = await api.seedTemplates(locale)
      await refreshTemplates()
      if (result.created > 0) toast.success(t('templates.seed_done', { count: result.created }))
      else toast.info(t('templates.seed_none'))
    } catch (error) {
      reportError(error)
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)] 3xl:min-h-0 3xl:flex-1 3xl:grid-cols-[300px_minmax(0,1fr)_minmax(400px,520px)]">
      {dialog}
      <Card className="h-fit 3xl:h-auto 3xl:min-h-0">
        <CardHeader>
          <CardTitle>{t('nav.templates')}</CardTitle>
          <CardAction className="flex gap-2">
            {templates.length > 0 ? (
              <Button size="sm" variant="ghost" disabled={seeding} onClick={() => void seed()} title={t('templates.seed_hint')}>
                <Sparkles /> {t('templates.seed_short')}
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => leaveDraft(resetToBlank)}
            >
              <Plus /> {t('templates.new')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="3xl:min-h-0 3xl:flex-1">
          <ScrollArea className="h-[420px] pr-3 3xl:h-full">
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => leaveDraft(() => void select(template.id))}
                  className={cn(
                    'hover:border-brand/50 w-full rounded-lg border p-3 text-left transition',
                    current.id === template.id ? 'border-brand/70 bg-accent' : 'border-border',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    {template.name}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{template.id}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {template.engine}
                    </Badge>
                  </div>
                </button>
              ))}
              {templates.length === 0 ? (
                <div className="flex flex-col items-start gap-3 py-2">
                  <p className="text-sm text-muted-foreground">{t('templates.empty')}</p>
                  <Button size="sm" variant="outline" disabled={seeding} onClick={() => void seed()}>
                    <Sparkles /> {t('templates.seed')}
                  </Button>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="3xl:min-h-0 3xl:overflow-y-auto">
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 3xl:grid-cols-2">
            <Field label={t('printers.col.name')} className="sm:col-span-2">
              <Input value={current.name} onChange={(event) => patch({ name: event.target.value })} />
            </Field>
            <Field label={t('templates.engine')}>
              <SelectField
                value={current.engine}
                onChange={(value) => patch({ engine: value as 'html' | 'text' })}
                options={[
                  { value: 'html', label: t('templates.engine_html') },
                  { value: 'text', label: t('templates.engine_text') },
                ]}
              />
            </Field>
            <Field label={t('templates.raw')}>
              <SelectField
                value={String(Boolean(current.printing.raw))}
                onChange={(value) => patchPrinting({ raw: value === 'true' })}
                options={[
                  { value: 'false', label: t('templates.no') },
                  { value: 'true', label: t('templates.yes') },
                ]}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 3xl:grid-cols-2">
            <Field label={t('printers.col.description')} className="sm:col-span-2">
              <Input
                value={current.description ?? ''}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </Field>
            <Field label={t('templates.printer')}>
              <SelectField
                value={current.printing.printer ?? '__default'}
                onChange={(value) => patchPrinting({ printer: value === '__default' ? null : value })}
                options={[
                  { value: '__default', label: t('templates.printer_default') },
                  ...printers.map((printer) => ({ value: printer.name, label: printer.name })),
                ]}
              />
            </Field>
            <Field label={t('jobs.copies')}>
              <Input
                type="number"
                min={1}
                value={current.printing.copies ?? 1}
                onChange={(event) => patchPrinting({ copies: Number(event.target.value) || 1 })}
              />
            </Field>
          </div>

          <div
            className={cn(
              'grid gap-3 sm:grid-cols-2 lg:grid-cols-4 3xl:grid-cols-2',
              current.engine === 'text' && 'hidden',
            )}
          >
            <Field label={t('templates.paper')}>
              <Input
                value={current.page.format ?? ''}
                placeholder="A4"
                onChange={(event) => patchPage({ format: event.target.value })}
              />
            </Field>
            <Field label={t('templates.custom_width')}>
              <Input
                value={current.page.width ?? ''}
                placeholder="80mm"
                onChange={(event) => patchPage({ width: event.target.value || null })}
              />
            </Field>
            <Field label={t('templates.custom_height')}>
              <Input
                value={current.page.height ?? ''}
                placeholder={t('templates.height_placeholder')}
                onChange={(event) => patchPage({ height: event.target.value || null })}
              />
            </Field>
            <Field label={t('templates.margins')}>
              <div className="flex gap-1.5">
                <Input
                  value={current.page.marginTop ?? ''}
                  onChange={(event) => patchPage({ marginTop: event.target.value })}
                />
                <Input
                  value={current.page.marginRight ?? ''}
                  onChange={(event) => patchPage({ marginRight: event.target.value })}
                />
                <Input
                  value={current.page.marginBottom ?? ''}
                  onChange={(event) => patchPage({ marginBottom: event.target.value })}
                />
                <Input
                  value={current.page.marginLeft ?? ''}
                  onChange={(event) => patchPage({ marginLeft: event.target.value })}
                />
              </div>
            </Field>
          </div>

          <Field
            label={t('templates.content')}
            action={<CopyButton value={current.content ?? ''} label={t('templates.copy_content')} />}
          >
            <Textarea
              value={current.content ?? ''}
              onChange={(event) => patch({ content: event.target.value })}
              spellCheck={false}
              className="min-h-[280px] font-mono text-xs"
            />
          </Field>

          <Field label={t('templates.sample')} action={<CopyButton value={sampleText} label={t('templates.copy_sample')} />}>
            <Textarea
              value={sampleText}
              onChange={(event) => setSampleText(event.target.value)}
              spellCheck={false}
              className="min-h-[140px] font-mono text-xs"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} disabled={busy}>
              <Save /> {t('common.save')}
            </Button>
            <Button variant="outline" onClick={print} disabled={busy}>
              <Printer /> {t('printers.test_print')}
            </Button>
            {current.id ? (
              <Button variant="ghost" className="text-destructive" onClick={remove} disabled={busy}>
                <Trash2 /> {t('common.delete')}
              </Button>
            ) : null}
            {dirty ? <span className="text-xs text-amber-600 dark:text-amber-400">{t('common.unsaved')}</span> : null}
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              {current.id
                ? t('templates.meta', { id: current.id, time: formatTime(current.updatedAt) })
                : t('templates.unsaved')}
              {current.id ? <CopyButton value={current.id} label={t('templates.copy_id')} className="size-6" /> : null}
            </span>
          </div>

        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0 lg:col-span-2 lg:h-[540px] 3xl:col-span-1 3xl:h-auto 3xl:min-h-0">
        <CardHeader className="flex shrink-0 flex-row items-center gap-2.5 border-b px-4 py-3">
          <CardTitle className="text-sm font-medium">{t('templates.preview')}</CardTitle>
          <span className="text-muted-foreground truncate font-mono text-xs">
            {current.engine === 'text'
              ? current.printing.raw
                ? t('templates.text_raw')
                : 'text'
              : layout
                ? t('templates.render_size', {
                    width: layout.widthMm,
                    height: layout.heightMm,
                    pages: layout.pages,
                  })
                : current.page.width
                  ? `${current.page.width} × ${current.page.height ?? 'auto'}`
                  : (current.page.format ?? 'A4')}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {previewText !== null ? (
              <CopyButton value={previewText} label={t('templates.copy_preview')} />
            ) : null}
            {previewUrl ? (
              <Button variant="ghost" size="sm" onClick={() => window.open(previewUrl, '_blank')}>
                <ExternalLink /> {t('templates.open_tab')}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={preview} disabled={busy || previewing}>
              <RefreshCw className={previewing ? 'animate-spin' : ''} /> {t('templates.rerender')}
            </Button>
          </div>
        </CardHeader>
        {layout && layout.pages > 1 ? (
          <div className="flex shrink-0 items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            <span>{t('templates.overflow_warning', { pages: layout.pages })}</span>
          </div>
        ) : null}
        <CardContent className="bg-muted/30 min-h-0 flex-1 p-0">
          {previewError ? (
            <div className="text-destructive flex h-full min-h-64 items-center justify-center px-6 py-8 text-center text-xs">
              {previewError}
            </div>
          ) : previewText !== null ? (
            <pre className="h-full min-h-64 overflow-auto bg-white px-4 py-3 font-mono text-[12px] leading-[1.5] whitespace-pre text-black">
              {previewText}
            </pre>
          ) : previewUrl ? (
            <iframe
              title={t('templates.preview')}
              src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
              className="h-full min-h-96 w-full border-0 bg-white"
            />
          ) : (
            <div className="text-muted-foreground flex h-full min-h-64 flex-col items-center justify-center gap-2 px-6 py-8 text-center text-xs">
              <FileText className="size-5 opacity-50" />
              {previewing ? t('templates.rendering') : t('templates.preview_hint')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
