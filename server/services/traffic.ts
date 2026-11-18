import type { H3Event } from 'h3'
import type { LogsMap } from '../utils/access-log'
import { drizzle } from 'drizzle-orm/d1'
import { linkTraffic } from '../database/schema'

export const TRAFFIC_TIMEZONE = 'America/Halifax'

export function isAutomatedTraffic(logs: Partial<LogsMap>): boolean {
  return ['crawler', 'fetcher'].includes(logs.browserType || '')
    || /bot|spider|crawler|facebookexternalhit|preview|curl\/|python-|socialrun.*test/i.test(logs.ua || '')
}

export function queueTraffic(event: H3Event, logs: LogsMap): void {
  const config = useRuntimeConfig(event)
  if (!config.trafficEnabled || event.method !== 'GET')
    return

  const { env, context } = event.context.cloudflare
  const link = event.context.link
  if (!link?.id || !env.DB)
    return

  const stamp = new Date()
  const write = drizzle(env.DB).insert(linkTraffic).values({
    occurredAt: Math.floor(stamp.getTime() / 1000),
    day: stamp.toLocaleDateString('en-CA', { timeZone: TRAFFIC_TIMEZONE }),
    linkId: link.id,
    slug: link.slug,
    country: logs.country || '',
    device: logs.deviceType || (logs.os ? 'desktop' : 'unknown'),
    browser: logs.browser || '',
    referrer: logs.referer || '',
    automated: isAutomatedTraffic(logs),
  }).run().catch(() => {
    console.error({ event: 'traffic.write.failed' })
  })
  context.waitUntil(write)
}

// Keep the complete total when only the leading breakdown entries are displayed.
export function compactBreakdown(rows: { name: string, clicks: number }[], limit = 10) {
  const leading = rows.slice(0, limit)
  const other = rows.slice(limit).reduce((sum, row) => sum + row.clicks, 0)
  return other ? [...leading, { name: '__other__', clicks: other }] : leading
}
