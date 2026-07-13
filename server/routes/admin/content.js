// /api/admin/content — CMS administration (Control Centre Phase 5, plan §23).
//
//   Blog:     GET /posts · GET /posts/:id · POST /posts (draft) ·
//             PATCH /posts/:id (versioned edit) · POST /posts/:id/status
//             (publish/unpublish/schedule/archive — content:publish) ·
//             DELETE /posts/:id (UNPUBLISHED DRAFTS ONLY — §28 hard-delete class)
//   Careers:  GET /jobs-list · POST /jobs-list · PATCH /jobs-list/:id ·
//             POST /jobs-list/:id/status (draft→open→closed→archived)
//   Applications: GET /applications · POST /applications/:id/status ·
//             POST /applications/:id/notes · DELETE /applications/:id
//             (retention deletion — reason required)
//
// Every edit snapshots the previous version (content_post_versions) — no
// silent overwrites of published material. PUBLIC serving switches from
// content.json to these tables only under PRISM_CMS_DB (drift is visible in
// GET /posts until the cut-over). Research/static pages remain code-rendered
// React components — CMS-ifying them is a separate product decision, stated
// here rather than faked with a table nothing reads.

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { seedContentCms, isCmsDbEnabled } from '../../lib/contentCms.js'

const router = Router()

// Idempotent import of content.json, once per boot (registry seed pattern).
let seeded = false
router.use(async (req, res, next) => {
  if (!seeded) {
    try {
      await seedContentCms()
      seeded = true
    } catch (err) {
      logger.captureException(err, { msg: 'cms_seed_failed', requestId: req.requestId })
    }
  }
  next()
})

const POST_FIELDS = ['title', 'dateLabel', 'summary', 'body', 'author', 'tags', 'seo']

