// server/lib/competencyModelV2.js — Prism Next Two-Layer Competency Framework
// Scientific foundation: AERA/APA/NCME Standards, EEOC UGESP (29 C.F.R. § 1607)

export const LAYER_1_TRANSFERABLE_CAPABILITIES = {
  'CAP-L1-REASONING': {
    id: 'CAP-L1-REASONING',
    name: 'Reasoning & Decision Quality',
    layer: 'LAYER_1',
    description: 'Dissects complex, ambiguous business situations, surfaces assumptions, evaluates trade-offs under uncertainty, and articulates coherent decision rationale.',
    legacyKeys: ['criticalThinking', 'problemSolving'],
    anchors: {
      1: { label: 'Uncritical / Reactive', criteria: 'Accepts initial claims at face value; ignores contradictory data; makes impulsive assertions.' },
      2: { label: 'Superficial Analysis', criteria: 'Relies on obvious surface patterns; misses underlying assumptions; fails to weigh alternatives.' },
      3: { label: 'Competent Reasoning', criteria: 'Explicitly identifies assumptions; analyzes pros and cons; cites data to justify conclusions.' },
      4: { label: 'Advanced Rigor', criteria: 'Actively seeks disconfirming evidence; quantifies trade-offs; articulates risk-mitigation contingencies.' },
      5: { label: 'Exemplary Judgment', criteria: 'Synthesizes conflicting data into optimal strategic paths; resolves competing constraints.' }
    }
  },
  'CAP-L1-COMMUNICATION': {
    id: 'CAP-L1-COMMUNICATION',
    name: 'Communication & Structure',
    layer: 'LAYER_1',
    description: 'Structures information logically, conveys key points with clarity and conciseness, adapts tone to diverse stakeholders, and listens actively.',
    legacyKeys: ['communication'],
    anchors: {
      1: { label: 'Disorganized / Unclear', criteria: 'Rambling, disjointed message; buries recommendations; ignores audience context.' },
      2: { label: 'Basic Transmission', criteria: 'Transmits facts without clear logical hierarchy; requires follow-up probes for clarity.' },
      3: { label: 'Structured & Clear', criteria: 'Organizes thoughts with clear headings or bulleted rationale; leads with key takeaway.' },
      4: { label: 'High-Impact Synthesis', criteria: 'Translates complex analytical data into compelling executive summaries concisely.' },
      5: { label: 'Masterful Communication', criteria: 'Achieves maximum conceptual clarity with zero fluff; aligns disparate stakeholders.' }
    }
  },
  'CAP-L1-COLLABORATION': {
    id: 'CAP-L1-COLLABORATION',
    name: 'Collaboration & Navigation',
    layer: 'LAYER_1',
    description: 'Understands competing perspectives, navigates constructive conflict, builds alignment, and achieves shared operational goals without friction.',
    legacyKeys: ['collaboration'],
    anchors: {
      1: { label: 'Combative / Dismissive', criteria: 'Ignores stakeholder objections; pushes rigid personal agenda; creates friction.' },
      2: { label: 'Passive / Avoidant', criteria: 'Acknowledges disagreement but defers decisions without resolving tensions.' },
      3: { label: 'Constructive Partner', criteria: 'Validates colleague perspectives; explains rationale; finds workable compromises.' },
      4: { label: 'Diplomatic Align-er', criteria: 'Diagnoses root causes of friction; reframes competing priorities into shared wins.' },
      5: { label: 'Strategic Coalition Builder', criteria: 'Navigates complex political dynamics effortlessly; turns resistance into advocacy.' }
    }
  },
  'CAP-L1-ADAPTABILITY': {
    id: 'CAP-L1-ADAPTABILITY',
    name: 'Adaptability & Learning',
    layer: 'LAYER_1',
    description: 'Maintains composure and effectiveness when constraints or deadlines change suddenly; rapidly incorporates feedback into revised plans.',
    legacyKeys: ['problemSolving'],
    anchors: {
      1: { label: 'Rigid / Defensive', criteria: 'Clings to failed initial strategy despite explicit new constraints or negative feedback.' },
      2: { label: 'Reluctant Adjustment', criteria: 'Adjusts only after repeated prompts; makes minimal cosmetic tweaks.' },
      3: { label: 'Open & Responsive', criteria: 'Calmly adjusts plan when budget/deadlines shift; incorporates feedback quickly.' },
      4: { label: 'Proactive Pivot', criteria: 'Rapidly re-evaluates priorities under sudden shocks; finds alternative routes.' },
      5: { label: 'Anti-Fragile Learning', criteria: 'Converts unexpected setbacks into superior long-term strategic advantages.' }
    }
  },
  'CAP-L1-EXECUTION': {
    id: 'CAP-L1-EXECUTION',
    name: 'Execution & Ownership',
    layer: 'LAYER_1',
    description: 'Translates strategic analysis into concrete, prioritized action plans; anticipates bottlenecks; establishes accountability for outcomes.',
    legacyKeys: ['problemSolving'],
    anchors: {
      1: { label: 'Vague / Non-Committal', criteria: 'Offers generic advice without concrete next steps; leaves tasks unassigned.' },
      2: { label: 'Theoretical Planning', criteria: 'Lists steps but ignores resource constraints, dependencies, or realistic timelines.' },
      3: { label: 'Actionable Ownership', criteria: 'Outlines phased next steps with clear task ownership, deadlines, and resource needs.' },
      4: { label: 'Operational Excellence', criteria: 'Anticipates roadblocks; builds buffer contingencies; prioritizes high-impact wins.' },
      5: { label: 'Relentless Delivery', criteria: 'End-to-end accountability with measurable KPIs and automatic feedback loops.' }
    }
  }
}

