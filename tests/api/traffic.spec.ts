import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { linkTraffic } from '../../server/database/schema'
import { db, deleteStoredLinks, fetch, fetchWithAuth, postJson, setLinkStoreD1Mode } from '../utils'

const prefix = `traffic-${crypto.randomUUID()}`
const slugs = [prefix, `${prefix}-other`]
const stamp = 1795017600

beforeEach(async () => {
  env.NUXT_TRAFFIC_ENABLED = 'true'
  await setLinkStoreD1Mode()
})

afterEach(async () => {
  for (const slug of slugs) await db.delete(linkTraffic).where(eq(linkTraffic.slug, slug))
  await deleteStoredLinks(slugs)
  env.NUXT_TRAFFIC_ENABLED = 'false'
})

async function seed(slug: string, automated: boolean, occurredAt = stamp) {
  await db.insert(linkTraffic).values({ occurredAt, day: '2026-11-18', linkId: slug, slug, country: 'US', device: 'mobile', browser: 'Safari', referrer: 'facebook.com', automated })
}

describe('local dashboard traffic integration', () => {
  it('protects traffic and link inventory behind authentication', async () => {
    expect((await fetch('/api/traffic?since=1&until=2')).status).toBe(401)
    expect((await fetch('/api/shortlinks')).status).toBe(401)
  })

  it('separates bots, applies slug and exclusive time bounds, and keeps consistent breakdowns', async () => {
    await seed(prefix, false)
    await seed(prefix, true)
    await seed(prefix, false, stamp + 100)
    await seed(slugs[1]!, false)
    const response = await fetchWithAuth(`/api/traffic?since=${stamp}&until=${stamp + 100}&slug=${prefix}`)
    expect(response.status).toBe(200)
    const data = await response.json() as { totals: object, countries: object[], timeline: object[], links: { items: object[] } }
    expect(data.totals).toEqual({ clicks: 1, automated: 1, links: 1, countries: 1 })
    expect(data.countries).toEqual([{ name: 'US', clicks: 1 }])
    expect(data.timeline).toEqual([{ day: '2026-11-18', clicks: 1, automated: 1 }])
    expect(data.links.items).toEqual([{ slug: prefix, clicks: 1 }])
  })

  it('does not return a successful empty report when recording is disabled', async () => {
    env.NUXT_TRAFFIC_ENABLED = 'false'
    expect((await fetchWithAuth('/api/traffic?since=1&until=2')).status).toBe(503)
  })

  it('records a real redirect without retaining IPs and counts a preview separately', async () => {
    expect((await postJson('/api/link/create', { slug: prefix, url: 'https://example.com' })).status).toBe(201)
    await fetch(`/${prefix}`, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' } })
    await fetch(`/${prefix}`, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } })
    await expect.poll(async () => (await db.select().from(linkTraffic).where(eq(linkTraffic.slug, prefix))).length).toBe(2)
    const rows = await db.select().from(linkTraffic).where(eq(linkTraffic.slug, prefix))
    expect(rows.map(row => row.automated).sort()).toEqual([false, true])
    expect(rows[0]).not.toHaveProperty('ip')
    expect(rows[0]).not.toHaveProperty('ua')
    await fetch(`/${prefix}`, { method: 'HEAD' })
    expect((await db.select().from(linkTraffic).where(eq(linkTraffic.slug, prefix))).length).toBe(2)
  })

  it('searches and sorts authoritative links without exposing password fields', async () => {
    await postJson('/api/link/create', { slug: prefix, url: 'https://example.com', comment: 'Unique shirt 100%_literal', password: 'private-password' })
    await postJson('/api/link/create', { slug: slugs[1], url: 'https://example.com', comment: 'Unique shirt 100xxliteral' })
    const response = await fetchWithAuth(`/api/shortlinks?q=${encodeURIComponent('100%_literal')}`)
    const data = await response.json() as { items: Record<string, unknown>[], total: number, pageSize: number }
    expect(data.total).toBe(1)
    expect(data.items[0]?.slug).toBe(prefix)
    expect(data.items[0]).not.toHaveProperty('password')
    expect(data.pageSize).toBe(100)
    expect((await fetchWithAuth('/api/shortlinks?sort=not-a-column')).status).toBe(400)
  })
})
