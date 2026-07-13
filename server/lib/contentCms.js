// Database-backed CMS (Control Centre Phase 5).
//
// Cut-over contract (same as the prompt registry): the JSON file
// (server/data/content.json, via lib/content.js) remains the PUBLIC source of
// truth until PRISM_CMS_DB=true. This module provides:
//   * seedContentCms()   — one-time idempotent import of the JSON content
//   * public getters     — DB equivalents returning BYTE-IDENTICAL shapes to
//                          lib/content.js (posts: slug/title/date/desc/body/
//                          published · jobs: id/title/location/type/stack/
//                          description/open)
//   * isCmsDbEnabled()   — the runtime dispatch flag

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { query } from '../db/pool.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data')
const SEED_FILE = join(__dirname, '..', 'data', 'content.json')

export function isCmsDbEnabled() {
  return process.env.PRISM_CMS_DB === 'true'
}

// Raw read (lib/content.js getters filter unpublished — the seed must not).
async function readRawContent() {
  for (const file of [join(DATA_DIR, 'content.json'), SEED_FILE]) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf-8'))
      return {
        posts: Array.isArray(parsed.posts) ? parsed.posts : [],
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
        applications: Array.isArray(parsed.applications) ? parsed.applications : [],
      }
    } catch { /* fall through */ }
  }
  return { posts: [], jobs: [], applications: [] }
}

// ── One-time idempotent import ───────────────────────────────────────────────
export async function seedContentCms() {
  const raw = await readRawContent()
  let inserted = 0
  for (const p of raw.posts) {
    if (!p?.slug) continue
    const r = await query(
      `INSERT INTO content_posts (post_id, slug, title, date_label, summary, body, status, published_at, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $7 = 'published' THEN now() ELSE NULL END, 1)
       ON CONFLICT (slug) DO NOTHING RETURNING post_id`,
      [randomUUID(), p.slug, p.title || p.slug, p.date || '', p.desc || '', p.body || '',
       p.published === false ? 'draft' : 'published'],
    )
    if (r?.rows?.length) {
      inserted += 1
      await query(
        `INSERT INTO content_post_versions (version_id, post_id, version, snapshot, change_note)
         VALUES ($1,$2,1,$3,'imported from content.json') ON CONFLICT DO NOTHING`,
        [randomUUID(), r.rows[0].post_id, JSON.stringify(p)],
      )
    }
  }
  for (const j of raw.jobs) {
    if (!j?.id) continue
    const r = await query(
      `INSERT INTO content_jobs (job_id, slug, title, location, job_type, stack, description, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (slug) DO NOTHING RETURNING job_id`,
      [randomUUID(), j.id, j.title || j.id, j.location || '', j.type || '', j.stack || '',
       j.description || '', j.open === false ? 'closed' : 'open'],
    )
    if (r?.rows?.length) inserted += 1
  }
  for (const a of raw.applications) {
    if (!a?.email) continue
    const r = await query(
      `INSERT INTO job_applications (application_id, job_slug, job_title, name, email, message, resume_url, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, now()))
       ON CONFLICT (application_id) DO NOTHING RETURNING application_id`,
      [a.id || randomUUID(), a.jobId || '', a.jobTitle || '', a.name || '', a.email,
       a.message || '', a.resumeUrl || null, a.at || null],
    )
    if (r?.rows?.length) inserted += 1
  }
  return { inserted }
}

// ── Public-shape mappers ─────────────────────────────────────────────────────
function rowToPublicPost(row) {
  if (!row) return null
  return {
    slug: row.slug,
    title: row.title,
    date: row.date_label,
    desc: row.summary,
    body: row.body,
    published: row.status === 'published',
  }
}

function rowToPublicJob(row) {
  if (!row) return null
  return {
    id: row.slug,
    title: row.title,
    location: row.location,
    type: row.job_type,
    stack: row.stack,
    description: row.description,
    open: row.status === 'open',
  }
}

// Scheduled posts publish when their time arrives — evaluated at read time so
// no scheduler process is needed.
const PUBLISHED_CLAUSE = `(status = 'published' OR (status = 'scheduled' AND scheduled_for <= now()))`

export async function getPublishedPostsDb() {
  const r = await query(
    `SELECT * FROM content_posts WHERE ${PUBLISHED_CLAUSE} ORDER BY published_at DESC NULLS LAST, created_at DESC`,
  )
  return (r?.rows || []).map(rowToPublicPost)
}

export async function getPublishedPostDb(slug) {
  const r = await query(
    `SELECT * FROM content_posts WHERE slug = $1 AND ${PUBLISHED_CLAUSE}`,
    [slug],
  )
  return rowToPublicPost(r?.rows?.[0])
}

export async function getOpenJobsDb() {
  const r = await query(`SELECT * FROM content_jobs WHERE status = 'open' ORDER BY created_at`)
  return (r?.rows || []).map(rowToPublicJob)
}

export async function getOpenJobDb(slug) {
  const r = await query(`SELECT * FROM content_jobs WHERE slug = $1 AND status = 'open'`, [slug])
  return rowToPublicJob(r?.rows?.[0])
}

export async function createApplicationDb({ jobId, jobTitle, name, email, message, resumeUrl }) {
  const applicationId = randomUUID()
  await query(
    `INSERT INTO job_applications (application_id, job_slug, job_title, name, email, message, resume_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [applicationId, String(jobId), String(jobTitle || ''), String(name).trim(),
     String(email).toLowerCase().trim(), String(message || '').slice(0, 4000),
     resumeUrl ? String(resumeUrl).slice(0, 500) : null],
  )
  return { id: applicationId, jobId, jobTitle, name, email }
}
