/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com

--------------------------------------------------------------------------
Modifications for Handicraft — 2026-09-11

New file added by Handicraft (not present upstream): the /status-monitor
page, showing host resource usage and platform-wide usage totals.

Access control: the page itself is reachable without an account, but the
data is not. The endpoint behind getStatusMonitor() sits behind
middleware.UserAuth(), and anonymous visitors get an explicit sign-in
prompt rather than an empty page.
--------------------------------------------------------------------------
*/
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Cpu,
  HardDrive,
  LockKeyhole,
  MemoryStick,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuotaWithCurrency } from '@/lib/currency'
import {
  formatCompactNumber,
  formatTimeStr,
  formatUseTime,
} from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import { getStatusMonitor } from './api'
import { formatByteRate, formatBytes } from './lib/format'
import type { ServerMetrics, UsageTotals } from './types'

/** The refresh cadence of the page, and the backend's cache window is 5s. */
const REFETCH_INTERVAL_MS = 10_000

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function formatPercentValue(value: number): string {
  return `${clampPercent(value).toFixed(1)}%`
}

type MetricCardProps = {
  icon: LucideIcon
  label: string
  value: string
  detail?: string
  percent?: number
}

function MetricCard(props: MetricCardProps) {
  const Icon = props.icon

  return (
    <div className='bg-card rounded-2xl border p-4 shadow-xs'>
      <div className='flex items-center gap-2'>
        <span className='bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg'>
          <Icon className='size-4' aria-hidden='true' />
        </span>
        <span className='text-muted-foreground truncate text-sm font-medium'>
          {props.label}
        </span>
      </div>

      <div className='mt-3 text-2xl font-semibold tabular-nums'>
        {props.value}
      </div>

      {props.percent === undefined ? null : (
        <Progress className='mt-3' value={clampPercent(props.percent)} />
      )}

      {props.detail ? (
        <div className='text-muted-foreground mt-2 truncate text-xs tabular-nums'>
          {props.detail}
        </div>
      ) : null}
    </div>
  )
}

function ServerSection(props: { metrics: ServerMetrics }) {
  const { t } = useTranslation()
  const metrics = props.metrics

  const memoryDetail = t('{{used}} of {{total}}', {
    used: formatBytes(metrics.memory_used),
    total: formatBytes(metrics.memory_total),
  })
  const diskDetail = t('{{used}} of {{total}}', {
    used: formatBytes(metrics.disk_used),
    total: formatBytes(metrics.disk_total),
  })

  return (
    <section className='space-y-3'>
      <h2 className='text-lg font-semibold tracking-tight'>
        {t('Server Resources')}
      </h2>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'>
        <MetricCard
          icon={Cpu}
          label={t('CPU Usage')}
          value={formatPercentValue(metrics.cpu_percent)}
          detail={t('{{count}} cores', { count: metrics.cpu_count })}
          percent={metrics.cpu_percent}
        />
        <MetricCard
          icon={MemoryStick}
          label={t('Memory')}
          value={formatPercentValue(metrics.memory_percent)}
          detail={memoryDetail}
          percent={metrics.memory_percent}
        />
        <MetricCard
          icon={HardDrive}
          label={t('Disk')}
          value={formatPercentValue(metrics.disk_percent)}
          detail={diskDetail}
          percent={metrics.disk_percent}
        />
      </div>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'>
        <MetricCard
          icon={ArrowUpFromLine}
          label={t('Network Upload')}
          value={formatByteRate(metrics.network_out_rate)}
          detail={t('Sent {{total}} in total', {
            total: formatBytes(metrics.network_sent),
          })}
        />
        <MetricCard
          icon={ArrowDownToLine}
          label={t('Network Download')}
          value={formatByteRate(metrics.network_in_rate)}
          detail={t('Received {{total}} in total', {
            total: formatBytes(metrics.network_recv),
          })}
        />
        <MetricCard
          icon={Timer}
          label={t('Uptime')}
          value={formatUseTime(metrics.uptime_seconds)}
          detail={t('Updated {{time}}', {
            time: formatTimeStr(new Date(metrics.collected_at * 1000)),
          })}
        />
      </div>
    </section>
  )
}

