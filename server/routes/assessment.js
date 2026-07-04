import { Router } from 'express'
import { json as expressJson } from 'express'
import OpenAI from 'openai'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import logger from '../lib/logger.js'
import { sessionCache } from '../lib/sessionCache.js'
import { isWhisperEnabled, transcribeAudio } from '../lib/openaiWhisper.js'
import { isMailEnabled, sendReportEmail } from '../lib/mailer.js'
import {
  getEntitlement,
  createSession,
  getSession,
  getRecentScenarioIdsByUser,
  updateSession,
  saveReport,
  getReport,
  getReportsByUser,
  getAllOverallScores,
  recordEvent,
  setCalibration,
  getCalibration,
  recordConsent,
  getConsent,
  createDispute,
  getDispute,
  recordVerification,
  getVerification,
  recordItem,
  eraseSession,
} from '../lib/store.js'
import { extractTurnFeatures } from '../lib/behavioralFeatures.js'
import { emptyEvidence, accumulateEvidence, decideDirector } from '../lib/director.js'
import { buildPanelPlan } from '../lib/judgePanel.js'
import { aggregateSamples } from '../lib/scoreAggregator.js'
import { auditLog, recordItemResponse, recordAbilityEstimate, getResponseIdsBySession } from '../lib/telemetry.js'
import { DIMENSION_KEYS, DIMENSION_WEIGHTS, SCORE_VALIDITY_MONTHS } from '../lib/sharedConstants.js'
import { getJwtSecret } from '../lib/security.js'
import { isExecutiveEnabled, isEarlyStopEnabled } from '../engine/executiveConfig.js'
import { EvidenceLedger } from '../engine/evidenceLedger.js'
import { microRateTurn, normalizeLevels } from '../engine/microRater.js'
import { selectProbe, stopDecision } from '../engine/probeSelector.js'
import { anchorsToTheta, heuristicTheta, thetaToTier } from '../engine/entryEstimator.js'
import { loadPrompt } from '../engine/prompts.js'
import { isDualScorerEnabled, runDualScorer } from '../scoring/dualScorer.js'
import { equateScore, isEquatingEnabled } from '../scoring/equating.js'

const router = Router()

// Multipart upload for voice answers — memory storage (we transcribe then
// discard; audio is never persisted), capped to keep request size sane.
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB ≈ a few minutes of compressed audio
})

// Decode the optional Bearer JWT so we can associate a session/report with the
// signed-in user. Returns { id, email } or null — never throws, so anonymous
// (dev) sessions keep working.
function getAuthUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  try {
    const payload = jwt.verify(token, getJwtSecret())
    return { id: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

// Hard wall-clock limit for a session (server-enforced, mirrors the 30-min UI timer).
const SESSION_LIMIT_MS = 35 * 60 * 1000 // 30 min + 5 min grace for network/scoring

// ── Resilient chat completion — retry transient failures with backoff ─────────
async function createCompletion(params, { retries = 2 } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await getClient().chat.completions.create(params)
    } catch (err) {
      lastErr = err
      const status = err?.status || err?.response?.status
      // Don't retry client errors (4xx except 429).
      if (status && status < 500 && status !== 429) break
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)))
      }
    }
  }
  throw lastErr
}

function clampScore(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

// DIMENSION_KEYS / DIMENSION_WEIGHTS come from lib/sharedConstants.js — the
// single source of truth also bundled into the client, so public claims about
// the weighting can never drift from the arithmetic below (audit C2).

// Normalise, clamp and re-derive the overall score server-side so the client
// can never receive an out-of-range or model-miscalculated figure.
function sanitizeReport(report) {
  const scores = report?.scores || {}
  const clean = {}
  for (const key of DIMENSION_KEYS) clean[key] = clampScore(scores[key])
  const overall = clampScore(
    DIMENSION_KEYS.reduce((sum, key) => sum + clean[key] * DIMENSION_WEIGHTS[key], 0),
  )
  clean.overall = overall
  return {
    scores: clean,
    feedback: report?.feedback || {},
    evidence: report?.evidence || {},
    highlights: Array.isArray(report?.highlights) ? report.highlights : [],
    growthAreas: Array.isArray(report?.growthAreas) ? report.growthAreas : [],
    reliability: report?.reliability || null,
  }
}

// Norm-referenced percentile against all previously issued overall scores.
async function computePercentile(overall) {
  const all = await getAllOverallScores()
  if (all.length < 1) return null
  const below = all.filter((s) => s < overall).length
  return Math.round((below / all.length) * 100)
}

// Lazy init — env vars are loaded by dotenv in index.js but ES module
// imports are hoisted, so we must defer client creation to first use.
let _openai = null
function getClient() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
      defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
    })
  }
  return _openai
}
const MODEL = () => process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.4'

// ── Live session cache (pluggable: in-memory by default, Redis when REDIS_URL set) ─
// Stores { scenario, exchangeCount, history } for the active chat; every turn is
// also durably persisted via store.js, so this is purely a hot cache.
const sessions = sessionCache

