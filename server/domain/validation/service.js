// V3 evidence double-rating service (spec §45, §48; C12.01). StudAI staff
// queue a session's evidence units (identity-free items); qualified raters
// take blinded items one at a time; agreement is computed descriptively.
// Nothing here writes a score, changes a report or unlocks a claim.
import { ApiError } from '../http/errors.js'
import { capabilityInfo } from '../assessments/catalog.js'
import { ratingItemFrom, pickNext, blindedView, RATINGS_PER_ITEM } from './ratingQueue.js'
import { agreementReport } from './agreement.js'

export function createValidationService({
  repos, evidence = { units: async () => [] }, candidateNameFor = async () => null, sessionState = async () => null,
  salt = process.env.PRISM_RATING_REF_SALT || 'prism-rating-v1',
}) {
  const store = () => {
    if (!repos?.validation) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The rating queue is temporarily unavailable.')
    return repos.validation
  }
  return {
    async enqueueSession(sessionId, { enqueuedBy }) {
      // Held or invalidated sessions are not validation data (K59).
      const state = await sessionState(sessionId)
      if (state?.invalid || state?.reviewState === 'held') throw new ApiError('CONFLICT', 'This session is held or invalidated and cannot be rated.')
      const units = await evidence.units(sessionId)
      if (!units.length) throw new ApiError('NOT_FOUND', 'No evidence units for this session.')
      // Fail closed: without the candidate's name it cannot be removed from
      // the excerpts, so nothing is queued (a lookup error propagates).
      const candidateName = await candidateNameFor(sessionId)
      if (!candidateName) throw new ApiError('CONFLICT', 'The candidate identity for this session is unknown, so it cannot be removed from the excerpts. Nothing was queued.')
      const out = { enqueued: 0, alreadyQueued: 0, skipped: {} }
      for (const unit of units) {
        const r = ratingItemFrom(unit, { candidateName, salt, enqueuedBy })
        if (r.skip) { out.skipped[r.skip] = (out.skipped[r.skip] || 0) + 1; continue }
        const { created } = await store().upsertItem(r.item)
        if (created) out.enqueued += 1
        else out.alreadyQueued += 1
      }
      return out
    },

    async nextFor(raterId) {
      const [items, ratings] = await Promise.all([store().listItems(), store().listRatings()])
      const item = pickNext(items, ratings, raterId)
      return item ? blindedView(item, { capabilityName: capabilityInfo(item.capabilityId)?.name || null }) : null
    },

    async submit(raterId, itemId, { level = null, cannotRate = false }) {
      const item = await store().getItem(itemId)
      if (!item) throw new ApiError('NOT_FOUND', 'Not found')
      const ratings = (await store().listRatings()).filter((r) => r.itemId === item.id)
      if (ratings.some((r) => r.raterId === raterId)) throw new ApiError('CONFLICT', 'You have already rated this item.')
      if (ratings.length >= RATINGS_PER_ITEM) throw new ApiError('CONFLICT', 'This item already has its ratings.')
      return store().appendRating({ itemId: item.id, raterId, level: cannotRate ? null : level, cannotRate })
    },

    async summary() {
      const [items, ratings] = await Promise.all([store().listItems(), store().listRatings()])
      const counts = new Map()
      for (const r of ratings) counts.set(r.itemId, (counts.get(r.itemId) || 0) + 1)
      return {
        items: items.length,
        doubleRated: items.filter((i) => (counts.get(i.id) || 0) >= RATINGS_PER_ITEM).length,
        singleRated: items.filter((i) => counts.get(i.id) === 1).length,
        unrated: items.filter((i) => !counts.get(i.id)).length,
      }
    },

    async agreement() {
      const [items, ratings] = await Promise.all([store().listItems(), store().listRatings()])
      return agreementReport(items, ratings)
    },
  }
}
