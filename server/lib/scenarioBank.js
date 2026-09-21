// server/lib/scenarioBank.js — Approved Scenario Bank for Prism Next Simulations
// Implements controlled scenario loading (no random runtime generation for high stakes)

export const PRE_APPROVED_SCENARIOS = {
  'prism-sim-mkt-l1': {
    scenarioId: 'SCEN-MKT-LUMINA-01',
    blueprintId: 'STUDAI-JF-MKT-L1',
    version: '1.0.0',
    title: 'Lumina Botanicals — D2C Growth & Retention Turnaround',
    briefing: {
      background: 'Lumina Botanicals is an organic D2C skincare brand based in Bangalore. Over the past 60 days, blended Customer Acquisition Cost (CAC) has inflated by 48% (from ₹1,100 to ₹1,640) and Meta ROAS has dropped to 1.15x (break-even is 1.70x).',
      role: 'Associate Growth Marketing Specialist',
      objective: 'Audit paid channels and customer feedback, identify the root cause of CAC inflation, and recommend an actionable 30-day budget reallocation and experimentation plan.',
      characters: [
        { name: 'Elena Vance', role: 'Founder & CEO', persona: 'Visionary, impatient, skeptical of marketing agency jargon' },
        { name: 'Marcus Chen', role: 'Head of Performance Marketing', persona: 'Analytical, defensive of ad spend, believes TikTok Spark ads will fix everything' }
      ]
    },
    interactiveArtifacts: [
      {
        artifactId: 'ART-DASH-01',
        type: 'ANALYTICS_DASHBOARD',
        title: 'Paid Media & Unit Economics Dashboard (Last 90 Days)',
        data: {
          blendedCac: 1640,
          blendedRoas: 1.38,
          channels: [
            { name: 'Meta Ads (FB/IG)', spend: 650000, cac: 1850, roas: 1.15, ctr: 1.12, cvr: 1.40, status: 'Burning Cash' },
            { name: 'Google Search (PPC)', spend: 220000, cac: 980, roas: 2.45, ctr: 4.20, cvr: 3.80, status: 'Highly Profitable / Budget Capped' },
            { name: 'TikTok / Reels Ads', spend: 130000, cac: 2400, roas: 0.82, ctr: 0.95, cvr: 0.80, status: 'Heavy Loss Maker' }
          ]
        }
      },
      {
        artifactId: 'ART-FEEDBACK-02',
        type: 'CUSTOMER_TICKET_LOG',
        title: 'Customer Reviews & Escalation Tickets (Recent 150 Sample)',
        data: {
          tickets: [
            { id: 'TIK-401', rating: 1, customer: 'Pooja M.', comment: 'Bought Radiant Serum for 2 years. Latest bottle smells like synthetic alcohol! Broke out immediately. What changed?' },
            { id: 'TIK-409', rating: 2, customer: 'Arun K.', comment: 'Ad promised 3-day delivery. Took 16 days to reach Pune, box was crushed and bottle was leaking. Terrible logistics.' },
            { id: 'TIK-418', rating: 5, customer: 'Sneha R.', comment: 'Holy grail serum! But why did you remove the 20% subscribe & save option? I hate re-entering payment every month.' },
            { id: 'TIK-432', rating: 1, customer: 'Divya S.', comment: 'Formula change gave me an allergic rash. Instagram support just sent a 10% coupon code instead of answering. Never buying again.' }
          ]
        }
      },
      {
        artifactId: 'ART-BUDGET-03',
        type: 'BUDGET_MODELER',
        title: '30-Day Budget Reallocation Model',
        data: {
          totalBudget: 500000,
          allocations: {
            metaSpend: 200000,
            searchSpend: 180000,
            retentionSpend: 80000,
            experimentationSpend: 40000
          },
          constraints: {
            maxTotal: 500000,
            minRetention: 50000
          }
        }
      }
    ],
    probingTree: {
      initialPrompt: "Thanks for jumping on this call so quickly. You've seen the board dashboard—our CAC is up 48% and we're burning cash. Marcus wants to double our TikTok influencer budget, but I'm nervous. Take a look at the data. What do you see as the real reason our CAC is skyrocketing, and what's your initial diagnosis?",
      turns: [
        {
          turn: 1,
          speaker: 'Elena Vance (CEO)',
          targetCapability: 'CAP-MKT-CUST-INSIGHT'
        },
        {
          turn: 2,
          speaker: 'Marcus Chen (Performance Lead)',
          targetCapability: 'CAP-L1-COLLABORATION',
          pushback: "Look, with all respect, customer support tickets are just vocal complainers—less than 3% of our volume. The real issue is that Meta's algorithm is saturated because our ad creative has been running for 6 weeks. Why shouldn't we just test 20 new video hooks on TikTok?"
        },
        {
          turn: 3,
          speaker: 'Elena Vance (CEO)',
          targetCapability: 'CAP-MKT-BUDGET-JUDGMENT',
          prompt: "Alright, we have ₹5,00,000 to deploy over the next 30 days. Open the Budget Tab and set the numbers, then explain your commercial trade-off rationale."
        },
        {
          turn: 4,
          speaker: 'Marcus Chen (Performance Lead)',
          targetCapability: 'CAP-MKT-EXPERIMENTATION',
          prompt: "Fine, if we test a new messaging angle to win back skeptics, how exactly do you propose we test it? What is your hypothesis and sample size requirement?"
        },
        {
          turn: 5,
          speaker: 'Elena Vance (CEO)',
          targetCapability: 'CAP-L1-ADAPTABILITY',
          prompt: "Bad news. Our logistics partner notified us that deliveries to North India are delayed by 10 days due to a regional strike. Comments are blowing up. Marcus wants to pause all ads immediately. What do we do right now?"
        },
        {
          turn: 6,
          speaker: 'Elena Vance (CEO)',
          targetCapability: 'CAP-L1-COMMUNICATION',
          prompt: "I'm heading into an emergency board meeting in 15 minutes. Give me your 3-bullet summary of our 30-day turnaround plan and why the board should believe it will work."
        }
      ]
    }
  }
}

export function getScenarioByAssessmentId(assessmentDefinitionId) {
  return PRE_APPROVED_SCENARIOS[assessmentDefinitionId] || PRE_APPROVED_SCENARIOS['prism-sim-mkt-l1']
}