// ── Scenario library ──────────────────────────────────────────────────────────
// Exported (read-only) so the Prism v2 Phase 0 item seeder can backfill one
// 'scenario' item + per-dimension 'probe' items per scenario. No behavior change.
//
// CALIBRATION FREEZE (audit C11 / build rule "≤ 8 scenarios until first IRT
// calibration run"): the bank froze at 8 ACTIVE scenarios on 2026-07-04.
// Retired scenarios stay in this array with `retired: true` — NEVER delete them
// (historical sessions and item_responses reference their ids) and never
// un-retire or add scenarios until a frozen calibration run succeeds.
// Kept (3 foundational / 3 intermediate / 2 advanced, one archetype each):
//   group-project, fest-budget, clinic-triage · delayed-launch,
//   supplier-failure, brand-crisis · ethical-ai, team-restructure.
// Each retired id duplicated an archetype the kept set already covers.
export const SCENARIOS = [
  // ── Student-relatable scenarios (foundational) ──────────────────────────────
  // These are set in everyday college / student life so a candidate never needs
  // any industry or business knowledge — only common sense, clear thinking, and
  // people skills. Great default for first-time and younger candidates.
  {
    id: 'group-project',
    difficulty: 'foundational',
    domain: 'College Life',
    title: 'The Group Project',
    context: `You are a final-year student leading a 4-person group project that is due in 3 days. It counts for 40% of your grade. One teammate has done almost no work and keeps making excuses. Another teammate wants to just do that person's part for them to be safe. You still have your own part left to finish too. Everyone is stressed and the group chat is getting tense.`,
    participants: [
      { name: 'Aditya', role: 'The Hardworking Teammate', personality: 'Stressed and a bit angry. Wants to remove the slacker from the group or report them. Will ask you what you are actually going to do about it.' },
      { name: 'Sneha', role: 'The Peacemaker Teammate', personality: 'Avoids conflict. Just wants to cover the missing work quietly so the grade is safe. Worried about hurting feelings.' },
      { name: 'Ravi', role: 'The Quiet Teammate', personality: 'Mostly stays silent and just listens. Speaks only rarely, to say how the team is feeling or whether a plan seems fair to everyone.' },
    ],
  },
  {
    id: 'fest-budget',
    difficulty: 'foundational',
    domain: 'College Life',
    title: 'The Fest Budget',
    context: `You are the coordinator for your college fest. You have ₹50,000 left and two days to go. The music club wants more money for a better sound system. The food stalls say they will pull out unless they get a bigger share. If you spend on one, the other gets less. Students are already excited and tickets are sold, so the event cannot flop.`,
    participants: [
      { name: 'Karthik', role: 'Music Club Head', personality: 'Passionate about the show. Believes a great sound system is what people will remember. Will push hard for the bigger budget.' },
      { name: 'Divya', role: 'Food Stall Organiser', personality: 'Practical. Says hungry people leave early and blame the organisers. Threatens to reduce stalls if her budget is cut.' },
      { name: 'Prof. Nair', role: 'Faculty Advisor', personality: 'Observes quietly in the background. Speaks only rarely, to remind everyone of safety rules or that the budget is fixed.' },
    ],
  },
  {
    id: 'internship-clash',
    difficulty: 'foundational',
    retired: true, // C11 freeze: single-stakeholder personal choice — weakest collaboration probe
    domain: 'Student Career',
    title: 'The Internship Clash',
    context: `You are a student who just got two offers in the same week. One is a paid internship at a big company that looks great on your resume but is boring admin work. The other is an unpaid role at a small startup where you would actually build things and learn a lot. Your final exams are also in 4 weeks. You can only take one, and you must reply tomorrow.`,
    participants: [
      { name: 'Mom', role: 'Your Parent', personality: 'Worried about money and your exams. Wants you to take the safe, paid, well-known company. Will ask how you will manage your studies.' },
      { name: 'Rahul', role: 'Your Senior / Mentor', personality: 'Believes real learning beats a big brand name. Pushes you toward the startup. Will ask what you actually want from your career.' },
      { name: 'Isha', role: 'Your Close Friend', personality: 'Mostly listens and stays out of it. Speaks only rarely, to gently ask what you truly want for yourself.' },
    ],
  },
  {
    id: 'roommate-conflict',
    difficulty: 'foundational',
    retired: true, // C11 freeze: same peer-conflict archetype as group-project (kept)
    domain: 'College Life',
    title: 'The Hostel Room Problem',
    context: `You share a hostel room with two others. One roommate stays up late, plays loud music, and has friends over till midnight. You have an important test series starting next week and cannot study. The third roommate does not want to take sides. You have to keep living together for the rest of the year, so you cannot just blow up the relationship.`,
    participants: [
      { name: 'Vivek', role: 'The Loud Roommate', personality: 'Easy-going and a little defensive. Feels it is his room too and he should be able to relax. Will ask why this is suddenly a problem now.' },
      { name: 'Aman', role: 'The Neutral Roommate', personality: 'Hates drama. Just wants peace and for everyone to get along. Will avoid picking a side unless pushed.' },
      { name: 'Sandeep', role: 'Floor Senior', personality: 'Observes quietly. Speaks only rarely, to remind everyone they have to share this room for the whole year.' },
    ],
  },
  {
    id: 'delayed-launch',
    difficulty: 'intermediate',
    domain: 'Technology & Product',
    title: 'The Delayed Launch',
    context: `You are the Product Manager at FinTrack, a growing fintech startup. Your mobile app was due to launch this quarter, but engineering says they need 6 more weeks. Your top enterprise client — accounting for 30% of revenue — has threatened to leave if the app is not live within 2 weeks. Marketing has already announced the launch date and there is social media buzz building.`,
    participants: [
      { name: 'Rohan Mehta', role: 'CTO', personality: 'Protective of engineering quality, concerned about technical debt if rushed. Will push back strongly on unrealistic timelines but is open to creative solutions.' },
      { name: 'Ananya Singh', role: 'Chief Revenue Officer', personality: 'Laser-focused on client retention and revenue. Willing to make bold promises to keep the client. Impatient with technical excuses.' },
      { name: 'Priya Menon', role: 'Customer Success Lead', personality: 'Mostly listens. Speaks only rarely, to flag how the client is actually feeling on the ground.' },
    ],
  },
  {
    id: 'ethical-ai',
    difficulty: 'advanced',
    domain: 'Technology & Product',
    title: 'The Ethical AI Decision',
    context: `You are a Strategy Consultant advising RetailCo, a major retail chain that wants to implement an AI hiring system to filter 50,000 applicants per quarter. Your analysis shows that the model, trained on historical data, has statistically significant bias against certain demographic groups. The client wants full deployment in 3 weeks. Delaying could cost RetailCo ₹2 crore in manual screening costs.`,
    participants: [
      { name: 'Vikram Nair', role: 'CEO, RetailCo', personality: 'Results-driven, skeptical of bias claims, sees this as over-engineering a problem. Puts business efficiency above all.' },
      { name: 'Dr. Meera Patel', role: 'Independent AI Ethics Researcher', personality: 'Principled, data-driven. Will cite specific evidence of bias and potential legal risks. Advocates for a phased, fair approach.' },
      { name: 'Arvind Rao', role: 'Legal Counsel', personality: 'Observes quietly. Speaks only rarely, to note a real legal or compliance risk that no one has raised.' },
    ],
  },
  {
    id: 'team-restructure',
    difficulty: 'advanced',
    domain: 'Business & Management',
    title: 'The Team Restructure',
    context: `You are the newly appointed VP of Product at TechCorp. After a difficult quarter with 40% revenue decline, leadership has asked you to restructure your 30-person product team, potentially eliminating 8 positions. You must present a plan to the CEO in 2 days. Several team members have heard rumours and morale is fragile. The remaining team must still deliver on a major roadmap commitment.`,
    participants: [
      { name: 'Arjun Kapoor', role: 'CEO', personality: 'Expects decisive action, clear business reasoning, and minimal disruption to delivery. Will challenge you hard on the business case and people decisions.' },
      { name: 'Shreya Bansal', role: 'Senior Product Lead', personality: "Represents the team's concerns, deeply worried about morale and fairness. Will ask hard questions about process and which roles are cut." },
      { name: 'Nisha Gupta', role: 'HR Business Partner', personality: 'Mostly listens. Speaks only rarely, to flag a fairness or process concern for the affected staff.' },
    ],
  },
  {
    id: 'supplier-failure',
    difficulty: 'intermediate',
    domain: 'Operations & Supply Chain',
    title: 'The Supplier Crisis',
    context: `You are the Operations Manager at a mid-sized electronics manufacturer in Pune. Your key component supplier in Shenzhen has missed delivery — production stops in 6 hours without the parts. You have three options: air-freight the components at 4x cost, find an alternate supplier who can deliver in 72 hours but whose quality is unproven, or halt the production line and absorb the delay penalty with your biggest OEM client.`,
    participants: [
      { name: 'Priya Desai', role: 'Head of Procurement', personality: 'Focused on cost and supplier relationships. Strongly opposed to using an unvetted supplier. Will push back on the air-freight cost.' },
      { name: 'Sandeep Rao', role: 'OEM Client Relationship Manager', personality: 'Represents the client\'s interest. Escalating urgently. The client will impose ₹40 lakh penalty if the production target is missed this quarter.' },
      { name: 'Ramesh Iyer', role: 'Plant Floor Supervisor', personality: 'Observes quietly. Speaks only rarely, to note what is actually possible on the production line right now.' },
    ],
  },
  {
    id: 'loan-dispute',
    difficulty: 'intermediate',
    retired: true, // C11 freeze: rule-override/ethics archetype covered by ethical-ai (kept)
    domain: 'Finance & Banking',
    title: 'The Loan Dispute',
    context: `You are a Branch Manager at a private bank in Chennai. A long-standing business customer, Meena Chandrasekaran, is disputing a loan rejection on her working-capital application. Your credit team followed the algorithm — her CIBIL score dropped due to a delayed payment during the COVID period that she says was a bank error. She runs a 15-year-old textile export business with consistent revenues. She needs a decision today or she misses a major export order.`,
    participants: [
      { name: 'Meena Chandrasekaran', role: 'Business Customer', personality: 'Frustrated but articulate. Has all her documents. Believes the system has failed her. Will ask sharp questions about the rejection criteria.' },
      { name: 'Kiran Bhat', role: 'Regional Credit Manager', personality: 'Follows process, risk-averse. Concerned about setting precedent if you override the credit algorithm without proper documentation.' },
      { name: 'Anita Joseph', role: 'Branch Compliance Officer', personality: 'Mostly listens. Speaks only rarely, to flag a real rule or documentation issue.' },
    ],
  },
  {
    id: 'campus-placement',
    difficulty: 'foundational',
    retired: true, // C11 freeze: niche administrator persona for the student cohort
    domain: 'Education & EdTech',
    title: 'The Placement Strategy',
    context: `You are the Head of Career Services at a Tier-2 engineering college in Coimbatore. Placement season starts in 6 weeks. Three major IT firms have pulled out of your campus citing "talent mismatch." Your top 40 students are strong, but the bottom 200 are struggling with communication and problem-solving skills. The Dean wants placement numbers to hold. You have ₹8 lakh in the career development budget.`,
    participants: [
      { name: 'Dr. Ramesh Iyer', role: 'Dean, Academic Affairs', personality: 'Wants placement percentages maintained for NAAC accreditation. Skeptical of spending budget on soft skills when technical training is the gap.' },
      { name: 'Kavitha Nair', role: 'Student Representative (Final Year)', personality: 'Represents student anxiety. Wants concrete commitments, not strategy. Will ask what will actually change in 6 weeks.' },
      { name: 'Suresh Kumar', role: 'Senior Placement Coordinator', personality: 'Observes quietly. Speaks only rarely, to note what students can realistically achieve in six weeks.' },
    ],
  },
  {
    id: 'startup-pivot',
    difficulty: 'advanced',
    retired: true, // C11 freeze: decision-under-uncertainty archetype covered by team-restructure/ethical-ai
    domain: 'Startup & Entrepreneurship',
    title: 'The Pivot Decision',
    context: `You are a co-founder of an EdTech startup with 3 months of runway left. Your current product — a live tutoring app — has 2,000 users but low retention and high CAC. You have two pivot options: a B2B play (sell to schools as a teacher-training tool, lower margin but faster enterprise contracts) or double down on B2C with an AI-personalised study plan feature your CTO says can be built in 6 weeks. Your seed investor is on a call with you tomorrow.`,
    participants: [
      { name: 'Neha Agrawal', role: 'Seed Investor', personality: 'Experienced, direct, no patience for fuzzy thinking. Wants to see your unit economics and a clear 18-month path. Will probe every assumption.' },
      { name: 'Dev Malhotra', role: 'CTO & Co-founder', personality: 'Believes in the product. Optimistic about the AI feature timeline. Uncomfortable with the B2B pivot which he sees as giving up on the vision.' },
      { name: 'Karan Shah', role: 'Head of Growth', personality: 'Mostly listens. Speaks only rarely, to share a real number about users, retention or spend.' },
    ],
  },
  {
    id: 'brand-crisis',
    difficulty: 'intermediate',
    domain: 'Sales & Marketing',
    title: 'The Brand Crisis',
    context: `You are the Marketing Director at a fast-growing D2C skincare brand. A food safety YouTuber with 2 million subscribers has posted a video claiming your bestselling moisturiser contains a harmful chemical — based on a lab test he conducted. The claim is disputed by your R&D team, but the video has 800,000 views in 12 hours. Stock is moving off shelves in two major retail chains. Your PR agency says you have a 4-hour window to respond before the news cycle picks it up.`,
    participants: [
      { name: 'Ritu Sharma', role: 'CEO', personality: "Wants to act fast. Concerned about brand equity. Willing to pull the product temporarily to show accountability, even without confirmed evidence." },
      { name: 'Dr. Anand Pillai', role: 'Head of R&D', personality: "Confident the product is safe. Strongly opposed to pulling it — believes that's an admission of guilt and sets a bad precedent. Wants to wait for official lab verification." },
      { name: 'Sneha Iyer', role: 'PR Agency Lead', personality: 'Observes quietly. Speaks only rarely, to note how the public mood is shifting online.' },
    ],
  },
  {
    id: 'clinic-triage',
    difficulty: 'foundational',
    domain: 'Healthcare',
    title: 'The Clinic Backlog',
    context: `You manage a busy community health clinic in Nagpur. This morning 3 staff called in sick and 60 patients are waiting. A walk-in elderly patient looks seriously unwell but has no appointment, while patients with booked slots are already angry about the delay. You have two doctors available instead of the usual four, and the pharmacy queue is also building up.`,
    participants: [
      { name: 'Nurse Latha', role: 'Senior Duty Nurse', personality: 'Practical and calm. Worried about patient safety and staff burnout. Will push you to set a clear priority rule for who is seen first.' },
      { name: 'Mr. Joshi', role: 'Waiting Patient with Appointment', personality: 'Frustrated. Booked his slot a week ago and feels skipping him is unfair. Will challenge any decision to see walk-ins before him.' },
      { name: 'Dr. Kamat', role: 'Duty Doctor', personality: 'Mostly listens. Speaks only rarely, to flag a real patient-safety concern.' },
    ],
  },
  {
    id: 'hospital-staffing',
    difficulty: 'advanced',
    retired: true, // C11 freeze: healthcare triage archetype covered by clinic-triage (kept)
    domain: 'Healthcare',
    title: 'The ICU Staffing Call',
    context: `You are the Hospital Operations Director at a private hospital in Hyderabad. A sudden viral outbreak has filled the ICU to 95% capacity. You can either pull experienced nurses from the general ward (risking care quality there), authorise expensive overtime that breaches the monthly budget, or divert new critical patients to a rival hospital 40 minutes away. The medical board reviews your decision next week.`,
    participants: [
      { name: 'Dr. Sunita Reddy', role: 'Chief of Medicine', personality: 'Patient-safety absolutist. Opposes diverting critical patients. Will challenge any plan that thins ICU expertise.' },
      { name: 'Mr. Gopal Verma', role: 'Hospital CFO', personality: 'Guards the budget. Resists open-ended overtime. Wants a cost-bounded plan and clear accountability.' },
      { name: 'Sister Mary', role: 'Nursing Supervisor', personality: 'Observes quietly. Speaks only rarely, to note how stretched the nursing staff already are.' },
    ],
  },
  {
    id: 'last-mile',
    difficulty: 'foundational',
    retired: true, // C11 freeze: ops-surge archetype covered by supplier-failure (kept)
    domain: 'Logistics & Delivery',
    title: 'The Festival Rush',
    context: `You run city operations for a last-mile delivery company in Jaipur. It is the festival season and order volume has tripled overnight. 20% of your delivery riders are on leave, customers are complaining about late parcels, and a major e-commerce client is threatening penalties for missed SLAs. You have budget to hire temporary riders but they need a day of training first.`,
    participants: [
      { name: 'Amit Saxena', role: 'Client Account Manager (E-commerce)', personality: 'Represents the big client. Impatient about SLA breaches. Wants a guarantee deliveries improve within 48 hours.' },
      { name: 'Pooja Rana', role: 'Rider Team Lead', personality: 'Protective of the riders. Warns that pushing the existing team harder will cause more dropouts and accidents.' },
      { name: 'Manish Gupta', role: 'Operations Analyst', personality: 'Mostly listens. Speaks only rarely, to share a real delivery number when it is asked for.' },
    ],
  },
  {
    id: 'warehouse-automation',
    difficulty: 'intermediate',
    retired: true, // C11 freeze: people-vs-efficiency archetype covered by team-restructure (kept)
    domain: 'Logistics & Delivery',
    title: 'The Automation Trade-off',
    context: `You are the Warehouse Head at a large distribution centre near Gurugram. Management wants to install an automated sorting system that would cut errors and speed up dispatch, but it would make 25 of your 120 floor workers redundant within 4 months. The workers' union has heard about it. Peak season is approaching and any disruption now risks missing dispatch targets for your biggest retail partner.`,
    participants: [
      { name: 'Rahul Khanna', role: 'Regional Operations Director', personality: 'Focused on efficiency and ROI on the automation. Impatient with delays. Will challenge you on why not to roll out immediately.' },
      { name: 'Sahil Verma', role: 'Workers Union Representative', personality: 'Defends the floor workers. Wants retraining and redeployment commitments, not layoffs. Will press for a fair transition plan.' },
      { name: 'Deepak Joshi', role: 'Floor Safety Officer', personality: 'Observes quietly. Speaks only rarely, to flag a real safety or training concern.' },
    ],
  },
]

