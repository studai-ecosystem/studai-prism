// src/lib/artifactStore.js — Lightweight Reactive State Manager for PRISM Next Work Artifacts
import { useState, useEffect } from 'react'

class ArtifactStore {
  constructor() {
    this.artifacts = []
    this.activeArtifactId = null
    this.scenarioTitle = ''
    this.sessionId = null
    this.dirtyDeltas = {}
    this.isSaving = false
    this.listeners = new Set()
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.getState())
    }
  }

  getState() {
    return {
      artifacts: this.artifacts,
      activeArtifactId: this.activeArtifactId,
      scenarioTitle: this.scenarioTitle,
      sessionId: this.sessionId,
      dirtyDeltas: this.dirtyDeltas,
      isSaving: this.isSaving,
      activeArtifact: this.artifacts.find((a) => a.artifactId === this.activeArtifactId) || this.artifacts[0] || null
    }
  }

  setSession(sessionId, artifacts = [], scenarioTitle = '') {
    this.sessionId = sessionId
    this.artifacts = artifacts
    this.scenarioTitle = scenarioTitle
    if (artifacts.length > 0 && (!this.activeArtifactId || !artifacts.some(a => a.artifactId === this.activeArtifactId))) {
      this.activeArtifactId = artifacts[0].artifactId
    }
    this.notify()
  }

  setActiveArtifact(artifactId) {
    this.activeArtifactId = artifactId
    this.notify()
  }

  updateLocalArtifact(artifactId, dataUpdates) {
    const target = this.artifacts.find(a => a.artifactId === artifactId)
    if (target) {
      target.data = { ...target.data, ...dataUpdates }
      this.dirtyDeltas[artifactId] = {
        ...(this.dirtyDeltas[artifactId] || {}),
        ...dataUpdates
      }
      this.notify()
    }
  }

  async persistArtifact(sessionId, artifactId, notes = '') {
    const target = this.artifacts.find(a => a.artifactId === artifactId)
    if (!target) return null
    this.isSaving = true
    this.notify()

    try {
      const token = localStorage.getItem('token')
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/assessment/artifacts/${sessionId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          artifactId,
          updates: target.data,
          notes
        })
      })

      const data = await res.json()
      if (data.ok && data.artifacts) {
        this.artifacts = data.artifacts
        delete this.dirtyDeltas[artifactId]
      }
      this.isSaving = false
      this.notify()
      return data
    } catch (err) {
      console.error('Failed to persist artifact delta', err)
      this.isSaving = false
      this.notify()
      throw err
    }
  }
}

export const artifactStore = new ArtifactStore()

export function useArtifactStore() {
  const [state, setState] = useState(artifactStore.getState())

  useEffect(() => {
    return artifactStore.subscribe((nextState) => {
      setState(nextState)
    })
  }, [])

  return {
    ...state,
    setActiveArtifact: (id) => artifactStore.setActiveArtifact(id),
    updateLocalArtifact: (id, updates) => artifactStore.updateLocalArtifact(id, updates),
    persistArtifact: (sessionId, id, notes) => artifactStore.persistArtifact(sessionId, id, notes),
    setSession: (sessionId, artifacts, title) => artifactStore.setSession(sessionId, artifacts, title)
  }
}