function postView(row) {
  return {
    postId: row.post_id, slug: row.slug, title: row.title, dateLabel: row.date_label,
    summary: row.summary, author: row.author, tags: row.tags, seo: row.seo,
    status: row.status, scheduledFor: row.scheduled_for, publishedAt: row.published_at,
    version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

// ── Blog ─────────────────────────────────────────────────────────────────────
router.get('/posts', requirePermission('content:read'), async (req, res) => {
  try {
    const r = await query('SELECT * FROM content_posts ORDER BY created_at DESC')
    res.json({
      posts: (r?.rows || []).map(postView),
      servingFrom: isCmsDbEnabled() ? 'database (PRISM_CMS_DB)' : 'content.json (flag off — DB edits go live at cut-over)',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_posts_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/posts/:id', requirePermission('content:read'), async (req, res) => {
  try {
    const r = await query('SELECT * FROM content_posts WHERE post_id = $1', [req.params.id])
    const post = r?.rows?.[0]
    if (!post) return res.status(404).json({ error: 'Post not found.' })
    const versions = await query(
      `SELECT v.version_id, v.version, v.change_note, v.created_at, u.email AS changed_by
         FROM content_post_versions v LEFT JOIN admin_users u ON u.admin_id = v.changed_by
        WHERE v.post_id = $1 ORDER BY v.version`,
      [req.params.id],
    )
    res.json({ post: { ...postView(post), body: post.body }, versions: versions?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_post_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/posts', requirePermission('content:write'), async (req, res) => {
  try {
    const { slug, title, body } = req.body || {}
    if (!/^[a-z0-9-]{3,120}$/.test(String(slug || ''))) {
      return res.status(400).json({ error: 'slug must be 3–120 chars of a-z, 0-9, hyphen.' })
    }
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required.' })
    const postId = randomUUID()
    try {
      await query(
        `INSERT INTO content_posts (post_id, slug, title, date_label, summary, body, author, tags, seo, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')`,
        [postId, String(slug), String(title).trim(), String(req.body.dateLabel || ''),
         String(req.body.summary || ''), String(body || ''), String(req.body.author || ''),
         req.body.tags ? JSON.stringify(req.body.tags) : null,
         req.body.seo ? JSON.stringify(req.body.seo) : null],
      )
    } catch (err) {
      if (/duplicate/.test(String(err?.message))) return res.status(409).json({ error: 'A post with this slug already exists.' })
      throw err
    }
    await query(
      `INSERT INTO content_post_versions (version_id, post_id, version, snapshot, change_note, changed_by)
       VALUES ($1,$2,1,$3,'created',$4)`,
      [randomUUID(), postId, JSON.stringify(req.body), req.admin.id],
    )
    await adminAudit(req, { action: 'post_created', entityType: 'content_post', entityId: postId, after: { slug } })
    res.status(201).json({ ok: true, postId, status: 'draft' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_post_create_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/posts/:id', requirePermission('content:write'), async (req, res) => {
  try {
    const bodyKeys = Object.keys(req.body || {}).filter((k) => k !== 'changeNote')
    const outside = bodyKeys.filter((k) => !POST_FIELDS.includes(k))
    if (outside.length) return res.status(400).json({ error: `Not editable: ${outside.join(', ')} (slug and status have their own workflows).` })

    const r = await query('SELECT * FROM content_posts WHERE post_id = $1', [req.params.id])
    const post = r?.rows?.[0]
    if (!post) return res.status(404).json({ error: 'Post not found.' })

    const next = {
      title: typeof req.body.title === 'string' ? req.body.title.trim() : post.title,
      date_label: typeof req.body.dateLabel === 'string' ? req.body.dateLabel : post.date_label,
      summary: typeof req.body.summary === 'string' ? req.body.summary : post.summary,
      body: typeof req.body.body === 'string' ? req.body.body : post.body,
      author: typeof req.body.author === 'string' ? req.body.author : post.author,
      tags: req.body.tags !== undefined ? JSON.stringify(req.body.tags) : post.tags,
      seo: req.body.seo !== undefined ? JSON.stringify(req.body.seo) : post.seo,
    }
    const newVersion = post.version + 1
    await query(
      `UPDATE content_posts SET title=$2, date_label=$3, summary=$4, body=$5, author=$6,
              tags=$7, seo=$8, version=$9, updated_at=now() WHERE post_id = $1`,
      [req.params.id, next.title, next.date_label, next.summary, next.body, next.author,
       next.tags, next.seo, newVersion],
    )
    await query(
      `INSERT INTO content_post_versions (version_id, post_id, version, snapshot, change_note, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), req.params.id, newVersion,
       JSON.stringify({ title: next.title, dateLabel: next.date_label, summary: next.summary, body: next.body, author: next.author }),
       String(req.body.changeNote || 'edited').slice(0, 400), req.admin.id],
    )
    await adminAudit(req, {
      action: 'post_edited', entityType: 'content_post', entityId: req.params.id,
      after: { version: newVersion }, reason: req.body.changeNote || null,
    })
    res.json({ ok: true, version: newVersion })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_post_edit_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/posts/:id/status', requirePermission('content:publish'), async (req, res) => {
  try {
    const { status, scheduledFor, reason } = req.body || {}
    if (!['published', 'draft', 'scheduled', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'status must be published, draft (unpublish), scheduled or archived.' })
    }
    if (status === 'scheduled' && !scheduledFor) return res.status(400).json({ error: 'scheduledFor is required to schedule.' })
    const r = await query('SELECT status FROM content_posts WHERE post_id = $1', [req.params.id])
    const post = r?.rows?.[0]
    if (!post) return res.status(404).json({ error: 'Post not found.' })

    await query(
      `UPDATE content_posts SET status = $2,
              scheduled_for = CASE WHEN $2 = 'scheduled' THEN $3::timestamptz ELSE NULL END,
              published_at = CASE WHEN $2 = 'published' THEN now() ELSE published_at END,
              updated_at = now()
        WHERE post_id = $1`,
      [req.params.id, status, scheduledFor || null],
    )
    await adminAudit(req, {
      action: `post_${status === 'draft' ? 'unpublished' : status}`,
      entityType: 'content_post', entityId: req.params.id,
      before: { status: post.status }, after: { status, scheduledFor: scheduledFor || null },
      reason: reason || null,
    })
    res.json({ ok: true, status })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_post_status_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Hard delete: UNPUBLISHED DRAFTS ONLY (§28). Anything ever published archives.
router.delete('/posts/:id', requirePermission('content:write'), async (req, res) => {
  try {
    const r = await query('SELECT status, published_at FROM content_posts WHERE post_id = $1', [req.params.id])
    const post = r?.rows?.[0]
    if (!post) return res.status(404).json({ error: 'Post not found.' })
    if (post.status !== 'draft' || post.published_at) {
      return res.status(409).json({
        error: 'Only never-published drafts can be hard-deleted. Published content archives instead (its versions are the public record).',
        code: 'NOT_A_DRAFT',
      })
    }
    await query('DELETE FROM content_posts WHERE post_id = $1', [req.params.id])
    await adminAudit(req, { action: 'post_draft_deleted', entityType: 'content_post', entityId: req.params.id })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_post_delete_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Careers ──────────────────────────────────────────────────────────────────
router.get('/jobs-list', requirePermission('content:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT j.*, (SELECT COUNT(*)::int FROM job_applications a WHERE a.job_slug = j.slug) AS application_count
         FROM content_jobs j ORDER BY j.created_at`,
    )
    res.json({ jobs: r?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_jobs_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/jobs-list', requirePermission('content:write'), async (req, res) => {
  try {
    const { slug, title } = req.body || {}
    if (!/^[a-z0-9-]{3,80}$/.test(String(slug || ''))) return res.status(400).json({ error: 'slug must be 3–80 chars of a-z, 0-9, hyphen.' })
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required.' })
    const jobId = randomUUID()
    try {
      await query(
        `INSERT INTO content_jobs (job_id, slug, title, location, job_type, stack, description, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'draft')`,
        [jobId, String(slug), String(title).trim(), String(req.body.location || ''),
         String(req.body.jobType || ''), String(req.body.stack || ''), String(req.body.description || '')],
      )
    } catch (err) {
      if (/duplicate/.test(String(err?.message))) return res.status(409).json({ error: 'A role with this slug already exists.' })
      throw err
    }
    await adminAudit(req, { action: 'job_created', entityType: 'content_job', entityId: jobId, after: { slug } })
    res.status(201).json({ ok: true, jobId, status: 'draft' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_job_create_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/jobs-list/:id', requirePermission('content:write'), async (req, res) => {
  try {
    const allowed = ['title', 'location', 'jobType', 'stack', 'description']
    const outside = Object.keys(req.body || {}).filter((k) => !allowed.includes(k))
    if (outside.length) return res.status(400).json({ error: `Not editable: ${outside.join(', ')}` })
    const r = await query('SELECT * FROM content_jobs WHERE job_id = $1', [req.params.id])
    const job = r?.rows?.[0]
    if (!job) return res.status(404).json({ error: 'Role not found.' })
    await query(
      `UPDATE content_jobs SET title=$2, location=$3, job_type=$4, stack=$5, description=$6, updated_at=now()
        WHERE job_id = $1`,
      [req.params.id,
       typeof req.body.title === 'string' ? req.body.title.trim() : job.title,
       typeof req.body.location === 'string' ? req.body.location : job.location,
       typeof req.body.jobType === 'string' ? req.body.jobType : job.job_type,
       typeof req.body.stack === 'string' ? req.body.stack : job.stack,
       typeof req.body.description === 'string' ? req.body.description : job.description],
    )
    await adminAudit(req, { action: 'job_edited', entityType: 'content_job', entityId: req.params.id })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_job_edit_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/jobs-list/:id/status', requirePermission('content:publish'), async (req, res) => {
  try {
    const { status, reason } = req.body || {}
    if (!['open', 'closed', 'archived'].includes(status)) return res.status(400).json({ error: 'status must be open, closed or archived.' })
    const r = await query('SELECT status FROM content_jobs WHERE job_id = $1', [req.params.id])
    const job = r?.rows?.[0]
    if (!job) return res.status(404).json({ error: 'Role not found.' })
    await query('UPDATE content_jobs SET status = $2, updated_at = now() WHERE job_id = $1', [req.params.id, status])
    await adminAudit(req, {
      action: `job_${status}`, entityType: 'content_job', entityId: req.params.id,
      before: { status: job.status }, after: { status }, reason: reason || null,
    })
    res.json({ ok: true, status })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_job_status_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Applications ─────────────────────────────────────────────────────────────
router.get('/applications', requirePermission('content:applications'), async (req, res) => {
  try {
    const { q, status, jobSlug } = req.query
    const where = []
    const params = []
    if (status) { params.push(String(status)); where.push(`status = $${params.length}`) }
    if (jobSlug) { params.push(String(jobSlug)); where.push(`job_slug = $${params.length}`) }
    if (q) {
      params.push(`%${String(q).toLowerCase()}%`)
      where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`)
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const r = await query(
      `SELECT * FROM job_applications ${clause} ORDER BY created_at DESC LIMIT 200`,
      params,
    )
    res.json({ applications: r?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_applications_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/applications/:id/status', requirePermission('content:applications'), async (req, res) => {
  try {
    const { status } = req.body || {}
    if (!['new', 'reviewing', 'interviewing', 'rejected', 'hired', 'withdrawn'].includes(status)) {
      return res.status(400).json({ error: 'invalid status' })
    }
    const r = await query(
      'UPDATE job_applications SET status = $2, updated_at = now() WHERE application_id = $1 RETURNING application_id',
      [req.params.id, status],
    )
    if (!r?.rows?.length) return res.status(404).json({ error: 'Application not found.' })
    await adminAudit(req, {
      action: 'application_status_changed', entityType: 'job_application', entityId: req.params.id,
      after: { status },
    })
    res.json({ ok: true, status })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_application_status_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/applications/:id/notes', requirePermission('content:applications'), async (req, res) => {
  try {
    const { body } = req.body || {}
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'Note body required.' })
    const noteId = randomUUID()
    await query(
      `INSERT INTO admin_notes (note_id, entity_type, entity_id, author_id, category, body)
       VALUES ($1,'job_application',$2,$3,'hiring',$4)`,
      [noteId, req.params.id, req.admin.id, String(body).slice(0, 4000)],
    )
    await adminAudit(req, { action: 'note_added', entityType: 'job_application', entityId: req.params.id })
    res.status(201).json({ ok: true, noteId })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_application_note_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Retention deletion (§23: "Delete according to retention policy") — reason
// required; applications carry applicant PII, so deletion IS the compliant verb.
router.delete('/applications/:id', requirePermission('content:applications'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A retention reason is required (e.g. "retention window elapsed").' })
    const r = await query('DELETE FROM job_applications WHERE application_id = $1 RETURNING application_id', [req.params.id])
    if (!r?.rows?.length) return res.status(404).json({ error: 'Application not found.' })
    await adminAudit(req, {
      action: 'application_deleted_retention', entityType: 'job_application', entityId: req.params.id, reason,
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_application_delete_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