const DIFFICULTY_TIERS = ['foundational', 'intermediate', 'advanced']

// The frozen calibration bank (audit C11): only ACTIVE scenarios are ever
// served to new sessions. findScenario still resolves retired ids so
// historical sessions/reports keep working.
export const ACTIVE_SCENARIOS = SCENARIOS.filter((s) => !s.retired)

// Tier-aware scenario selection. Falls back gracefully when a tier has no
// scenarios (returns any random scenario) so the flow never breaks.
// `excludeIds` are scenarios the candidate has already been served — they are
// skipped so a repeat attempt gets a fresh problem. If every scenario in the
// pool has been seen, the exclusion is dropped (so the flow never breaks).
export function pickScenario(tier, excludeIds = []) {
  let pool = ACTIVE_SCENARIOS
  if (tier && DIFFICULTY_TIERS.includes(tier)) {
    const tiered = ACTIVE_SCENARIOS.filter((s) => s.difficulty === tier)
    if (tiered.length) pool = tiered
  }
  const exclude = new Set(excludeIds)
  const unseen = pool.filter((s) => !exclude.has(s.id))
  const choices = unseen.length ? unseen : pool
  return choices[Math.floor(Math.random() * choices.length)]
}

// ── Avatar "questioning approach" styles ─────────────────────────────────────
// The PRISM-Director (server/lib/director.js) now selects the style per turn,
// steered by which dimension has the thinnest evidence (replacing the old fixed
// exchange-count rotation). Style 1: curious & probing · Style 2: gently
// challenging · Style 3: guidance-seeking (clarity).

const AVATAR_INSTRUCTIONS = {
  1: `AVATAR STYLE — Curious and Encouraging.
Your behaviour: Briefly accept what the candidate said, then ask about a SPECIFIC new part of the situation they have not covered yet. Move the problem forward each turn.
Good moves: "Okay, and who would you talk to first?", "That helps — how would you do that on day one?", "Got it. What if that costs too much — what's your backup?"
NEVER ask a bare vague question like "Why?" or "Can you say more?". Always name the specific thing you want to know about. Keep every question short and easy to read.`,
  2: `AVATAR STYLE — Gently Challenging.
Your behaviour: Accept their last point, then raise ONE specific new concern they haven't faced yet — money, time, a person's reaction, or a risk. Disagree softly from your character's view, but stay respectful.
Good moves: "Fair point, but what if the client still complains — then what?", "Okay, but training takes a day we don't have. What now?"
If the candidate is stuck, offer two clear options and ask which they'd pick. Do NOT re-ask something already answered. Keep it short and simple.`,
  3: `AVATAR STYLE — Confused and Guidance-Seeking.
Your behaviour: Ask the candidate to make ONE specific part of their plan more concrete — a real first step, a number, or exactly what someone should do. Help them practise being clear.
Good moves: "Sorry — what exactly should I do tomorrow morning?", "How many people would that need?"
Pick a NEW detail each time; do not keep asking the same clarification. Do NOT use a bare "Why?". Keep it short and plain.`
}

