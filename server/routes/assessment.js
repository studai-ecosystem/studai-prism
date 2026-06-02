import { Router } from 'express'
import OpenAI from 'openai'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

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

// ── In-memory session store (replace with Redis/DB in production) ─────────────
// Map<sessionId, { scenario, history: [{role, content}] }>
const sessions = new Map()

// ── Scenario library ──────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: 'delayed-launch',
    domain: 'Technology & Product',
    title: 'The Delayed Launch',
    context: `You are the Product Manager at FinTrack, a growing fintech startup. Your mobile app was due to launch this quarter, but engineering says they need 6 more weeks. Your top enterprise client — accounting for 30% of revenue — has threatened to leave if the app is not live within 2 weeks. Marketing has already announced the launch date and there is social media buzz building.`,
    participants: [
      { name: 'Rohan Mehta', role: 'CTO', personality: 'Protective of engineering quality, concerned about technical debt if rushed. Will push back strongly on unrealistic timelines but is open to creative solutions.' },
      { name: 'Ananya Singh', role: 'Chief Revenue Officer', personality: 'Laser-focused on client retention and revenue. Willing to make bold promises to keep the client. Impatient with technical excuses.' },
    ],
  },
  {
    id: 'ethical-ai',
    domain: 'Technology & Product',
    title: 'The Ethical AI Decision',
    context: `You are a Strategy Consultant advising RetailCo, a major retail chain that wants to implement an AI hiring system to filter 50,000 applicants per quarter. Your analysis shows that the model, trained on historical data, has statistically significant bias against certain demographic groups. The client wants full deployment in 3 weeks. Delaying could cost RetailCo ₹2 crore in manual screening costs.`,
    participants: [
      { name: 'Vikram Nair', role: 'CEO, RetailCo', personality: 'Results-driven, skeptical of bias claims, sees this as over-engineering a problem. Puts business efficiency above all.' },
      { name: 'Dr. Meera Patel', role: 'Independent AI Ethics Researcher', personality: 'Principled, data-driven. Will cite specific evidence of bias and potential legal risks. Advocates for a phased, fair approach.' },
    ],
  },
  {
    id: 'team-restructure',
    domain: 'Business & Management',
    title: 'The Team Restructure',
    context: `You are the newly appointed VP of Product at TechCorp. After a difficult quarter with 40% revenue decline, leadership has asked you to restructure your 30-person product team, potentially eliminating 8 positions. You must present a plan to the CEO in 2 days. Several team members have heard rumours and morale is fragile. The remaining team must still deliver on a major roadmap commitment.`,
    participants: [
      { name: 'Arjun Kapoor', role: 'CEO', personality: 'Expects decisive action, clear business reasoning, and minimal disruption to delivery. Will challenge you hard on the business case and people decisions.' },
      { name: 'Shreya Bansal', role: 'Senior Product Lead', personality: "Represents the team's concerns, deeply worried about morale and fairness. Will ask hard questions about process and which roles are cut." },
    ],
  },
  {
    id: 'supplier-failure',
    domain: 'Operations & Supply Chain',
    title: 'The Supplier Crisis',
    context: `You are the Operations Manager at a mid-sized electronics manufacturer in Pune. Your key component supplier in Shenzhen has missed delivery — production stops in 6 hours without the parts. You have three options: air-freight the components at 4x cost, find an alternate supplier who can deliver in 72 hours but whose quality is unproven, or halt the production line and absorb the delay penalty with your biggest OEM client.`,
    participants: [
      { name: 'Priya Desai', role: 'Head of Procurement', personality: 'Focused on cost and supplier relationships. Strongly opposed to using an unvetted supplier. Will push back on the air-freight cost.' },
      { name: 'Sandeep Rao', role: 'OEM Client Relationship Manager', personality: 'Represents the client\'s interest. Escalating urgently. The client will impose ₹40 lakh penalty if the production target is missed this quarter.' },
    ],
  },
  {
    id: 'loan-dispute',
    domain: 'Finance & Banking',
    title: 'The Loan Dispute',
    context: `You are a Branch Manager at a private bank in Chennai. A long-standing business customer, Meena Chandrasekaran, is disputing a loan rejection on her working-capital application. Your credit team followed the algorithm — her CIBIL score dropped due to a delayed payment during the COVID period that she says was a bank error. She runs a 15-year-old textile export business with consistent revenues. She needs a decision today or she misses a major export order.`,
    participants: [
      { name: 'Meena Chandrasekaran', role: 'Business Customer', personality: 'Frustrated but articulate. Has all her documents. Believes the system has failed her. Will ask sharp questions about the rejection criteria.' },
      { name: 'Kiran Bhat', role: 'Regional Credit Manager', personality: 'Follows process, risk-averse. Concerned about setting precedent if you override the credit algorithm without proper documentation.' },
    ],
  },
  {
    id: 'campus-placement',
    domain: 'Education & EdTech',
    title: 'The Placement Strategy',
    context: `You are the Head of Career Services at a Tier-2 engineering college in Coimbatore. Placement season starts in 6 weeks. Three major IT firms have pulled out of your campus citing "talent mismatch." Your top 40 students are strong, but the bottom 200 are struggling with communication and problem-solving skills. The Dean wants placement numbers to hold. You have ₹8 lakh in the career development budget.`,
    participants: [
      { name: 'Dr. Ramesh Iyer', role: 'Dean, Academic Affairs', personality: 'Wants placement percentages maintained for NAAC accreditation. Skeptical of spending budget on soft skills when technical training is the gap.' },
      { name: 'Kavitha Nair', role: 'Student Representative (Final Year)', personality: 'Represents student anxiety. Wants concrete commitments, not strategy. Will ask what will actually change in 6 weeks.' },
    ],
  },
  {
    id: 'startup-pivot',
    domain: 'Startup & Entrepreneurship',
    title: 'The Pivot Decision',
    context: `You are a co-founder of an EdTech startup with 3 months of runway left. Your current product — a live tutoring app — has 2,000 users but low retention and high CAC. You have two pivot options: a B2B play (sell to schools as a teacher-training tool, lower margin but faster enterprise contracts) or double down on B2C with an AI-personalised study plan feature your CTO says can be built in 6 weeks. Your seed investor is on a call with you tomorrow.`,
    participants: [
      { name: 'Neha Agrawal', role: 'Seed Investor', personality: 'Experienced, direct, no patience for fuzzy thinking. Wants to see your unit economics and a clear 18-month path. Will probe every assumption.' },
      { name: 'Dev Malhotra', role: 'CTO & Co-founder', personality: 'Believes in the product. Optimistic about the AI feature timeline. Uncomfortable with the B2B pivot which he sees as giving up on the vision.' },
    ],
  },
  {
    id: 'brand-crisis',
    domain: 'Sales & Marketing',
    title: 'The Brand Crisis',
    context: `You are the Marketing Director at a fast-growing D2C skincare brand. A food safety YouTuber with 2 million subscribers has posted a video claiming your bestselling moisturiser contains a harmful chemical — based on a lab test he conducted. The claim is disputed by your R&D team, but the video has 800,000 views in 12 hours. Stock is moving off shelves in two major retail chains. Your PR agency says you have a 4-hour window to respond before the news cycle picks it up.`,
    participants: [
      { name: 'Ritu Sharma', role: 'CEO', personality: "Wants to act fast. Concerned about brand equity. Willing to pull the product temporarily to show accountability, even without confirmed evidence." },
      { name: 'Dr. Anand Pillai', role: 'Head of R&D', personality: "Confident the product is safe. Strongly opposed to pulling it — believes that's an admission of guilt and sets a bad precedent. Wants to wait for official lab verification." },
    ],
  },
]

