export function startEvaluationWorker({ sessions, available, onError, pollMs = 1000 }) {
  let stopped = false
  let timer = null
  let active = null
  const pass = async () => {
    if (stopped) return
    active = (async () => {
      if (!available()) return
      await sessions.runEvaluationWorkerOnce()
      await sessions.runPublicationWorkerOnce()
    })()
    try {
      await active
    } catch (error) {
      onError(error)
    } finally {
      active = null
      if (!stopped) {
        timer = setTimeout(pass, pollMs)
        timer.unref?.()
      }
    }
  }
  timer = setTimeout(pass, 0)
  timer.unref?.()
  return {
    async stop() {
      stopped = true
      clearTimeout(timer)
      if (active) await active.catch(() => {})
    },
  }
}