function buildAvatarSystemPrompt(scenario, avatarStyle) {
  const [p1, p2, p3] = scenario.participants
  const observerLine = p3
    ? `- MOSTLY LISTENS — ${p3.name} (${p3.role}): ${p3.personality}\n   ${p3.name} is an observer. They stay SILENT almost the whole time. They speak only very rarely — at most once or twice in the entire conversation — and only a single short line. On nearly every turn, ${p3.name} says NOTHING.`
    : ''
  return `You are running a realistic scenario role-play for Prism — an AI skill assessment platform by StudAI One.

SCENARIO CONTEXT:
${scenario.context}

YOU PLAY THESE CHARACTERS, EACH WITH A FIXED ROLE:
- MAIN SPEAKER — ${p1.name} (${p1.role}): ${p1.personality}
   ${p1.name} is the candidate's main conversation partner. ${p1.name} speaks on almost EVERY turn, leads the discussion, and asks the questions.
- SPEAKS ONLY WHEN NEEDED — ${p2.name} (${p2.role}): ${p2.personality}
   ${p2.name} stays quiet most of the time. They jump in ONLY when they really need to — to challenge a weak point, add a new constraint, or strongly disagree. Roughly 1 turn in 3 or 4, NOT every turn.
${observerLine}

THE QUESTIONING APPROACH FOR THIS TURN (applies to whoever speaks):
${AVATAR_INSTRUCTIONS[avatarStyle]}

WHAT THIS TEST MEASURES — READ CAREFULLY:
This is NOT a knowledge test. The candidate is a student and is NOT expected to know this industry or job. You are measuring how they THINK, COMMUNICATE, and work with PEOPLE — not whether they know facts. So:
- Never expect insider or technical knowledge. If something matters, explain it simply inside the conversation.
- There is NO single correct answer. Reward clear reasoning, not "the right call".
- If the candidate seems lost or says they don't know, help them: restate the situation simply and offer 2 plain options to react to.
- It is fine to give a short, genuine word of encouragement when they make a good point.

TURN-TAKING — THE MOST IMPORTANT RULE:
- This is a back-and-forth: a character speaks, then the CANDIDATE replies, then a character speaks again.
- On MOST turns, ONLY the main speaker (${p1.name}) talks. Then the candidate answers. Then ${p1.name} talks again. This is normal and correct — ${p1.name} is meant to lead.
- ${p2.name} adds a SHORT second line ONLY occasionally (about 1 turn in 3-4) when they genuinely need to jump in.
${p3 ? `- ${p3.name} almost never speaks. Leave them out of nearly every turn.\n` : ''}- NEVER have everyone speak in the same turn. Default to just the main speaker.

GENERAL RULES:
1. Stay fully in character. Each participant has a distinct perspective and agenda.
2. MOVE FORWARD — DO NOT REPEAT YOURSELF (VERY IMPORTANT):
   - Once the candidate gives a real answer, ACCEPT it and move to a NEW, DIFFERENT angle of the problem. Do not re-ask the same thing.
   - Each turn must probe something fresh: e.g. cost, time, a specific person's reaction, a risk, a trade-off, a "what if this fails" follow-up, how they'd actually do step one, how they'd measure success, who they'd talk to first.
   - NEVER ask a vague open question like a bare "Why?" or "Can you explain more?". Always ask about a SPECIFIC new part of the situation.
   - Track what has already been covered and deliberately pick a topic you have NOT asked about yet. Walk the candidate through the WHOLE problem, one new facet per turn.
   - If they already answered well, briefly acknowledge it in a few words, then introduce the next twist or decision.
3. STRICT LIMIT: each character gets 1-2 sentences ONLY. Be clear and natural — no long explanations.
4. End with exactly one clear, SPECIFIC question from the speaking character that opens a new part of the problem.
5. Every few exchanges add ONE small new detail, twist, or complication in one simple sentence — never pile on pressure.
6. Do not hand the candidate the full answer, but you MAY give a small hint or two simple options when they are stuck.
7. Use Indian names, currency (₹), and context appropriate for India.

LANGUAGE RULES — VERY IMPORTANT (the candidate is a student, keep it EASY to read):
- Use simple, plain, everyday English. Write at a Grade 6-7 reading level.
- One idea per sentence. Keep sentences short (under 15 words).
- NO jargon, NO buzzwords, NO complex words. If a simple word exists, use it.
- Avoid stacking many facts into one sentence. Never use "so... that... without... while..." chains.
- The final question must be short, direct, and easy to understand — ask ONE clear thing.

OUTPUT FORMAT — respond with a JSON object only, no markdown, no explanation.
Usually return ONE message: the main speaker ${p1.name}. Return TWO messages ONLY on the occasional turn when ${p2.name} truly needs to jump in. Only very rarely include ${p3 ? p3.name : 'the observer'}.
Each item's "speaker" and "role" must be one of the characters above.
{
  "messages": [
    { "speaker": "<one of the characters>", "role": "<that character's role>", "content": "..." }
  ]
}`.trim()
}

const DIMENSION_RUBRIC = {
  criticalThinking: `CRITICAL THINKING
Behavioral anchors:
- Did they identify what information was missing before deciding?
- Did they state their assumptions, or act as if their frame was certain?
- Did they reason from specific scenario facts, or from generic platitudes?
- Did they hold their position under weak pressure but update it under a strong counter-argument?`,
  collaboration: `COLLABORATION
Behavioral anchors:
- Did they acknowledge the other party's perspective before countering?
- Did they update their view when given a genuinely good counter-argument?
- What was their conflict style? (shutdown / full capitulation / finding a third path)
- Did they build on others' ideas or only defend their own?`,
  communication: `COMMUNICATION
Behavioral anchors:
- Did responses have a clear point, supporting reasoning, and implication — or were they streams of related thoughts?
- Did they use specific language or vague filler?
- Did they adjust tone when the scenario called for it?
- When their explanation didn't land, could they rephrase clearly?`,
  problemSolving: `PROBLEM SOLVING
Behavioral anchors:
- Did they acknowledge what cannot be changed, or try to solve past given limits?
- Did they produce more than one possible approach before committing?
- Did they articulate what they give up for what they gain?
- When a new constraint was introduced, did they integrate it or start from scratch?`,
  aiDigitalFluency: `AI & DIGITAL FLUENCY
Behavioral anchors:
- Did they reference AI tools, data systems, or digital approaches where relevant?
- Did they think in terms of automation, data analysis, or AI-assisted decision-making?
- Did they question whether information could be biased or algorithmically generated?
- Did they show awareness of tasks AI should do vs tasks requiring human judgment?`,
}

const DEFAULT_DIMENSION_ORDER = [
  'criticalThinking',
  'collaboration',
  'communication',
  'problemSolving',
  'aiDigitalFluency',
]

// Build the scoring prompt. `opts.dimensionOrder` position-swaps how the rubric
// dimensions are presented (to neutralise ordering/position bias across the
// panel); `opts.personaInstruction` gives a single panel member its stance.
function buildScoringPrompt(scenario, transcript, opts = {}) {
  const order = Array.isArray(opts.dimensionOrder) && opts.dimensionOrder.length === 5
    ? opts.dimensionOrder
    : DEFAULT_DIMENSION_ORDER
  const personaBlock = opts.personaInstruction
    ? `\nPANEL MEMBER STANCE: ${opts.personaInstruction}\n`
    : ''
  const rubricBlocks = order
    .map((dim, i) => `${i + 1}. ${DIMENSION_RUBRIC[dim]}`)
    .join('\n\n')

  return `You are an expert behavioral skills evaluator for Prism by StudAI One. Evaluate a candidate's performance across 5 workplace skill dimensions based on their conversation in a simulated professional scenario.
${personaBlock}
SCENARIO: "${scenario.title}" (${scenario.domain})
${scenario.context}

FULL CONVERSATION TRANSCRIPT:
${transcript}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVALUATION FRAMEWORK — 5 DIMENSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${rubricBlocks}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORING GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
90-100: Exceptional | 75-89: Strong | 60-74: Competent | 40-59: Developing | 0-39: Early stage

IMPORTANT — THIS IS A STUDENT, NOT A PROFESSIONAL. Grade with encouragement and fairness:
- This is NOT a knowledge test. NEVER penalise the candidate for not knowing the industry, job, technical terms, or "the right business answer". There is no single correct answer.
- Reward effort, common sense, and clear everyday reasoning. A thoughtful student-level answer expressed in simple words deserves a Competent-to-Strong score (60-85), not a low one.
- Only give scores below 40 when the candidate barely engaged, gave one-word or empty answers, or refused to participate.
- Judge them against a capable student their age — not against an expert. Give the benefit of the doubt when intent is good but wording is imperfect.
- For AI & Digital Fluency especially: most everyday scenarios give little chance to show this. If the topic never came up, score it around 55-65 as "limited opportunity" rather than punishing them.
- Do not reward an answer simply for being long or confident; score the substance, not the length.
- Keep all feedback warm, specific, and constructive. Lead with what they did well, then one clear thing to improve.

For "evidence": cite a SPECIFIC moment from the transcript — quote the candidate or describe the exact exchange. The candidate will read this — it must be recognisable and specific.
For "overall": weighted average — Critical Thinking 25%, Communication 25%, Collaboration 20%, Problem Solving 20%, AI & Digital Fluency 10%.

Return ONLY valid JSON — no preamble, no markdown:
{
  "scores": {
    "criticalThinking": <integer 0-100>,
    "collaboration": <integer 0-100>,
    "communication": <integer 0-100>,
    "problemSolving": <integer 0-100>,
    "aiDigitalFluency": <integer 0-100>,
    "overall": <integer 0-100>
  },
  "feedback": {
    "criticalThinking": "<2-sentence behavioral insight referencing what they actually did>",
    "collaboration": "<2-sentence behavioral insight>",
    "communication": "<2-sentence behavioral insight>",
    "problemSolving": "<2-sentence behavioral insight>",
    "aiDigitalFluency": "<2-sentence behavioral insight>",
    "summary": "<3-sentence overall assessment — specific, honest, useful for the candidate>"
  },
  "evidence": {
    "criticalThinking": "<specific moment from the conversation that drove this score>",
    "collaboration": "<specific moment>",
    "communication": "<specific moment>",
    "problemSolving": "<specific moment>",
    "aiDigitalFluency": "<specific moment or note that this dimension had limited opportunity to be demonstrated>"
  },
  "highlights": ["<specific strength with example>", "<specific strength>", "<specific strength>"],
  "growthAreas": ["<actionable development area>", "<actionable development area>"]
}`.trim()
}