function pickScenario() {
  return SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]
}

// ── Avatar system (Phase 1: exchange-count-based rotation) ───────────────────
// Avatar 1: Curious & probing        → Critical Thinking, Communication
// Avatar 2: Challenging & constraint  → Collaboration, Problem Solving
// Avatar 3: Confused & guidance-seeking → Communication, AI & Digital Fluency

function getAvatarStyle(exchangeCount) {
  const cycle = exchangeCount % 12
  if (cycle < 4) return 1
  if (cycle < 8) return 2
  return 3
}

const AVATAR_INSTRUCTIONS = {
  1: `AVATAR STYLE — Curious and Probing.
Your behaviour: Ask follow-up questions that push the candidate to go deeper. When they give a vague answer, ask what they would look at specifically. When they make an assumption, surface it. When they make a decision, ask what information they would need to confirm it.
Signature: "That's interesting — what would you look at specifically to confirm that?" or "What are you assuming there that might not be true?"
Do NOT agree or disagree with their position. Simply probe for depth and specificity.`,
  2: `AVATAR STYLE — Challenging and Constraint-Adding.
Your behaviour: Push back on the candidate's position. Add new constraints mid-conversation — a budget cut, a new stakeholder, a tighter deadline. Disagree from your character's genuine perspective.
Signature: "But if we do that, we risk losing the client entirely. Does that change your recommendation?" or "I just heard from the board — the budget has been cut by 20%. How does that change your plan?"
Do NOT capitulate unless the candidate gives a genuinely compelling new argument.`,
  3: `AVATAR STYLE — Confused and Guidance-Seeking.
Your behaviour: Act as if you are not following the candidate's reasoning. Ask for clarification. Ask them to explain as if you are new to this topic. Require them to be clear, structured, and patient.
Signature: "I'm not sure I follow. Can you walk me through your reasoning one more time?" or "What does that mean in practice — what would I actually see happen on Monday?"
Do NOT appear to understand until the candidate has explained something clearly and with specific detail.`
}

