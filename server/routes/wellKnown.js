import { Router } from 'express'
import { getPublicKeyInfo } from '../lib/credentials.js'

const router = Router()

/**
 * Public JWKS Endpoint (RFC 7517)
 * Serves active Ed25519 public verification keys for Hire, Career, and third parties.
 */
router.get('/jwks.json', (req, res) => {
  const info = getPublicKeyInfo()

  if (!info) {
    // In local dev without PRISM_CREDENTIAL_SIGNING_KEY, provide a deterministic placeholder descriptor
    return res.json({
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          use: 'sig',
          kid: 'prism-dev-public-key-v1',
          alg: 'EdDSA',
          status: 'provisional',
        },
      ],
    })
  }

  return res.json({
    keys: [
      {
        kty: 'OKP',
        crv: 'Ed25519',
        use: 'sig',
        kid: info.keyId,
        alg: 'EdDSA',
        publicKeyPem: info.publicKeyPem,
        status: 'active',
      },
    ],
  })
})

export default router