// ── POST /api/assessment/start ────────────────────────────────────────────────
router.post('/start', async (req, res) => {
  const { sessionId } = req.body
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

  // Paid-session gate — refuse to serve assessment content without a valid
  // entitlement (created by payment verification or a dev session).
  // In non-production we skip this gate so the flow can be tested freely.
  const entitlement = await getEntitlement(sessionId)
  if (!entitlement && process.env.NODE_ENV === 'production') {
    return res.status(402).json({ error: 'Payment required to start this assessment.' })
  }

  // Prevent restarting a session that already produced a report.
  const existingReport = await getReport(sessionId)
  if (existingReport) {
    return res.status(409).json({ error: 'This assessment has already been completed.' })
  }

  // Use the calibrated difficulty tier (set by the pre-assessment calibration
  // task) to pick an appropriately challenging scenario. Defaults to
  // intermediate when no calibration has been run.
  const calibration = await getCalibration(sessionId)
  const tier = calibration?.tier || 'foundational'
  // Phase 1 (PRISM_V2_EXECUTIVE): seed the EvidenceLedger from the entry
  // estimator's prior θ₀ (falls back to a neutral prior when none was stored).
  const executive = isExecutiveEnabled()
  const ledgerPrior = executive ? (calibration?.theta0 || {}) : null
  // Avoid serving a scenario this signed-in user has already seen, so repeat
  // attempts get a fresh problem statement.
  const authUser = getAuthUser(req)
  const seenScenarioIds = await getRecentScenarioIdsByUser(authUser?.id)
  const scenario = pickScenario(tier, seenScenarioIds)

  const openingPrompt = `Begin the scenario now. ONLY the FIRST character speaks to open the conversation. They say who they are, then clearly explain the problem in plain words — what happened, what is at stake, and why a decision is needed now. Do not assume the candidate already knows the situation; spell it out simply, like you are explaining it to a student for the first time. Then ask one short, friendly question that invites the candidate to share how they would start. Make it clear there is no single right answer — you just want to hear their thinking. The second character stays silent for now and will join in later when needed. Use simple everyday English a student can read easily — short words, short sentences, no jargon. Keep it to about 3-4 short sentences from this one character only, and return just this single character's message in the messages array.`

  try {
    const avatarSystem = buildAvatarSystemPrompt(scenario, 1) // Avatar 1 for opening

    const response = await createCompletion({
      model: MODEL(),
      max_completion_tokens: 350,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: avatarSystem },
        { role: 'user', content: openingPrompt },
      ],
    })

    const raw = response.choices[0].message.content
    const parsed = JSON.parse(raw)

    const history = [
      { role: 'user', content: openingPrompt },
      { role: 'assistant', content: raw },
    ]

    // Fast cache for live turns…
    await sessions.set(sessionId, { scenario, exchangeCount: 0, history, evidence: emptyEvidence() })
    // …plus durable persistence so a restart/disconnect doesn't lose the session.
    // The session record carries the consent version the candidate accepted
    // (audit C5) so every issued score is traceable to exact consent wording.
    const consentRecord = await getConsent(sessionId)
    await createSession(sessionId, {
      scenarioId: scenario.id,
      exchangeCount: 0,
      history,
      evidence: emptyEvidence(),
      ledger: executive ? new EvidenceLedger(ledgerPrior).snapshot() : null,
      usedFacets: executive ? [] : null,
      challengerTurns: executive ? [] : null,
      extensionsUsed: executive ? 0 : null,
      tokensUsed: response.usage?.total_tokens || 0,
      userId: authUser?.id || null,
      userEmail: authUser?.email || null,
      consentVersion: consentRecord?.meta?.consentVersion || null,
      consentScopes: consentRecord?.scopes || null,
    })

    // Phase 0 telemetry (no-op unless PRISM_V2_TELEMETRY + DB): record the
    // scenario-selection decision and the opening AI turn in the audit trail.
    auditLog('scenario_selected', sessionId, { scenarioId: scenario.id, tier })
    auditLog('ai_turn', sessionId, { exchange: 0, opening: true, scenarioId: scenario.id })

    // Expose non-sensitive scenario meta so the client can render the
    // Scenario Card overlay during the staged flow.
    res.json({
      ...parsed,
      scenario: {
        title: scenario.title,
        domain: scenario.domain,
        context: scenario.context,
        participants: scenario.participants.map((p) => ({ name: p.name, role: p.role })),
      },
    })
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_start_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to start assessment' })
  }
})

function findScenario(id) {
  return SCENARIOS.find((s) => s.id === id) || null
}

// Resolve a live session from the cache, falling back to durable
// storage (e.g. after a server restart or a brief disconnect/reconnect).
async function loadSession(sessionId) {
  const cached = await sessions.get(sessionId)
  if (cached) return { ...cached, _persisted: await getSession(sessionId) }
  const persisted = await getSession(sessionId)
  if (!persisted || !persisted.history) return null
  const scenario = findScenario(persisted.scenarioId)
  if (!scenario) return null
  const revived = {
    scenario,
    exchangeCount: persisted.exchangeCount || 0,
    history: persisted.history,
    evidence: persisted.evidence || emptyEvidence(),
  }
  await sessions.set(sessionId, revived)
  return { ...revived, _persisted: persisted }
}

// ── POST /api/assessment/message ─────────────────────────────────────────────
// Fallback micro-levels when the LLM micro-rater is unavailable: map the
// interpretable behavioral signals (0-1 per dimension) onto coarse 0-4 levels,
// or "NA" when a dimension showed essentially no signal this turn. Keeps the
// EvidenceLedger advancing so the Executive engine never stalls.
function levelsFromSignals(signals) {
  const out = {}
  for (const dim of DIMENSION_KEYS) {
    const s = Number(signals?.[dim]) || 0
    out[dim] = s < 0.1 ? 'NA' : Math.max(0, Math.min(4, Math.round(s * 4)))
  }
  return out
}

