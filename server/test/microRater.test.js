import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLevels, microRateTurn } from '../engine/microRater.js'
import { DIMENSIONS } from '../engine/executiveConfig.js'

test('normalizeLevels coerces every dimension to 0-4 or "NA"', () => {
  const out = normalizeLevels({ criticalThinking: 3, communication: '4', collaboration: 'NA', problemSolving: 9, aiDigitalFluency: undefined })
  assert.equal(out.criticalThinking, 3)
  assert.equal(out.communication, 4)
  assert.equal(out.collaboration, 'NA')
  assert.equal(out.problemSolving, 'NA') // 9 is out of range → NA
  assert.equal(out.aiDigitalFluency, 'NA')
  // Always returns all dimensions.
  for (const d of DIMENSIONS) assert.ok(d in out)
})

test('microRateTurn returns null on empty text (never throws)', async () => {
  const r = await microRateTurn('', { createCompletion: async () => ({}), model: 'x' })
  assert.equal(r, null)
})

test('microRateTurn returns null when the model errors (graceful)', async () => {
  const r = await microRateTurn('a real answer', {
    createCompletion: async () => { throw new Error('boom') },
    model: 'x',
  })
  assert.equal(r, null)
})

test('microRateTurn parses a valid model JSON response', async () => {
  const fake = {
    choices: [{ message: { content: JSON.stringify({ criticalThinking: 2, communication: 3, collaboration: 'NA', problemSolving: 1, aiDigitalFluency: 'NA' }) } }],
  }
  const r = await microRateTurn('a real answer', { createCompletion: async () => fake, model: 'x' })
  assert.equal(r.criticalThinking, 2)
  assert.equal(r.collaboration, 'NA')
})