function buildAvatarSystemPrompt(scenario, avatarStyle) {
  const [p1, p2] = scenario.participants
  return `You are running a professional scenario simulation for Prism — an AI skill assessment platform by StudAI One.

SCENARIO CONTEXT:
${scenario.context}

You will play exactly two characters:
- ${p1.name} (${p1.role}): ${p1.personality}
- ${p2.name} (${p2.role}): ${p2.personality}

${AVATAR_INSTRUCTIONS[avatarStyle]}

GENERAL RULES:
1. Stay fully in character. Each participant has a distinct perspective and agenda.
2. STRICT LIMIT: each character gets 1-2 sentences ONLY. Be blunt and punchy — no long explanations.
3. End with exactly one sharp, pointed question from one character. No soft questions.
4. After every 3 exchanges, drop a new complication (new data, budget cut, escalating pressure) in ONE sentence.
5. Never give the answer. Never compliment. Challenge specifics relentlessly.
6. Use Indian business names, currency (₹), and professional context appropriate for India.

OUTPUT FORMAT — respond with a JSON object only, no markdown, no explanation:
{
  "messages": [
    { "speaker": "${p1.name}", "role": "${p1.role}", "content": "..." },
    { "speaker": "${p2.name}", "role": "${p2.role}", "content": "..." }
  ]
}`.trim()
}