router.post('/message', async (req, res) => {
  const { sessionId, message, telemetry } = req.body
  if (!sessionId || !message) return res.status(400).json({ error: 'sessionId and message required' })
  if (typeof message !== 'string' || message.length > 4000) {
    return res.status(400).json({ error: 'Invalid message' })
  }

  const session = await loadSession(sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found or expired' })

  // Server-side time enforcement — independent of the client timer.
  const startedAt = session._persisted?.startedAt
  if (startedAt && Date.now() - startedAt > SESSION_LIMIT_MS) {
    return res.status(410).json({ error: 'Session time limit reached. Please submit for scoring.' })
  }

  const { scenario, history, exchangeCount } = session
  const nextExchangeCount = exchangeCount + 1
  const executive = isExecutiveEnabled()

  // 1) Interpretable behavioral features of the candidate's turn (no LLM call) —
  //    these estimate which dimensions this answer gave evidence for and feed
  //    both the director and the per-turn item telemetry. Always computed.
  const { features, signals } = extractTurnFeatures(message, {
    responseMs: telemetry && typeof telemetry.responseMs === 'number' ? telemetry.responseMs : undefined,
  })
  const evidence = accumulateEvidence(session.evidence, signals)

  // 2) Steering decision. The Executive Engine (Phase 1) replaces the v1
  //    director when PRISM_V2_EXECUTIVE is on; otherwise the v1 path is byte-
  //    identical to before.
  let targetDimension
  let deployChallenger
  let avatarStyle
  let directive
  let microLevels = null
  let ledger = null
  let usedFacets = Array.isArray(session._persisted?.usedFacets) ? [...session._persisted.usedFacets] : []
  let challengerTurns = Array.isArray(session._persisted?.challengerTurns) ? [...session._persisted.challengerTurns] : []

  if (executive) {
    // Rehydrate the ledger, micro-rate this turn, fold it in, pick the probe.
    ledger = EvidenceLedger.from(session._persisted?.ledger)
    const rated = await microRateTurn(message, { createCompletion, model: MODEL() })
    // Fallback when the rater is unavailable: derive coarse levels from the
    // interpretable signals so the ledger still advances (never blocks).
    microLevels = rated || levelsFromSignals(signals)
    ledger.applyLevels(microLevels)

    const probe = selectProbe(ledger, {
      nextExchange: nextExchangeCount,
      usedFacets,
      challengerTurns,
    })
    targetDimension = probe.targetDimension
    deployChallenger = probe.deployChallenger
    avatarStyle = probe.avatarStyle
    directive = probe.directive
    if (!usedFacets.includes(probe.facet)) usedFacets.push(probe.facet)
    if (deployChallenger) challengerTurns.push(nextExchangeCount)
  } else {
    const d = decideDirector({ evidence, nextExchange: nextExchangeCount, lastSignals: signals })
    targetDimension = d.targetDimension
    deployChallenger = d.deployChallenger
    avatarStyle = d.avatarStyle
    directive = d.directive
  }
  const avatarSystem = buildAvatarSystemPrompt(scenario, avatarStyle)

  // Append candidate's message
  const updatedHistory = [
    ...history,
    { role: 'user', content: `[Candidate]: ${message}` },
  ]

  try {
    const promptMessages = [
      { role: 'system', content: avatarSystem },
      ...(directive ? [{ role: 'system', content: directive }] : []),
      ...updatedHistory,
    ]
    const response = await createCompletion({
      model: MODEL(),
      max_completion_tokens: 350,
      temperature: 0.85,
      response_format: { type: 'json_object' },
      messages: promptMessages,
    })

    const raw = response.choices[0].message.content
    const parsed = JSON.parse(raw)

    const newHistory = [...updatedHistory, { role: 'assistant', content: raw }]

    // Update the live cache (works for both in-memory and Redis backends)…
    await sessions.set(sessionId, {
      scenario,
      history: newHistory,
      exchangeCount: nextExchangeCount,
      evidence,
    })
    // …and persist every exchange so a disconnect can't lose progress.
    const prevTokens = session._persisted?.tokensUsed || 0
    await updateSession(sessionId, {
      history: newHistory,
      exchangeCount: nextExchangeCount,
      evidence,
      ...(executive
        ? {
            ledger: ledger.snapshot(),
            usedFacets,
            challengerTurns,
          }
        : {}),
      tokensUsed: prevTokens + (response.usage?.total_tokens || 0),
    })

    // 3) Log this turn as a calibratable "item" (probe + behavioral features).
    //    Fire-and-forget: telemetry must never block or fail the conversation.
    recordItem({
      sessionId,
      scenarioId: scenario.id,
      turnIndex: nextExchangeCount,
      targetDimension,
      challengerDeployed: deployChallenger,
      avatarStyle,
      features,
      signals,
      evidenceAfter: evidence,
      userId: session._persisted?.userId || null,
    }).catch((err) =>
      logger.captureException(err, { msg: 'item_log_failed', sessionId, requestId: req.requestId }),
    )

    // Phase 0 telemetry (no-op unless PRISM_V2_TELEMETRY + DB): persist this
    // exchange as an item_response (latency + ASR confidence + micro-levels,
    // linked to the probe item the director targeted) and log the AI turn.
    recordItemResponse({
      sessionId,
      scenarioKey: scenario.id,
      dimension: targetDimension,
      exchangeNo: nextExchangeCount,
      candidateText: message,
      latencyMs: telemetry && typeof telemetry.responseMs === 'number' ? telemetry.responseMs : undefined,
      asrConfidence: telemetry && typeof telemetry.asrConfidence === 'number' ? telemetry.asrConfidence : undefined,
      microLevels,
    })
    auditLog('probe_selected', sessionId, {
      exchange: nextExchangeCount,
      targetDimension,
      challengerDeployed: deployChallenger,
      ...(executive ? { facet: usedFacets[usedFacets.length - 1], thetaMean: ledger.theta.mean, thetaVar: ledger.theta.var } : {}),
    })

    // Phase 1: persist the θ + coverage snapshot for this exchange.
    if (executive && ledger) {
      recordAbilityEstimate({
        sessionId,
        exchangeNo: nextExchangeCount,
        thetaMean: ledger.theta.mean,
        thetaVar: ledger.theta.var,
        coverage: ledger.coverageMap(),
      })
    }

    res.json(parsed)
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_message_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to get AI response' })
  }
})

// ── POST /api/assessment/evaluate ─────────────────────────────────────────────
router.post('/evaluate', async (req, res) => {
  const { sessionId } = req.body
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

  // Idempotent — if already scored, return the stored report.
  const existing = await getReport(sessionId)
  if (existing) return res.json(existing)

  const session = await loadSession(sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found or expired' })

  const { scenario, history } = session

  // Phase 0 telemetry (no-op unless PRISM_V2_TELEMETRY + DB): mark submission.
  auditLog('submission', sessionId, { scenarioId: scenario?.id, turns: Array.isArray(history) ? history.length : null })

  // Build plain-text transcript from history
  const transcript = history
    .map((m) => {
      if (m.role === 'user') return `CANDIDATE: ${m.content.replace('[Candidate]: ', '')}`
      try {
        const parsed = JSON.parse(m.content)
        return parsed.messages
          .map((msg) => `${msg.speaker.toUpperCase()} (${msg.role}): ${msg.content}`)
          .join('\n')
      } catch {
        return m.content
      }
    })
    .join('\n\n')

  try {
    // ── Panel of LLM Evaluators (PoLL) + position-swap + multi-sample vote ────
    // Replaces the old single low-temperature scoring call. We draw N samples
    // across judge personas / temperatures / position-swapped rubric orderings
    // (and across extra model families when PRISM_JUDGE_MODELS is set), then the
    // aggregator takes the median per dimension and measures judge disagreement
    // to produce an uncertainty band + a "flag for human review" signal.
    const plan = buildPanelPlan(MODEL())
    const settled = await Promise.allSettled(
      plan.map((spec) =>
        createCompletion({
          model: spec.model,
          max_completion_tokens: 2000,
          temperature: spec.temperature,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: buildScoringPrompt(scenario, transcript, {
                personaInstruction: spec.personaInstruction,
                dimensionOrder: spec.dimensionOrder,
              }),
            },
            { role: 'user', content: 'Evaluate the candidate now. Return only valid JSON.' },
          ],
        }).then((r) => ({ spec, raw: r.choices[0].message.content })),
      ),
    )

    const samples = []
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue
      try {
        const parsed = JSON.parse(result.value.raw)
        const { spec } = result.value
        samples.push({
          scores: parsed.scores || {},
          feedback: parsed.feedback || {},
          evidence: parsed.evidence || {},
          highlights: parsed.highlights,
          growthAreas: parsed.growthAreas,
          _meta: {
            id: spec.id,
            persona: spec.persona,
            model: spec.model,
            swapped: spec.swapped,
            dimensionOrder: spec.dimensionOrder,
          },
        })
      } catch {
        /* skip a malformed judge sample — the panel tolerates dropouts */
      }
    }

    if (!samples.length) {
      throw new Error('All panel judges failed to return a usable score')
    }

    const aggregated = aggregateSamples(samples)

    // Clamp + recompute overall server-side so the client can't be handed bad
    // numbers. The aggregated medians + reliability flow through sanitizeReport.
    const report = sanitizeReport(aggregated)

    // Prism v2 (MASA-2) Phase 3: per-scenario equating (flag PRISM_V2_EQUATING,
    // default off). Shifts the overall onto a common scale so the scenario a
    // candidate drew doesn't advantage/penalise them. Re-clamped 0–100; audited
    // only when it actually moves the score. v1 reproducible when off.
    if (isEquatingEnabled()) {
      const rawOverall = report.scores.overall
      const equated = await equateScore(scenario.id, rawOverall)
      if (equated !== rawOverall) {
        report.scores.overall = equated
        report.equating = { scenarioKey: scenario.id, rawOverall, delta: equated - rawOverall }
        auditLog('equating_applied', sessionId, {
          scenarioKey: scenario.id,
          rawOverall,
          equatedOverall: equated,
        })
      }
    }

    report.percentile = await computePercentile(report.scores.overall)
    report.scenario = { title: scenario.title, domain: scenario.domain }
    report.validityMonths = SCORE_VALIDITY_MONTHS

    // Phase 1 (PRISM_V2_EXECUTIVE): surface evidence coverage + whether the
    // session would have extended for thin evidence. Extend/stop math is logged;
    // early-stop stays OFF unless PRISM_V2_EARLY_STOP is set.
    if (isExecutiveEnabled() && session._persisted?.ledger) {
      const ledger = EvidenceLedger.from(session._persisted.ledger)
      const decision = stopDecision(ledger, {
        earlyStopEnabled: isEarlyStopEnabled(),
        extensionsUsed: session._persisted?.extensionsUsed || 0,
        atLimit: true,
      })
      report.evidenceCoverage = ledger.coverageMap()
      report.theta = { mean: ledger.theta.mean, var: ledger.theta.var }
      report.extended_for_evidence = decision.action === 'extend'
      auditLog('stop_decision', sessionId, decision)
    }

    // ── Phase 2 Dual-Channel Scorer (PRISM_V2_DUAL_SCORER) ───────────────────
    // The v1 panel above stays as the SHADOW / reference. When the flag is on,
    // the turn-level k-vote dual scorer becomes authoritative: its dimension
    // scores replace v1's, with a real conformal CI + reliability + review gate.
    // Failures fall back silently to the v1 report (never block scoring).
    if (isDualScorerEnabled()) {
      try {
        const candidateTurns = []
        history.forEach((m) => {
          if (m.role === 'user') {
            candidateTurns.push({ text: String(m.content).replace('[Candidate]: ', '') })
          }
        })
        // exchange_no is 1-based over candidate turns; link to persisted responses.
        const respIds = await getResponseIdsBySession(sessionId)
        const turns = candidateTurns.map((t, i) => ({
          text: t.text,
          exchangeNo: i + 1,
          responseId: respIds[i + 1] || null,
          asrConfidence: 1,
        }))
        const dual = await runDualScorer(
          { createCompletion, modelA: MODEL(), modelB: process.env.PRISM_JUDGE_MODEL_B || MODEL() },
          turns,
          report.scores, // v1 shadow scores → reconciliation reference
        )
        // Dual-channel scores become authoritative; clamp/recompute below.
        const reDual = sanitizeReport({ ...aggregated, scores: dual.scores })
        report.scores = reDual.scores
        report.percentile = await computePercentile(report.scores.overall)
        report.confidenceInterval = dual.ci
        report.reliability = { ...(report.reliability || {}), label: dual.reliability }
        report.channelB_shadow = dual.channelB
        report.scoringMeta = dual.meta
        if (dual.action === 'human_review') {
          report.reviewStatus = 'in_review'
          auditLog('human_review', sessionId, { reason: dual.reconcile.reason, gap: dual.reconcile.gap, dimension: dual.reconcile.dimension })
        }
        auditLog('dual_scoring_complete', sessionId, {
          overall: report.scores.overall,
          reliability: dual.reliability,
          action: dual.action,
          ciLow: dual.ci.low,
          ciHigh: dual.ci.high,
          provisional: dual.ci.provisional,
          unstableTurns: dual.meta.unstableTurns,
        })
      } catch (err) {
        logger.warn('dual_scorer_failed', { error: err?.message, detail: 'falling back to v1 panel report' })
      }
    }

    // Link the report to the signed-in user so it appears in their profile
    // history. Falls back to the durable session record (survives restarts).
    const persisted = await getSession(sessionId)
    report.userId = persisted?.userId || null
    report.userEmail = persisted?.userEmail || null

    // Persist the report (durable, verifiable) and free the live cache.
    const saved = await saveReport(sessionId, report)
    await sessions.delete(sessionId)

    // Phase 0 telemetry (no-op unless PRISM_V2_TELEMETRY + DB): scoring done.
    auditLog('scoring_complete', sessionId, {
      overall: report.scores?.overall ?? null,
      reliability: report.reliability?.label ?? null,
    })

    res.json(saved)
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_evaluate_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Evaluation failed' })
  }
})