export const LAYER_2_MARKETING_CAPABILITIES = {
  'CAP-MKT-CUST-INSIGHT': {
    id: 'CAP-MKT-CUST-INSIGHT',
    name: 'Customer & Audience Insight',
    layer: 'LAYER_2',
    description: 'Analyzes customer qualitative feedback, reviews, and behavioral data to uncover unarticulated emotional triggers, pain points, and churn causes.',
    critical: true,
    anchors: {
      1: { label: 'Surface Observer', criteria: 'Quotes feedback verbatim without understanding underlying intent; confuses outliers with trends.' },
      2: { label: 'Basic Synthesizer', criteria: 'Groups reviews into generic buckets without connecting pain to messaging or product.' },
      3: { label: 'Insightful Diagnostician', criteria: 'Identifies root cause of dissatisfaction; separates repeat-buyer sentiment from first-timers.' },
      4: { label: 'Behavioral Profiler', criteria: 'Uncovers psychological friction in reviews; segments users by job-to-be-done.' },
      5: { label: 'Audience Visionary', criteria: 'Predicts emergent consumer expectations; identifies unexploited market segments.' }
    }
  },
  'CAP-MKT-POSITIONING': {
    id: 'CAP-MKT-POSITIONING',
    name: 'Positioning & Messaging Judgment',
    layer: 'LAYER_2',
    description: 'Defines why a product is uniquely suited to solve a specific problem and crafts clear, differentiated messaging angles.',
    critical: true,
    anchors: {
      1: { label: 'Generic Cliché', criteria: 'Writes cliché-ridden copy ("best quality at lowest price"); zero unique proof points.' },
      2: { label: 'Feature Listing', criteria: 'Lists product features rather than benefits; fails to differentiate from competitors.' },
      3: { label: 'Benefit-Driven Framing', criteria: 'Translates features into desirable customer outcomes with recognizable hooks.' },
      4: { label: 'Sharpened Differentiation', criteria: 'Crafts distinct positioning attacking competitor weaknesses with clear Reasons to Believe.' },
      5: { label: 'Master Brand Strategist', criteria: 'Constructs an unmistakable market narrative making the product the only logical choice.' }
    }
  },
  'CAP-MKT-EXPERIMENTATION': {
    id: 'CAP-MKT-EXPERIMENTATION',
    name: 'Marketing Experimentation',
    layer: 'LAYER_2',
    description: 'Validates hypotheses through structured testing (A/B, split, incrementality), establishing controls, and interpreting statistical results.',
    critical: true,
    anchors: {
      1: { label: 'Impulsive Tweaker', criteria: 'Changes 5 variables at once; declares victory prematurely; no baseline control.' },
      2: { label: 'Basic Splitter', criteria: 'Understands A/B testing, but tests trivial elements and stops before statistical power.' },
      3: { label: 'Hypothesis Tester', criteria: 'Formulates clean "If / Then / Because" hypotheses; isolates single variables; sets sample size.' },
      4: { label: 'Rigorous Experimenter', criteria: 'Accounts for novelty bias and seasonality; calculates minimum detectable effect (MDE).' },
      5: { label: 'Scientific Growth Lead', criteria: 'Designs multi-variate tests; builds rapid feedback loops compounding growth velocity.' }
    }
  },
  'CAP-MKT-CHANNEL-JUDGMENT': {
    id: 'CAP-MKT-CHANNEL-JUDGMENT',
    name: 'Channel & Distribution Judgment',
    layer: 'LAYER_2',
    description: 'Matches media channel mechanics (search, paid social, influencers, email) to product unit economics and customer intent.',
    critical: false,
    anchors: {
      1: { label: 'Channel Blind', criteria: 'Treats all platforms identically without adapting formats or messaging.' },
      2: { label: 'Tactical Deployer', criteria: 'Chooses channels based on hype rather than intent or margin requirements.' },
      3: { label: 'Intent-Aligned Allocator', criteria: 'Distinguishes high-intent pull channels from interruption push channels.' },
      4: { label: 'Strategic Media Architect', criteria: 'Models channel saturation curves and declining marginal returns.' },
      5: { label: 'Growth Engine Designer', criteria: 'Architects self-reinforcing distribution loops aligning with payback periods.' }
    }
  },
  'CAP-MKT-CAMPAIGN-ANALYTICS': {
    id: 'CAP-MKT-CAMPAIGN-ANALYTICS',
    name: 'Campaign Analytics',
    layer: 'LAYER_2',
    description: 'Audits multi-touch marketing dashboards, calculates unit economics (CAC, LTV, ROAS, MER), and detects attribution distortions.',
    critical: false,
    anchors: {
      1: { label: 'Vanity Metric Chaser', criteria: 'Focuses on impressions and likes while ignoring CAC, conversion rates, and revenue.' },
      2: { label: 'Dashboard Reader', criteria: 'Reads top-line ROAS accurately but accepts platform attribution blindly.' },
      3: { label: 'Unit Economics Analyst', criteria: 'Accurately calculates blended vs. paid CAC, contribution margin, and churn cohorts.' },
      4: { label: 'Forensic Data Diagnostician', criteria: 'Triangulates GA4, platform pixels, and CRM data; detects attribution decay.' },
      5: { label: 'Commercial Econometrician', criteria: 'Constructs media-mix models (MMM); isolates true marketing incrementality.' }
    }
  },
  'CAP-MKT-BUDGET-JUDGMENT': {
    id: 'CAP-MKT-BUDGET-JUDGMENT',
    name: 'Commercial / Budget Judgment',
    layer: 'LAYER_2',
    description: 'Prudently allocates finite capital, balancing short-term cash flow with long-term retention and commercial trade-offs.',
    critical: false,
    anchors: {
      1: { label: 'Fiscally Reckless', criteria: 'Spends entire budget on unproven experiments; ignores burn rate.' },
      2: { label: 'Passive Allocator', criteria: 'Divides budget evenly across channels regardless of ROI; hesitant to cut losers.' },
      3: { label: 'Commercial Prudence', criteria: 'Allocates 70% to proven channels and 30% to high-potential bets with stop-losses.' },
      4: { label: 'ROI Optimizer', criteria: 'Reallocates capital dynamically based on real-time marginal returns and runway.' },
      5: { label: 'Venture Capitalist Mindset', criteria: 'Manages marketing spend like an investment portfolio maximizing enterprise value.' }
    }
  }
}