function buildScoringPrompt(scenario, transcript) {
  return `You are an expert behavioral skills evaluator for Prism by StudAI One. Evaluate a candidate's performance across 5 workplace skill dimensions based on their conversation in a simulated professional scenario.

SCENARIO: "${scenario.title}" (${scenario.domain})
${scenario.context}

FULL CONVERSATION TRANSCRIPT:
${transcript}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVALUATION FRAMEWORK — 5 DIMENSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. CRITICAL THINKING
Behavioral anchors:
- Did they identify what information was missing before deciding?
- Did they state their assumptions, or act as if their frame was certain?
- Did they reason from specific scenario facts, or from generic platitudes?
- Did they hold their position under weak pressure but update it under a strong counter-argument?

2. COLLABORATION
Behavioral anchors:
- Did they acknowledge the other party's perspective before countering?
- Did they update their view when given a genuinely good counter-argument?
- What was their conflict style? (shutdown / full capitulation / finding a third path)
- Did they build on others' ideas or only defend their own?

3. COMMUNICATION
Behavioral anchors:
- Did responses have a clear point, supporting reasoning, and implication — or were they streams of related thoughts?
- Did they use specific language or vague filler?
- Did they adjust tone when the scenario called for it?
- When their explanation didn't land, could they rephrase clearly?

4. PROBLEM SOLVING
Behavioral anchors:
- Did they acknowledge what cannot be changed, or try to solve past given limits?
- Did they produce more than one possible approach before committing?
- Did they articulate what they give up for what they gain?
- When a new constraint was introduced, did they integrate it or start from scratch?

5. AI & DIGITAL FLUENCY
Behavioral anchors:
- Did they reference AI tools, data systems, or digital approaches where relevant?
- Did they think in terms of automation, data analysis, or AI-assisted decision-making?
- Did they question whether information could be biased or algorithmically generated?
- Did they show awareness of tasks AI should do vs tasks requiring human judgment?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORING GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
90-100: Exceptional | 75-89: Strong | 60-74: Competent | 40-59: Developing | 0-39: Early stage

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

  const scenario = pickScenario()

  const openingPrompt = `Begin the scenario now. Each character: one sentence introducing themselves + one sentence on the crisis. Then one sharp direct question requiring the candidate to take a position immediately. Total response must be 3 sentences across both characters combined. Maximum urgency, zero padding.`

  try {
    const avatarSystem = buildAvatarSystemPrompt(scenario, 1) // Avatar 1 for opening

    const response = await getClient().chat.completions.create({
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

    // Store session — track exchange count for avatar rotation
    sessions.set(sessionId, {
      scenario,
      exchangeCount: 0,
      history: [
        { role: 'user', content: openingPrompt },
        { role: 'assistant', content: raw },
      ],
    })

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
    console.error('[assessment/start]', err)
    res.status(500).json({ error: 'Failed to start assessment' })
  }
})

// ── POST /api/assessment/message ─────────────────────────────────────────────
router.post('/message', async (req, res) => {
  const { sessionId, message } = req.body
  if (!sessionId || !message) return res.status(400).json({ error: 'sessionId and message required' })
  if (typeof message !== 'string' || message.length > 4000) {
    return res.status(400).json({ error: 'Invalid message' })
  }

  const session = sessions.get(sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found or expired' })

  const { scenario, history, exchangeCount } = session

  // Rotate avatar style based on exchange count
  const nextExchangeCount = exchangeCount + 1
  const avatarStyle = getAvatarStyle(nextExchangeCount)
  const avatarSystem = buildAvatarSystemPrompt(scenario, avatarStyle)

  // Append candidate's message
  const updatedHistory = [
    ...history,
    { role: 'user', content: `[Candidate]: ${message}` },
  ]

  try {
    const response = await getClient().chat.completions.create({
      model: MODEL(),
      max_completion_tokens: 350,
      temperature: 0.85,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: avatarSystem },
        ...updatedHistory,
      ],
    })

    const raw = response.choices[0].message.content
    const parsed = JSON.parse(raw)

    // Update session history and exchange count
    session.history = [
      ...updatedHistory,
      { role: 'assistant', content: raw },
    ]
    session.exchangeCount = nextExchangeCount

    res.json(parsed)
  } catch (err) {
    console.error('[assessment/message]', err)
    res.status(500).json({ error: 'Failed to get AI response' })
  }
})

// ── POST /api/assessment/evaluate ─────────────────────────────────────────────
router.post('/evaluate', async (req, res) => {
  const { sessionId } = req.body
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

  const session = sessions.get(sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found or expired' })

  const { scenario, history } = session

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
    const response = await getClient().chat.completions.create({
      model: MODEL(),
      max_completion_tokens: 2000,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildScoringPrompt(scenario, transcript) },
        { role: 'user', content: 'Evaluate the candidate now. Return only valid JSON.' },
      ],
    })

    const raw = response.choices[0].message.content
    const report = JSON.parse(raw)

    // Clean up session after evaluation
    sessions.delete(sessionId)

    res.json(report)
  } catch (err) {
    console.error('[assessment/evaluate]', err)
    res.status(500).json({ error: 'Evaluation failed' })
  }
})

export default router
