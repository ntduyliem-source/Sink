import { and, asc, count, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { z } from 'zod'
import { linkTraffic } from '../database/schema'
import { compactBreakdown, TRAFFIC_TIMEZONE } from '../services/traffic'

const querySchema = z.object({
  since: z.coerce.number().int().nonnegative(),
  until: z.coerce.number().int().positive(),
  slug: z.string().trim().max(2048).default(''),
  page: z.coerce.number().int().min(1).default(1),
}).refine(value => value.since < value.until, 'Invalid time range')

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.trafficEnabled)
    throw createError({ status: 503, statusText: 'Traffic recording is not enabled' })

  const query = await getValidatedQuery(event, querySchema.parse)
  const db = drizzle(event.context.cloudflare.env.DB)
  const where = and(gte(linkTraffic.occurredAt, query.since), lt(linkTraffic.occurredAt, query.until), query.slug ? eq(linkTraffic.slug, query.slug) : undefined)
  const human = and(where, eq(linkTraffic.automated, false))
  const clicks = sql<number>`COALESCE(SUM(${linkTraffic.automated} = 0), 0)`
  const automated = sql<number>`COALESCE(SUM(${linkTraffic.automated} = 1), 0)`
  const breakdown = (column: typeof linkTraffic.country | typeof linkTraffic.device | typeof linkTraffic.referrer) =>
    db.select({ name: column, clicks: count() }).from(linkTraffic).where(human).groupBy(column).orderBy(desc(count()), asc(column))

  const [summary, timeline, links, countries, devices, referrers] = await Promise.all([
    db.select({
      clicks,
      automated,
      links: sql<number>`COUNT(DISTINCT CASE WHEN ${linkTraffic.automated} = 0 THEN ${linkTraffic.slug} END)`,
      countries: sql<number>`COUNT(DISTINCT CASE WHEN ${linkTraffic.automated} = 0 AND ${linkTraffic.country} != '' THEN ${linkTraffic.country} END)`,
    }).from(linkTraffic).where(where),
    db.select({ day: linkTraffic.day, clicks, automated }).from(linkTraffic).where(where).groupBy(linkTraffic.day).orderBy(asc(linkTraffic.day)),
    db.select({ slug: linkTraffic.slug, clicks: count() }).from(linkTraffic).where(human).groupBy(linkTraffic.slug).orderBy(desc(count()), asc(linkTraffic.slug)).limit(100).offset((query.page - 1) * 100),
    breakdown(linkTraffic.country),
    breakdown(linkTraffic.device),
    breakdown(linkTraffic.referrer),
  ])
  const totals = summary[0]!
  return {
    enabled: true,
    startedAt: config.trafficStartedAt || null,
    timezone: TRAFFIC_TIMEZONE,
    totals,
    timeline,
    links: { items: links, total: totals.links, page: query.page, pageSize: 100 },
    countries: compactBreakdown(countries),
    devices: compactBreakdown(devices),
    referrers: compactBreakdown(referrers),
  }
})