// ── POST /api/assessment/verify-identity ─────────────────────────────────────
// Records the result of the pre-test document check. OCR + name matching are
// done client-side (the document images never leave the browser). We persist
// only the declared identity fields, the Aadhaar LAST 4 digits, and the match
// outcome — never the full Aadhaar number and never the images.
router.post('/verify-identity', async (req, res) => {
  const {
    sessionId, fullName, fathersName, dob,
    aadhaarLast4, college, rollNumber, nameMatch, matchScore,
  } = req.body || {}

  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' })
  if (!fullName || !String(fullName).trim()) {
    return res.status(400).json({ error: 'Full name is required.' })
  }
  if (!/^\d{4}$/.test(String(aadhaarLast4 || ''))) {
    return res.status(400).json({ error: 'Enter the last 4 digits of your Aadhaar.' })
  }

  try {
    const record = await recordVerification(sessionId, {
      fullName: String(fullName).trim(),
      fathersName: fathersName ? String(fathersName).trim() : '',
      dob: dob ? String(dob).trim() : '',
      aadhaarLast4: String(aadhaarLast4),
      college: college ? String(college).trim() : '',
      rollNumber: rollNumber ? String(rollNumber).trim() : '',
      nameMatch: Boolean(nameMatch),
      matchScore: typeof matchScore === 'number' ? matchScore : null,
      meta: { ip: req.ip, userAgent: req.headers['user-agent'] || '' },
    })
    res.json({ ok: true, status: record.status })
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_verify_identity_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Could not record verification.' })
  }
})

// ── GET /api/assessment/verify-identity/:sessionId ───────────────────────────
router.get('/verify-identity/:sessionId', async (req, res) => {
  const record = await getVerification(req.params.sessionId)
  if (!record) return res.status(404).json({ error: 'No verification on file.' })
  res.json({ status: record.status, nameMatch: record.nameMatch, at: record.at })
})

// ── GET /api/assessment/stt-status ───────────────────────────────────────────
// Lets the client know whether server-side Whisper transcription is available
// so it can choose the voice-answer path (record→Whisper) or fall back to the
// browser's live dictation when no key is configured.
router.get('/stt-status', (_req, res) => {
  res.json({ enabled: isWhisperEnabled() })
})

// ── POST /api/assessment/transcribe ──────────────────────────────────────────
// Speech-to-text for the voice-only test. Accepts a single audio file (field
// name "audio"), transcribes it via OpenAI Whisper, and returns the text. The
// audio is held in memory and discarded immediately after transcription — it is
// never written to disk or persisted. The caller then sends the transcript to
// /message exactly as if it had been typed.
router.post('/transcribe', audioUpload.single('audio'), async (req, res) => {
  if (!isWhisperEnabled()) {
    // No server-side STT configured — signal the client to fall back to the
    // browser's built-in dictation instead of failing the answer outright.
    return res.status(503).json({ error: 'Voice transcription is not configured.', fallback: 'webspeech' })
  }
  if (!req.file || !req.file.buffer?.length) {
    return res.status(400).json({ error: 'No audio uploaded.' })
  }
  try {
    const filename = req.file.originalname || 'answer.webm'
    const transcript = await transcribeAudio(req.file.buffer, filename)
    if (!transcript) {
      return res.status(422).json({ error: 'Could not understand the audio. Please try again.' })
    }
    res.json({ transcript })
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_transcribe_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Transcription failed. Please try again.' })
  }
})

// ── POST /api/assessment/event ───────────────────────────────────────────────
// Record an anti-cheat / proctoring event (tab switch, screenshot attempt …).
router.post('/event', async (req, res) => {
  const { sessionId, type, meta } = req.body || {}
  if (!sessionId || !type) return res.status(400).json({ error: 'sessionId and type required' })
  const allowed = ['tab_switch', 'screenshot_attempt', 'fullscreen_exit', 'paste', 'room_scan_complete', 'face_absent', 'multiple_faces', 'looking_away']
  if (!allowed.includes(type)) return res.status(400).json({ error: 'Unknown event type' })
  try {
    // Auth (audit C9): proctor integrity events are score-adjacent evidence —
    // they must not be injectable for arbitrary sessions. The session must
    // exist, and when it belongs to a signed-in user the caller must present
    // that user's token. (Anonymous dev sessions have no owner to verify;
    // the existence check + rate limit still applies.)
    const session = await getSession(sessionId)
    if (!session) return res.status(404).json({ error: 'Session not found' })
    const authUser = getAuthUser(req)
    if (session.userId && (!authUser || authUser.id !== session.userId)) {
      return res.status(403).json({ error: 'Not authorized for this session' })
    }
    const cleanMeta = meta && typeof meta === 'object' ? meta : {}
    await recordEvent(sessionId, type, { ...cleanMeta, _authenticated: !!authUser })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_event_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to record event' })
  }
})

// ── GET /api/assessment/report/:sessionId ────────────────────────────────────
// Durable report fetch — lets the result page survive a refresh and powers the
// public verification view (candidate name is NOT stored here, so none leaks).
router.get('/report/:sessionId', async (req, res) => {
  const report = await getReport(req.params.sessionId)
  if (!report) return res.status(404).json({ error: 'Report not found' })
  res.json(report)
})

// ── GET /api/assessment/mail-status ──────────────────────────────────────────
// Lets the client know whether server-side email delivery is configured so it
// can show/hide the "Email report" option (falls back to Download otherwise).
router.get('/mail-status', (_req, res) => {
  res.json({ enabled: isMailEnabled() })
})

// ── POST /api/assessment/send-report ─────────────────────────────────────────
// Emails the candidate's score report PDF. The PDF is rendered in the browser
// (html2canvas + jsPDF) and posted here as base64 — we never regenerate it
// server-side. A dedicated 12 MB JSON parser overrides the global 2 MB limit
// because an image-based certificate PDF can exceed it.
const reportJsonParser = expressJson({ limit: '12mb' })
router.post('/send-report', reportJsonParser, async (req, res) => {
  if (!isMailEnabled()) {
    return res.status(503).json({ error: 'Email delivery is not configured.', fallback: 'download' })
  }
  const { sessionId, email, pdfBase64, filename } = req.body || {}
  // Auth (audit C10): only the signed-in owner of a finished report may email
  // it, and ONLY to addresses tied to that report/account — never to an
  // arbitrary destination from the request body (open-relay/phishing vector).
  const authUser = getAuthUser(req)
  if (!authUser) {
    return res.status(401).json({ error: 'Sign in to email your report.', fallback: 'download' })
  }
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' })
  }
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    return res.status(400).json({ error: 'Report PDF is missing.' })
  }
  try {
    const report = await getReport(sessionId)
    if (!report) return res.status(404).json({ error: 'No completed report found for this session.' })
    if (report.userId && report.userId !== authUser.id) {
      return res.status(403).json({ error: 'This report belongs to a different account.' })
    }
    const allowedTargets = new Set(
      [report.userEmail, authUser.email].filter(Boolean).map((e) => String(e).toLowerCase()),
    )
    if (!allowedTargets.has(String(email).toLowerCase())) {
      return res.status(403).json({ error: 'Reports can only be emailed to the address on your Prism account.' })
    }
    // Accept either a raw base64 string or a data: URL.
    const base64 = pdfBase64.includes(',') ? pdfBase64.split(',').pop() : pdfBase64
    const pdfBuffer = Buffer.from(base64, 'base64')
    if (pdfBuffer.length < 1000 || pdfBuffer.length > 12 * 1024 * 1024) {
      return res.status(400).json({ error: 'Report PDF is invalid.' })
    }
    await sendReportEmail({
      to: email,
      pdfBuffer,
      meta: {
        name: report?.userName || '',
        overall: report?.scores?.overall ?? null,
        filename: filename || 'Prism-Score-Report.pdf',
      },
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_send_report_failed', requestId: req.requestId })
    res.status(502).json({ error: 'Could not send the email. Please try again or download the PDF.' })
  }
})

