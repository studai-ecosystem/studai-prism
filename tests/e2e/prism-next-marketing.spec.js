// tests/e2e/prism-next-marketing.spec.js — End-to-End Verification for PRISM Next Phases 0–10
import { test, expect } from '@playwright/test'

const TEST_SESSION_ID = 'test-mkt-session-' + Date.now()

test.describe('PRISM NEXT — Marketing Reference Implementation (Phases 0–10)', () => {
  test('1. Occupational Graph API serves STUDAI-JF-MKT-L1 blueprint & neighborhood', async ({ request }) => {
    const res = await request.get('/api/job-families/STUDAI-JF-MKT-L1')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.blueprint).toBeDefined()
    expect(data.blueprint.job_family_id).toBe('STUDAI-JF-MKT-L1')
    expect(data.blueprint.name).toContain('Marketing & Growth')
    expect(data.blueprint.capabilities.length).toBeGreaterThanOrEqual(4)

    // Verify neighborhood edges
    const neighRes = await request.get('/api/job-families/STUDAI-JF-MKT-L1/neighborhood')
    expect(neighRes.status()).toBe(200)
    const neigh = await neighRes.json()
    expect(neigh.edges.length).toBeGreaterThanOrEqual(3)
  })

  test('2. Interactive Workspace renders dual-pane simulation & work artifacts', async ({ page }) => {
    // Navigate to live interactive simulation workspace
    await page.goto(`/workspace/${TEST_SESSION_ID}`)

    // Verify workspace title and header
    await expect(page.locator('h1')).toContainText('Lumina Botanicals')
    await expect(page.locator('text=Elena Vance (CEO)')).toBeVisible({ timeout: 10000 })

    // Verify artifact tabs
    await expect(page.locator('button:has-text("Paid Media Dashboard")')).toBeVisible()
    await expect(page.locator('button:has-text("Customer Tickets")')).toBeVisible()
    await expect(page.locator('button:has-text("30-Day Budget Modeler")')).toBeVisible()

    // 2.1 Tab 1: Paid Media Dashboard inspection
    await expect(page.locator('text=CAC +48% Over Baseline')).toBeVisible()
    await expect(page.locator('text=₹1,640')).toBeVisible()
    await expect(page.locator('text=Meta Ads (FB/IG)')).toBeVisible()
    await expect(page.locator('text=Google Search (PPC)')).toBeVisible()

    // 2.2 Tab 2: Customer Tickets exploration & tagging
    await page.click('button:has-text("Customer Tickets")')
    await expect(page.locator('text=Qualitative Intelligence Feed')).toBeVisible()
    await expect(page.locator('text=TIK-401')).toBeVisible()
    // Tag first ticket as evidence
    const tagButton = page.locator('button:has-text("+ Tag as Evidence")').first()
    await tagButton.click()
    await expect(page.locator('text=1 Root Causes')).toBeVisible()

    // 2.3 Tab 3: Budget Modeler manipulation & deployment
    await page.click('button:has-text("30-Day Budget Modeler")')
    await expect(page.locator('text=Resource Allocation & Commercial Modeler')).toBeVisible()
    await expect(page.locator('text=Save & Deploy 30-Day Plan')).toBeVisible()
    await page.click('button:has-text("Save & Deploy 30-Day Plan")')
    await expect(page.locator('text=Model Deployed to Session')).toBeVisible({ timeout: 6000 })

    // 2.4 Send simulation dialogue turn
    const input = page.locator('textarea[placeholder*="Type your strategic analysis"]')
    await input.fill('I analyzed our dashboard and review logs. Google Search is highly profitable at 2.45x ROAS and should receive more budget. We must cap Meta and pause TikTok to fix product formula and logistics churn.')
    await page.click('button:has-text("Send")')
    await expect(page.locator('text=Turns: 1/5')).toBeVisible({ timeout: 5000 })
  })

  test('3. Student Report V2 renders all 12 comprehensive capability intelligence sections', async ({ page }) => {
    await page.goto(`/report/${TEST_SESSION_ID}/v2`)

    // Verify Executive Summary & Trust Badges
    await expect(page.locator('text=Analytical Growth Strategist')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Verified by StudAI Prism')).toBeVisible()
    await expect(page.locator('text=Job-Ready (Associate Growth Specialist)')).toBeVisible()

    // Section 2: Methodological Integrity
    await expect(page.locator('text=Standard Error (SEM)')).toBeVisible()
    await expect(page.locator('text=±3.1 pts').first()).toBeVisible()

    // Section 3: Layer 1 Transferable Capabilities
    await expect(page.locator('text=Problem Solving')).toBeVisible()
    await expect(page.locator('text=Professional Communication')).toBeVisible()
    await expect(page.locator('text=Collaboration & Stakeholder Alignment')).toBeVisible()

    // Section 4: Layer 2 Role-Specific Marketing Capabilities
    await expect(page.locator('text=Customer Insight & Behavioral Diagnosis')).toBeVisible()
    await expect(page.locator('text=Paid Acquisition & Unit Economics')).toBeVisible()
    await expect(page.locator('text=Budget Judgment & Commercial Modeler')).toBeVisible()

    // Section 5: Applied Work Demonstration
    await expect(page.locator('text=Lumina Botanicals — D2C Growth & Retention Turnaround').first()).toBeVisible()
    await expect(page.locator('text=Paid Media & Unit Economics Dashboard').first()).toBeVisible()

    // Section 7: Explainable Career Exploration
    await expect(page.locator('text=Tier 1: Strong Match').first()).toBeVisible()
    await expect(page.locator('text=Tier 2: High Growth Potential').first()).toBeVisible()
    await expect(page.locator('text=Tier 3: Adjacent Exploration').first()).toBeVisible()

    // Section 10: 30 / 60 / 90 Day Development Plan
    await expect(page.locator('text=Days 1–30').first()).toBeVisible()
    await expect(page.locator('text=Days 31–60').first()).toBeVisible()
    await expect(page.locator('text=Days 61–90').first()).toBeVisible()

    // Section 11: Recommended Development Missions
    await expect(page.locator('text=MIS-MKT-EXP-01').first()).toBeVisible()
    await expect(page.locator('text=Creative Fatigue vs Channel Saturation A/B Test').first()).toBeVisible()

    // Section 12: Employer Interpretation Guide
    await expect(page.locator('text=Hiring Manager Decision Framework').first()).toBeVisible()
  })

  test('4. Employee Report V2 renders internal mobility & gap diagnostic', async ({ page }) => {
    await page.goto(`/report/${TEST_SESSION_ID}/employee`)

    await expect(page.locator('text=Employee Career Mobility Diagnostic')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Grow Mode')).toBeVisible()
    await expect(page.locator('text=Mobility Readiness Score')).toBeVisible()
    await expect(page.locator('text=82%')).toBeVisible()
    await expect(page.locator('text=94% carryover')).toBeVisible()
    await expect(page.locator('text=Diagnostic Gap Analysis')).toBeVisible()
    await expect(page.locator('text=Recommended Internal Mobility Pathways')).toBeVisible()
  })

  test('5. Development Mission player executes 20-minute deliberate practice & feedback', async ({ page }) => {
    await page.goto('/missions/MIS-MKT-EXP-01')

    await expect(page.locator('h1')).toContainText('Creative Fatigue vs Channel Saturation A/B Test')
    await expect(page.locator('text=⏱️')).toBeVisible()

    // Formulate test hypothesis
    const hypothesisInput = page.locator('textarea[placeholder*="If we replace the lifestyle"]')
    await hypothesisInput.fill('If we replace the generic lifestyle hero shot with a 3-second dermatologist texture demonstration in the video hook, then CTR will increase by ≥40% because customers are anxious about formula authenticity.')

    // Submit deliberate practice
    await page.click('button:has-text("Deploy Experiment & Submit Mission")')

    // Verify evaluation outcome card
    await expect(page.locator('text=Rubric Level 4 Achieved!')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('text=Feedback from Expert Rater Model:')).toBeVisible()
    await expect(page.locator('text=Candidate isolated single variable in A/B test parameter designer.')).toBeVisible()
  })
})
