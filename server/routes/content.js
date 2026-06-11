import { Router } from 'express'
import logger from '../lib/logger.js'
import { getPosts, getPost, getJobs, getJob, createApplication } from '../lib/content.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── GET /api/content/blog ─────────────────────────────────────────────────────
router.get('/blog', async (_req, res) => {
  try {
    const posts = await getPosts()
    res.json({ posts: posts.map(({ body, published, ...meta }) => meta) })
  } catch (err) {
    logger.captureException(err, { msg: 'content_blog_list_failed' })
    res.status(500).json({ error: 'Failed to load posts.' })
  }
})

// ── GET /api/content/blog/:slug ───────────────────────────────────────────────
router.get('/blog/:slug', async (req, res) => {
  try {
    const post = await getPost(req.params.slug)
    if (!post) return res.status(404).json({ error: 'Post not found.' })
    const { published, ...rest } = post
    res.json({ post: rest })
  } catch (err) {
    logger.captureException(err, { msg: 'content_blog_get_failed' })
    res.status(500).json({ error: 'Failed to load post.' })
  }
})

// ── GET /api/content/careers ──────────────────────────────────────────────────
router.get('/careers', async (_req, res) => {
  try {
    const jobs = await getJobs()
    res.json({ jobs: jobs.map(({ open, ...job }) => job) })
  } catch (err) {
    logger.captureException(err, { msg: 'content_careers_list_failed' })
    res.status(500).json({ error: 'Failed to load roles.' })
  }
})

// ── POST /api/content/careers/:id/apply ───────────────────────────────────────
router.post('/careers/:id/apply', async (req, res) => {
  try {
    const job = await getJob(req.params.id)
    if (!job) return res.status(404).json({ error: 'Role not found or no longer open.' })

    const { name, email, message, resumeUrl } = req.body || {}
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Your name is required.' })
    }
    if (!email || !EMAIL_RE.test(String(email))) {
      return res.status(400).json({ error: 'A valid email is required.' })
    }

    const application = await createApplication({
      jobId: job.id,
      jobTitle: job.title,
      name: String(name).slice(0, 200).trim(),
      email: String(email).slice(0, 200).trim(),
      message: message ? String(message).slice(0, 4000) : null,
      resumeUrl: resumeUrl ? String(resumeUrl).slice(0, 500) : null,
    })

    logger.info('job_application_received', { jobId: job.id, applicationId: application.id })
    res.status(201).json({ ok: true, message: 'Application received. We\u2019ll be in touch.' })
  } catch (err) {
    logger.captureException(err, { msg: 'content_apply_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to submit application.' })
  }
})

export default router