function UsageSection(props: { usage: UsageTotals | null }) {
  const { t } = useTranslation()

  if (!props.usage) {
    return (
      <section className='space-y-3'>
        <h2 className='text-lg font-semibold tracking-tight'>
          {t('Platform Totals')}
        </h2>
        <p className='text-muted-foreground text-sm'>
          {t('Platform totals are temporarily unavailable.')}
        </p>
      </section>
    )
  }

  return (
    <section className='space-y-3'>
      <h2 className='text-lg font-semibold tracking-tight'>
        {t('Platform Totals')}
      </h2>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        <MetricCard
          icon={Activity}
          label={t('Total Tokens')}
          value={formatCompactNumber(props.usage.total_tokens)}
        />
        <MetricCard
          icon={ArrowUpFromLine}
          label={t('Total Requests')}
          value={formatCompactNumber(props.usage.total_requests)}
        />
        <MetricCard
          icon={HardDrive}
          label={t('Total Quota Used')}
          value={formatQuotaWithCurrency(props.usage.total_quota)}
        />
      </div>
    </section>
  )
}

function SignInRequired() {
  const { t } = useTranslation()

  return (
    <div className='flex min-h-[60vh] items-center justify-center p-8'>
      <div className='max-w-md space-y-4 text-center'>
        <div className='flex justify-center'>
          <LockKeyhole className='text-muted-foreground h-16 w-16' />
        </div>
        <h1 className='text-xl font-semibold tracking-tight'>
          {t('Sign in to view the status monitor')}
        </h1>
        <p className='text-muted-foreground text-sm leading-relaxed'>
          {t(
            'Host resource usage and platform-wide totals are only visible to signed-in users.'
          )}
        </p>
        <Button render={<Link to='/sign-in' />}>{t('Sign In')}</Button>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className='space-y-6'>
      <Skeleton className='h-7 w-56' />
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className='h-32 rounded-2xl' />
        ))}
      </div>
    </div>
  )
}

function ErrorState(props: { onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <div className='bg-destructive/5 border-destructive/30 rounded-2xl border p-6'>
      <p className='text-sm font-medium'>
        {t('Unable to load status monitor data.')}
      </p>
      <Button
        variant='outline'
        size='sm'
        className='mt-3'
        onClick={props.onRetry}
      >
        {t('Retry')}
      </Button>
    </div>
  )
}

export function StatusMonitor() {
  const { t } = useTranslation()
  const isAuthenticated = useAuthStore((state) => Boolean(state.auth.user))

  const query = useQuery({
    queryKey: ['status-monitor'],
    queryFn: getStatusMonitor,
    enabled: isAuthenticated,
    refetchInterval: REFETCH_INTERVAL_MS,
    // The payload is a live snapshot, so a background refresh is always wanted.
    staleTime: 0,
  })

  // Branch explicitly rather than chaining ternaries in JSX: the four states
  // are mutually exclusive and read far better as a sequence.
  let body: React.ReactNode
  if (!isAuthenticated) {
    body = <SignInRequired />
  } else if (query.isLoading) {
    body = <LoadingState />
  } else if (query.isError || !query.data) {
    body = <ErrorState onRetry={() => void query.refetch()} />
  } else {
    body = (
      <div className='space-y-6'>
        <ServerSection metrics={query.data.server} />
        <UsageSection usage={query.data.usage} />
      </div>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      {/* PublicLayout only applies its header-clearing pt-20 inside the <main>
          it renders when showMainContainer is left on. With it off, this
          wrapper must clear the fixed header itself (h-16 == 4rem, shrinking
          to 3.75rem once scrolled), otherwise the page heading renders
          underneath the site brand. */}
      <div className='mx-auto w-full max-w-6xl px-4 pt-20 pb-10 sm:px-6 sm:pb-12'>
        <header className='mb-6 space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>
            {t('Status Monitor')}
          </h1>
          <p className='text-muted-foreground text-sm'>
            {t('Live host resource usage and platform-wide totals.')}
          </p>
        </header>

        {body}
      </div>
    </PublicLayout>
  )
}
