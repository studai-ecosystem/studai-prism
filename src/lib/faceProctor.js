// Lightweight in-browser face proctoring (Phase 5).
//
// Uses face-api.js (TensorFlow.js under the hood) to ANALYSE the webcam video
// on the candidate's device — raw webcam video is not uploaded, but the DERIVED
// integrity events (face_absent, multiple_faces, looking_away) ARE sent to the
// server and recorded with the session. Note: this covers the LAPTOP webcam
// only — when the optional phone-proctor is linked, phone-camera frames are
// relayed THROUGH the server in memory (see server/lib/proctorSocket.js), so
// never describe that channel as "video stays in the browser". Both channels
// are covered by explicit consent scopes in Briefing.jsx (audit C5/C6).
// We run the tiny face detector plus
// the 68-point landmark model on the existing webcam stream a few times a second
// and derive three signals used by the proctor:
//   • faces       — how many faces are visible (0 = absent, >1 = someone else)
//   • lookingAway  — rough head-turn estimate from eye/nose landmark geometry
//
// Models are served as static files from /public/models (downloaded at build
// time). Loading is lazy + cached so importing this module is cheap.

import * as faceapi from 'face-api.js'

const MODEL_URL = '/models'
let loadPromise = null

export function loadFaceModels() {
  if (loadPromise) return loadPromise
  loadPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
  ])
    .then(() => warmUp())
    .then(() => true)
    .catch((err) => {
      // Reset so a later retry can attempt loading again.
      loadPromise = null
      throw err
    })
  return loadPromise
}

// The first real inference is slow (~10s) because TF.js compiles WebGL shaders
// on demand. Run one throw-away detection on a tiny blank canvas right after the
// weights load so the candidate's first live frame is already fast.
async function warmUp() {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 224
    canvas.height = 224
    await faceapi.detectAllFaces(canvas, detectorOptions).withFaceLandmarks()
  } catch {
    /* warm-up failure is non-fatal */
  }
}

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 224, // small = fast; plenty for presence + head-turn
  scoreThreshold: 0.5,
})

// Estimate whether the head is turned away from the screen using landmark
// geometry: the nose tip should sit roughly centred between the outer eye
// corners when facing forward. A large horizontal offset ⇒ the head is turned.
function isLookingAway(landmarks) {
  try {
    const leftEye = landmarks.getLeftEye()
    const rightEye = landmarks.getRightEye()
    const nose = landmarks.getNose()
    if (!leftEye?.length || !rightEye?.length || !nose?.length) return false
    const leftOuter = leftEye[0].x
    const rightOuter = rightEye[rightEye.length - 1].x
    const noseTip = nose[nose.length - 1].x
    const span = Math.abs(rightOuter - leftOuter)
    if (span < 1) return false
    const ratio = (noseTip - Math.min(leftOuter, rightOuter)) / span // ~0.5 when centred
    return ratio < 0.34 || ratio > 0.66
  } catch {
    return false
  }
}

// Run one detection pass on a <video> element. Returns null if the video is not
// ready yet (so the caller can simply skip that tick).
export async function analyzeFrame(videoEl) {
  if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) return null
  const results = await faceapi
    .detectAllFaces(videoEl, detectorOptions)
    .withFaceLandmarks()
  const faces = results.length
  let lookingAway = false
  if (faces === 1) lookingAway = isLookingAway(results[0].landmarks)
  return { faces, lookingAway }
}

// Count faces in a still <img> (e.g. a phone-proctor frame rendered into an
// image element). Returns the number of faces detected, or null if the image
// has not finished loading. Used by the environment scan to require an actual
// face on the "show your face" step.
export async function countFacesInImage(imgEl) {
  if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) return null
  try {
    const results = await faceapi.detectAllFaces(imgEl, detectorOptions)
    return results.length
  } catch {
    return null
  }
}
