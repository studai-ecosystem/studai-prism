import { Router } from 'express'
import logger from '../lib/logger.js'
import { getPosts, getPost, getJobs, getJob, createApplication } from '../lib/content.js'
import {
  isCmsDbEnabled, getPublishedPostsDb, getPublishedPostDb, getOpenJobsDb, getOpenJobDb,
  createApplicationDb,
} from '../lib/contentCms.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Control Centre Phase 5: PRISM_CMS_DB=true serves the database CMS instead
// of content.json. Shapes are byte-identical either way (lib/contentCms.js
// mappers); flag off → original JSON behavior, unchanged.
const posts = () => (isCmsDbEnabled() ? getPublishedPostsDb() : getPosts())
const post = (slug) => (isCmsDbEnabled() ? getPublishedPostDb(slug) : getPost(slug))
const jobs = () => (isCmsDbEnabled() ? getOpenJobsDb() : getJobs())
const job = (id) => (isCmsDbEnabled() ? getOpenJobDb(id) : getJob(id))
const submitApplication = (a) => (isCmsDbEnabled() ? createApplicationDb(a) : createApplication(a))

// ── GET /api/content/blog ─────────────────────────────────────────────────────
router.get('/blog', async (_req, res) => {
  try {
    const list = await posts()
    res.json({ posts: list.map(({ body, published, ...meta }) => meta) })
  } catch (err) {
    logger.captureException(err, { msg: 'content_blog_list_failed' })
    res.status(500).json({ error: 'Failed to load posts.' })
  }
})

// ── GET /api/content/blog/:slug ───────────────────────────────────────────────
router.get('/blog/:slug', async (req, res) => {
  try {
    const found = await post(req.params.slug)
    if (!found) return res.status(404).json({ error: 'Post not found.' })
    const { published, ...rest } = found
    res.json({ post: rest })
  } catch (err) {
    logger.captureException(err, { msg: 'content_blog_get_failed' })
    res.status(500).json({ error: 'Failed to load post.' })
  }
})

// ── GET /api/content/careers ──────────────────────────────────────────────────
router.get('/careers', async (_req, res) => {
  try {
    const list = await jobs()
    res.json({ jobs: list.map(({ open, ...j }) => j) })
  } catch (err) {
    logger.captureException(err, { msg: 'content_careers_list_failed' })
    res.status(500).json({ error: 'Failed to load roles.' })
  }
})

// ── POST /api/content/careers/:id/apply ───────────────────────────────────────
router.post('/careers/:id/apply', async (req, res) => {
  try {
    const found = await job(req.params.id)
    if (!found) return res.status(404).json({ error: 'Role not found or no longer open.' })

    const { name, email, message, resumeUrl } = req.body || {}
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Your name is required.' })
    }
    if (!email || !EMAIL_RE.test(String(email))) {
      return res.status(400).json({ error: 'A valid email is required.' })
    }

    const application = await submitApplication({
      jobId: found.id,
      jobTitle: found.title,
      name: String(name).slice(0, 200).trim(),
      email: String(email).slice(0, 200).trim(),
      message: message ? String(message).slice(0, 4000) : null,
      resumeUrl: resumeUrl ? String(resumeUrl).slice(0, 500) : null,
    })

    logger.info('job_application_received', { jobId: found.id, applicationId: application.id })
    res.status(201).json({ ok: true, message: 'Application received. We\u2019ll be in touch.' })
  } catch (err) {
    logger.captureException(err, { msg: 'content_apply_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to submit application.' })
  }
})

export default router