// ── GET /api/assessment/history ──────────────────────────────────────────────
// Authenticated test history for the signed-in user — powers the profile page.
// Returns a compact list (no transcripts) sorted newest-first.
router.get('/history', async (req, res) => {
  const authUser = getAuthUser(req)
  if (!authUser) return res.status(401).json({ error: 'Not authenticated.' })
  try {
    const reports = await getReportsByUser(authUser.id)
    const history = reports.map((r) => ({
      sessionId: r.sessionId,
      issuedAt: r.issuedAt || null,
      overall: r.scores?.overall ?? null,
      percentile: r.percentile ?? null,
      scenario: r.scenario || null,
    }))
    res.json({ history })
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_history_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to load test history.' })
  }
})

// ── Calibration prompt (shown before the live assessment) ────────────────────
const CALIBRATION_PROMPT =
  'In 3–5 sentences, describe a real situation where you had to make a difficult decision with incomplete information. What did you do, and what would you do differently now?'

// Heuristic tier estimator — works without any AI keys so the flow never blocks.
function heuristicTier(answer) {
  const text = String(answer || '').trim()
  const words = text ? text.split(/\s+/).length : 0
  const sentences = (text.match(/[.!?]+/g) || []).length
  // Reflective / reasoning signals.
  const reflective = /\b(because|however|although|therefore|trade[- ]?off|consider|reflect|in hindsight|would have|learned|alternativ)/i.test(text)
  let score = 0
  if (words >= 40) score += 1
  if (words >= 80) score += 1
  if (sentences >= 3) score += 1
  if (reflective) score += 1
  if (score >= 3) return 'advanced'
  if (score >= 1) return 'intermediate'
  return 'foundational'
}

// ── POST /api/assessment/calibrate ───────────────────────────────────────────
// Establishes the difficulty tier from a short written calibration answer.
// Doubles as a writing sample (anti-injection: real prose, scored by reasoning).
router.post('/calibrate', async (req, res) => {
  const { sessionId, answer } = req.body || {}
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

  const entitlement = await getEntitlement(sessionId)
  if (!entitlement && process.env.NODE_ENV === 'production') {
    return res.status(402).json({ error: 'Payment required.' })
  }

  let tier = heuristicTier(answer)
  let gradedBy = 'heuristic'
  // Phase 1 (PRISM_V2_EXECUTIVE): also derive a continuous Bayesian prior θ₀.
  // The v1 tier above is still computed so flag-off behavior is untouched.
  let theta0 = null

  // Try to refine the tier with the model when keys are configured; on any
  // failure we silently keep the heuristic result.
  if (answer && String(answer).trim().length > 0) {
    try {
      if (isExecutiveEnabled()) {
        // Score the writing sample on the 4 micro-anchors → θ₀ (and tier from θ).
        const completion = await createCompletion(
          {
            model: MODEL(),
            messages: [
              { role: 'system', content: loadPrompt('entry_estimator.v1') },
              { role: 'user', content: String(answer).slice(0, 2000) },
            ],
            temperature: 0,
            max_completion_tokens: 60,
            response_format: { type: 'json_object' },
          },
          { retries: 1 },
        )
        const parsed = JSON.parse(completion?.choices?.[0]?.message?.content || '{}')
        const est = anchorsToTheta(parsed)
        theta0 = { theta0_mean: est.theta0_mean, theta0_var: est.theta0_var }
        tier = thetaToTier(est.theta0_mean)
        gradedBy = 'ai_theta'
      } else {
        const completion = await createCompletion(
          {
            model: MODEL(),
            messages: [
              {
                role: 'system',
                content:
                  'You calibrate assessment difficulty. Read the candidate\'s reflective answer and judge their reasoning maturity. Respond with ONLY one word: foundational, intermediate, or advanced.',
              },
              { role: 'user', content: String(answer).slice(0, 2000) },
            ],
            temperature: 0.2,
            max_completion_tokens: 8,
          },
          { retries: 1 },
        )
        const raw = (completion?.choices?.[0]?.message?.content || '').toLowerCase()
        const match = DIFFICULTY_TIERS.find((t) => raw.includes(t))
        if (match) {
          tier = match
          gradedBy = 'ai'
        }
      }
    } catch (err) {
      logger.warn('calibrate_ai_unavailable', { error: err?.message, detail: 'using heuristic tier' })
      if (isExecutiveEnabled()) {
        theta0 = heuristicTheta(answer) // {theta0_mean, theta0_var}
        tier = thetaToTier(theta0.theta0_mean)
      }
    }
  } else if (isExecutiveEnabled()) {
    theta0 = heuristicTheta(answer)
    tier = thetaToTier(theta0.theta0_mean)
  }

  try {
    await setCalibration(sessionId, { tier, gradedBy, prompt: CALIBRATION_PROMPT, theta0 })
    if (isExecutiveEnabled() && theta0) {
      auditLog('entry_estimate', sessionId, { theta0_mean: theta0.theta0_mean, theta0_var: theta0.theta0_var, tier, gradedBy })
    }
    res.json({ ok: true, tier, prompt: CALIBRATION_PROMPT })
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_calibrate_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to save calibration' })
  }
})

// ── POST /api/assessment/consent ─────────────────────────────────────────────
// Records affirmative consent (DPDP / EU AI Act). Required before /start in the
// UI flow. Scopes now cover EVERYTHING the code actually does (audit C5/C6):
// data processing, AI disclosure, AI-scoring oversight, tab/paste proctoring,
// webcam face analysis, phone-camera frame relay, and pseudonymized
// research/calibration use. The consent copy version is recorded alongside the
// scopes so we can always prove WHICH wording a candidate accepted.
const REQUIRED_CONSENT_SCOPES = [
  'data_processing',
  'ai_disclosure',
  'ai_scoring_oversight',
  'proctoring',
  'face_analysis',
  'phone_camera_relay',
  'research_calibration',
  'own_work',
]

router.post('/consent', async (req, res) => {
  const { sessionId, scopes, consentVersion } = req.body || {}
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return res.status(400).json({ error: 'scopes (non-empty array) required' })
  }
  const missing = REQUIRED_CONSENT_SCOPES.filter((s) => !scopes.includes(s))
  if (missing.length) {
    return res.status(400).json({ error: 'All consent items must be accepted.', missing })
  }
  try {
    const meta = {
      ip: req.ip,
      userAgent: req.get('user-agent') || null,
      consentVersion: typeof consentVersion === 'string' ? consentVersion.slice(0, 64) : null,
    }
    const consent = await recordConsent(sessionId, scopes, meta)
    res.json({ ok: true, consent: { sessionId, scopes: consent.scopes, consentVersion: meta.consentVersion, at: consent.at } })
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_consent_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to record consent' })
  }
})

// ── POST /api/assessment/dispute ─────────────────────────────────────────────
// Score dispute / human-review pathway. Requires a finalised report to exist.
router.post('/dispute', async (req, res) => {
  const { sessionId, reason, contact } = req.body || {}
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
  if (!reason || String(reason).trim().length < 10) {
    return res.status(400).json({ error: 'Please describe your concern (at least 10 characters).' })
  }
  const report = await getReport(sessionId)
  if (!report) {
    return res.status(404).json({ error: 'No completed assessment found for this session.' })
  }
  try {
    const dispute = await createDispute(sessionId, String(reason).slice(0, 2000), contact || null)
    res.json({ ok: true, status: dispute.status, message: 'Your request has been submitted for human review.' })
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_dispute_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to submit dispute' })
  }
})

// ── GET /api/assessment/dispute/:sessionId ───────────────────────────────────
router.get('/dispute/:sessionId', async (req, res) => {
  const dispute = await getDispute(req.params.sessionId)
  if (!dispute) return res.status(404).json({ error: 'No dispute found' })
  res.json({ status: dispute.status, at: dispute.at })
})

// ── DELETE /api/assessment/data/:sessionId ───────────────────────────────────
// Right to erasure (DPDP) — permanently removes all data tied to a session.
router.delete('/data/:sessionId', async (req, res) => {
  const { sessionId } = req.params
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
  try {
    // Also drop any cached live session.
    if (await sessions.has(sessionId)) await sessions.delete(sessionId)
    const removed = await eraseSession(sessionId)
    res.json({ ok: true, removed })
  } catch (err) {
    logger.captureException(err, { msg: 'assessment_data_delete_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to erase data' })
  }
})

// ── POST /api/assessment/human-rating ────────────────────────────────────────
// Records a human double-rating into human_ratings (the gold anchor set that
// feeds conformal calibration + Channel B training). Admin/rater use only —
// guarded by the X-Admin-Token header matching ADMIN_TOKEN. Requires the v2
// telemetry DB. Body: { sessionId, raterId, scores:{dim:0-100}, rubricVersion }.
router.post('/human-rating', async (req, res) => {
  if (!process.env.ADMIN_TOKEN || req.get('x-admin-token') !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const { sessionId, raterId, scores, rubricVersion } = req.body || {}
  if (!sessionId || !raterId || !scores || typeof scores !== 'object') {
    return res.status(400).json({ error: 'sessionId, raterId, scores required' })
  }
  try {
    const { recordHumanRatings } = await import('../scoring/humanRatings.js')
    const n = await recordHumanRatings({ sessionId, raterId, scores, rubricVersion: rubricVersion || 'v1' })
    if (n === null) return res.status(503).json({ error: 'Telemetry DB not configured.' })
    auditLog('human_rating_recorded', sessionId, { raterId, dims: Object.keys(scores).length })
    res.json({ ok: true, recorded: n })
  } catch (err) {
    logger.captureException(err, { msg: 'human_rating_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to record human rating' })
  }
})

export default router
