import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, RefreshCw, RotateCcw, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/select-field'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CopyButton, CopyRow } from '@/components/copy-button'
import { Field } from '@/components/field'
import { StatusBadge } from '@/components/status-badge'
import { useAgent, reportError } from '@/hooks/use-agent'
import { useI18n } from '@/i18n'
import { translateOptional } from '@/i18n/locale'
import { api } from '@/lib/api'
import { formatBytes, formatTime } from '@/lib/format'

const STATUS_FILTERS = ['all', 'queued', 'rendering', 'printing', 'completed', 'failed', 'canceled']

export function JobsTab() {
  const { t, locale } = useI18n()
  const { jobs, stats, printers, refreshJobs } = useAgent()
  const [filter, setFilter] = useState('all')
  const [printer, setPrinter] = useState('__default')
  const [copies, setCopies] = useState(1)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const changeFilter = (value: string) => {
    setFilter(value)
    void refreshJobs(value === 'all' ? undefined : value).catch(reportError)
  }

  const submit = async (body: FormData | Record<string, unknown>) => {
    setBusy(true)
    try {
      const job = await api.printPdf(body)
      toast.success(t('jobs.created', { id: job.id }))
      await refreshJobs(filter === 'all' ? undefined : filter)
      return true
    } catch (error) {
      reportError(error)
      return false
    } finally {
      setBusy(false)
    }
  }

  const uploadFile = async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    if (printer !== '__default') form.append('printer', printer)
    form.append('copies', String(copies))
    await submit(form)
  }

  const printUrl = async () => {
    if (!url.trim()) {
      toast.error(t('jobs.url_required'))
      return
    }
    // Giữ lại URL khi in thất bại để người dùng sửa rồi thử lại.
    const ok = await submit({
      url: url.trim(),
      printer: printer === '__default' ? undefined : printer,
      copies,
    })
    if (ok) setUrl('')
  }

  const action = async (id: string, kind: 'cancel' | 'retry' | 'download') => {
    try {
      if (kind === 'download') {
        const blob = await api.jobFile(id)
        const href = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = href
        anchor.download = `${id}.pdf`
        anchor.click()
        URL.revokeObjectURL(href)
        return
      }
      if (kind === 'cancel') await api.cancelJob(id)
      else await api.retryJob(id)
      await refreshJobs(filter === 'all' ? undefined : filter)
    } catch (error) {
      reportError(error)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('jobs.print_pdf')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('overview.col.printer')}>
            <SelectField
              value={printer}
              onChange={setPrinter}
              options={[
                { value: '__default', label: t('jobs.printer_default') },
                ...printers.map((item) => ({ value: item.name, label: item.name })),
              ]}
            />
          </Field>
          <Field label={t('jobs.copies')}>
            <Input
              type="number"
              min={1}
              value={copies}
              onChange={(event) => setCopies(Number(event.target.value) || 1)}
            />
          </Field>
          <Field label={t('jobs.upload_label')} className="lg:col-span-2">
            <div className="flex gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void uploadFile(file)
                  event.target.value = ''
                }}
              />
              <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
                <Upload /> {t('jobs.choose_pdf')}
              </Button>
            </div>
          </Field>
          <Field label={t('jobs.url_label')} className="sm:col-span-2 lg:col-span-3">
            <Input
              value={url}
              placeholder="https://example.com/invoice.pdf"
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
          <Field label="&nbsp;">
            <Button className="w-full" disabled={busy} onClick={printUrl}>
              {t('jobs.print_from_url')}
            </Button>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t('jobs.queue')}
            {stats ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t('jobs.queue_stats', { running: stats.running, queued: stats.queued, total: stats.total })}
              </span>
            ) : null}
          </CardTitle>
          <CardAction className="flex items-center gap-2">
            <SelectField
              className="w-[170px]"
              value={filter}
              onChange={changeFilter}
              options={STATUS_FILTERS.map((value) => ({
                value,
                label: value === 'all' ? t('jobs.filter_all') : (translateOptional(locale, `status.${value}`) ?? value),
              }))}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => void refreshJobs(filter === 'all' ? undefined : filter).catch(reportError)}
            >
              <RefreshCw />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('nav.jobs')}</TableHead>
                  <TableHead>{t('overview.col.status')}</TableHead>
                  <TableHead>{t('overview.col.printer')}</TableHead>
                  <TableHead>{t('overview.col.origin')}</TableHead>
                  <TableHead>{t('overview.col.size')}</TableHead>
                  <TableHead>{t('jobs.col.created')}</TableHead>
                  <TableHead className="text-right">{t('printers.col.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="font-medium">{job.title || job.fileName || job.type}</div>
                      <CopyRow value={job.id} label={t('jobs.copy_id')} className="text-muted-foreground max-w-56" />
                      {job.error ? (
                        <div className="text-destructive flex items-start gap-1 text-xs">
                          <span className="min-w-0 flex-1">{job.error}</span>
                          <CopyButton value={job.error} label={t('jobs.copy_error')} className="size-6 shrink-0" />
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-sm">{job.printer ?? '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{job.origin}</TableCell>
                    <TableCell className="text-sm">{formatBytes(job.bytes)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatTime(job.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {job.status === 'queued' || job.status === 'rendering' || job.status === 'printing' ? (
                          <Button variant="ghost" size="icon" title={t('common.cancel')} onClick={() => void action(job.id, 'cancel')}>
                            <X />
                          </Button>
                        ) : null}
                        {job.status === 'failed' ? (
                          <Button variant="ghost" size="icon" title={t('jobs.retry')} onClick={() => void action(job.id, 'retry')}>
                            <RotateCcw />
                          </Button>
                        ) : null}
                        {job.filePath ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('jobs.download')}
                            onClick={() => void action(job.id, 'download')}
                          >
                            <Download />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {jobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      {t('jobs.empty')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
