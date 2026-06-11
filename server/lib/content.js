// JSON-file-backed content store for blog posts, job openings, and job
// applications. Same dependency-free pattern as store.js / db.js so content can
// be edited without a deploy, and applications are captured durably.
//
// Swap for a real CMS/DB in production by keeping these async signatures.

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
// DATA_DIR env override lets deployments point at persistent storage
// (e.g. /home/data on Azure App Service, which survives redeploys).
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data')
const FILE = join(DATA_DIR, 'content.json')
// Bundled seed (committed blog posts / job listings) — used when the data-dir
// copy doesn't exist yet (fresh persistent volume).
const SEED_FILE = join(__dirname, '..', 'data', 'content.json')

const EMPTY = { posts: [], jobs: [], applications: [] }

let writeChain = Promise.resolve()

async function readDB() {
  for (const file of FILE === SEED_FILE ? [FILE] : [FILE, SEED_FILE]) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf-8'))
      return {
        posts: Array.isArray(parsed.posts) ? parsed.posts : [],
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
        applications: Array.isArray(parsed.applications) ? parsed.applications : [],
      }
    } catch {
      // fall through to seed / empty
    }
  }
  return { ...EMPTY }
}

function writeDB(db) {
  writeChain = writeChain.then(() =>
    fs.mkdir(DATA_DIR, { recursive: true }).then(() =>
      fs.writeFile(FILE, JSON.stringify(db, null, 2)),
    ),
  )
  return writeChain
}

// ── Blog ──────────────────────────────────────────────────────────────────────
export async function getPosts() {
  const db = await readDB()
  return db.posts.filter((p) => p.published !== false)
}

export async function getPost(slug) {
  const db = await readDB()
  return db.posts.find((p) => p.slug === slug && p.published !== false) || null
}

// ── Careers ────────────────────────────────────────────────────────────────────
export async function getJobs() {
  const db = await readDB()
  return db.jobs.filter((j) => j.open !== false)
}

export async function getJob(id) {
  const db = await readDB()
  return db.jobs.find((j) => j.id === id && j.open !== false) || null
}

// ── Applications ────────────────────────────────────────────────────────────────
export async function createApplication({ jobId, jobTitle, name, email, message, resumeUrl }) {
  const db = await readDB()
  const application = {
    id: randomUUID(),
    jobId,
    jobTitle: jobTitle || null,
    name,
    email,
    message: message || null,
    resumeUrl: resumeUrl || null,
    status: 'received',
    createdAt: new Date().toISOString(),
  }
  db.applications.push(application)
  await writeDB(db)
  return application
}
