import { useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Star, TestTube2, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CopyRow } from '@/components/copy-button'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { useAgent, reportError } from '@/hooks/use-agent'
import { useT } from '@/i18n'
import { api, type PrinterOption } from '@/lib/api'

export function PrintersTab() {
  const t = useT()
  const { printers, refreshPrinters, refreshConfig, refreshJobs } = useAgent()
  const [busy, setBusy] = useState<string | null>(null)
  const [options, setOptions] = useState<{ name: string; items: PrinterOption[] } | null>(null)

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name)
    try {
      await action()
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('printers.title')}</CardTitle>
          <CardDescription>{t('printers.description')}</CardDescription>
          <CardAction>
            <Button
            variant="outline"
            size="sm"
            onClick={() =>
              run('__scan', async () => {
                await refreshPrinters(true)
                toast.success(t('printers.rescanned'))
              })
            }
            disabled={busy === '__scan'}
          >
              <RefreshCw className={busy === '__scan' ? 'animate-spin' : undefined} />
              {t('printers.rescan')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('printers.col.name')}</TableHead>
                  <TableHead>{t('printers.col.description')}</TableHead>
                  <TableHead>{t('overview.col.status')}</TableHead>
                  <TableHead>{t('printers.col.connection')}</TableHead>
                  <TableHead className="text-right">{t('printers.col.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {printers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      {t('printers.empty')}
                    </TableCell>
                  </TableRow>
                ) : null}
                {printers.map((printer) => (
                  <TableRow key={printer.name}>
                    <TableCell>
                      <CopyRow value={printer.name} label={t('overview.copy_printer')} mono={false} className="font-medium" />
                      <div className="mt-1 flex flex-wrap gap-1">
                        {printer.isAgentDefault ? <Badge variant="secondary">{t('printers.default_agent')}</Badge> : null}
                        {printer.isSystemDefault ? <Badge variant="outline">{t('printers.default_system')}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {printer.description}
                      {printer.location ? <div className="text-xs">{printer.location}</div> : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={printer.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {printer.connection ?? printer.driver ?? '-'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === printer.name}
                        onClick={() =>
                          run(printer.name, async () => {
                            await api.setDefaultPrinter(printer.name)
                            await Promise.all([refreshPrinters(true), refreshConfig()])
                            toast.success(t('printers.set_default_done', { printer: printer.name }))
                          })
                        }
                      >
                        <Star /> {t('printers.set_default')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === printer.name}
                        onClick={() =>
                          run(printer.name, async () => {
                            const job = await api.testPrinter(printer.name)
                            if (job.status === 'completed') toast.success(t('printers.test_sent', { id: job.id }))
                            else toast.error(`Job ${job.id}: ${job.status} ${job.error ?? ''}`)
                            await refreshJobs()
                          })
                        }
                      >
                        <TestTube2 /> {t('printers.test_print')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === printer.name}
                        onClick={() =>
                          run(printer.name, async () => {
                            const detail = await api.printer(printer.name)
                            setOptions({ name: detail.name, items: detail.options ?? [] })
                          })
                        }
                      >
                        <SlidersHorizontal /> {t('printers.options')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {options ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('printers.options_of', { printer: options.name })}</CardTitle>
            <CardDescription>{t('printers.options_description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('printers.col.key')}</TableHead>
                    <TableHead>{t('printers.col.current')}</TableHead>
                    <TableHead>{t('printers.col.values')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {options.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {t('printers.options_empty')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {options.items.map((option) => (
                    <TableRow key={option.key}>
                      <TableCell>
                        <CopyRow value={option.key} label={t('printers.copy_option_key')} />
                      </TableCell>
                      <TableCell>{option.current ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{option.values.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
