import { asc, count, desc, or, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { z } from 'zod'
import { links } from '../database/schema'

const querySchema = z.object({
  q: z.string().trim().max(2048).default(''),
  page: z.coerce.number().int().min(1).default(1),
  sort: z.enum(['slug', 'url', 'comment', 'created_at', 'updated_at']).default('created_at'),
  descending: z.enum(['true', 'false']).default('true'),
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  const db = drizzle(event.context.cloudflare.env.DB)
  const term = `%${query.q.replace(/[!%_]/g, '!$&')}%`
  const where = query.q
    ? or(sql`${links.slug} LIKE ${term} ESCAPE '!'`, sql`${links.url} LIKE ${term} ESCAPE '!'`, sql`${links.comment} LIKE ${term} ESCAPE '!'`)
    : undefined
  const columns = { slug: links.slug, url: links.url, comment: links.comment, created_at: links.createdAt, updated_at: links.updatedAt }
  const order = query.descending === 'true' ? desc : asc
  const [items, summary] = await Promise.all([
    db.select({ id: links.id, slug: links.slug, url: links.url, comment: links.comment, createdAt: links.createdAt, updatedAt: links.updatedAt, expiration: links.expiration })
      .from(links)
      .where(where)
      .orderBy(order(columns[query.sort]), asc(links.slug))
      .limit(100)
      .offset((query.page - 1) * 100),
    db.select({ total: count() }).from(links).where(where),
  ])
  return { items, total: summary[0]?.total || 0, page: query.page, pageSize: 100 }
})