export const CONTEXTUAL_DIGITAL_CAPABILITIES = {
  'CAP-DIG-AI-MARKETING': {
    id: 'CAP-DIG-AI-MARKETING',
    name: 'AI-Assisted Marketing Judgment',
    layer: 'DIGITAL',
    description: 'Evaluates prompt design, synthetic content critical review, and AI analytics hallucination detection in campaign planning.',
    anchors: {
      1: { label: 'Naive Consumer', criteria: 'Copies and pastes generic LLM copy without editing; accepts fabricated stats.' },
      2: { label: 'Basic Editor', criteria: 'Uses AI for basic proofreading but allows robotic tone to reach production.' },
      3: { label: 'Discerning Director', criteria: 'Crafts detailed prompts with constraints; fact-checks AI; injects customer voice.' },
      4: { label: 'Workflow Multiplier', criteria: 'Synthesizes hundreds of reviews with AI; builds variant prompt workflows.' },
      5: { label: 'Strategic AI Architect', criteria: 'Integrates AI safely into marketing operations with strict brand/copyright guardrails.' }
    }
  }
}

/**
 * Returns all active capabilities for a given blueprint definition
 */
export function getBlueprintCapabilities(blueprint) {
  if (!blueprint) return Object.values(LAYER_1_TRANSFERABLE_CAPABILITIES)
  const l1 = blueprint.layer1_transferable_capabilities || Object.values(LAYER_1_TRANSFERABLE_CAPABILITIES)
  const l2 = blueprint.layer2_role_capabilities || []
  const dig = blueprint.contextual_digital_capability?.active ? [blueprint.contextual_digital_capability] : []
  return [...l1, ...l2, ...dig]
}
