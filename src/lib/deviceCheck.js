// Pre-assessment device checks (spec §11 item 9; C4.06). Pure functions over
// injected browser capabilities so they are testable. Nothing is recorded and
// no media permission is requested until the user presses "Test microphone".
// Voice is speech-to-text input only; audio is never scored.

export const CHECK_STATUS = Object.freeze({ PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL' })

export function checkBrowser(env = globalThis) {
  const ok = typeof env.fetch === 'function' && typeof env.Promise === 'function' && typeof env.URLSearchParams === 'function'
  return { id: 'browser', label: 'Browser', status: ok ? 'PASS' : 'FAIL', message: ok ? 'Your browser is supported.' : 'Please use a recent version of Chrome, Edge, Firefox or Safari.' }
}

export function checkScreen(width, { needsLargeScreen = false } = {}) {
  if (width >= 1024) return { id: 'screen', label: 'Screen size', status: 'PASS', message: 'Your screen is large enough.' }
  if (needsLargeScreen) {
    return { id: 'screen', label: 'Screen size', status: 'WARN', message: 'This assessment includes working documents. A laptop or tablet is strongly recommended.' }
  }
  return { id: 'screen', label: 'Screen size', status: width >= 768 ? 'PASS' : 'WARN', message: width >= 768 ? 'Your screen is large enough.' : 'A larger screen will be easier. You can continue on this device.' }
}

export function checkConnection(online, apiReachable) {
  if (!online) return { id: 'connection', label: 'Connection', status: 'FAIL', message: 'You appear to be offline. Connect to the internet to continue.' }
  if (!apiReachable) return { id: 'connection', label: 'Connection', status: 'FAIL', message: 'Prism could not be reached. Check your connection and try again.' }
  return { id: 'connection', label: 'Connection', status: 'PASS', message: 'Prism can be reached.' }
}

// `spokenInput: false` (the V3 text-and-board workspace): the microphone is
// not part of the assessment, and the row says so instead of implying that
// speaking is an available way to answer.
export function checkMediaSupport(mediaDevices, { needsCamera = false, spokenInput = true } = {}) {
  const supported = Boolean(mediaDevices && typeof mediaDevices.getUserMedia === 'function')
  const out = [spokenInput ? {
    id: 'microphone',
    label: 'Microphone (optional)',
    status: supported ? 'PASS' : 'WARN',
    message: supported ? 'You can speak your answers or type them.' : 'Speaking is not available in this browser. You can type your answers.',
  } : {
    id: 'microphone',
    label: 'Microphone',
    status: 'PASS',
    message: 'Not needed. You answer this assessment by typing and on its work material; spoken answers are not part of this version.',
  }]
  if (needsCamera) {
    out.push({
      id: 'camera',
      label: 'Camera',
      status: supported ? 'PASS' : 'FAIL',
      message: supported ? 'Your browser can use a camera for the identity check.' : 'This proctored assessment needs a camera. Try another browser or device.',
    })
  }
  return out
}

// Requests the microphone once, then stops every track immediately.
export async function testMicrophone(mediaDevices) {
  if (!mediaDevices?.getUserMedia) return { status: 'WARN', message: 'Speaking is not available in this browser. You can type your answers.' }
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return { status: 'PASS', message: 'Your microphone works.' }
  } catch {
    return { status: 'WARN', message: 'The microphone was not allowed. You can type your answers instead.' }
  }
}

export function summarise(results) {
  if (results.some((r) => r.status === 'FAIL')) return 'FAIL'
  if (results.some((r) => r.status === 'WARN')) return 'WARN'
  return 'PASS'
}
