import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { fileURLToPath } from 'node:url'

const emptyModule = fileURLToPath(new URL('./src/lib/emptyModule.js', import.meta.url))

// HTTPS is opt-in. localhost is already a "secure context" over plain HTTP, so
// same-machine testing (and the embedded browser) works without it. A REAL
// PHONE on the LAN (http://192.168.x.x) is treated as insecure and blocks the
// camera — for that case start the dev server with HTTPS=1 (npm run dev:phone),
// scan the QR, and accept the one-time self-signed certificate warning.
const useHttps = process.env.HTTPS === '1' || process.env.HTTPS === 'true'

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  resolve: {
    alias: {
      // jspdf dynamically imports these optional deps for SVG/HTML rendering.
      // The certificate export is raster-only, so alias them to an empty stub
      // to keep Vite from failing on the unresolved bare imports.
      canvg: emptyModule,
      dompurify: emptyModule,
    },
  },
  optimizeDeps: {
    include: ['html2canvas', 'jspdf'],
  },
  server: {
    https: useHttps,
    // Listen on all interfaces so a phone on the same LAN can open /m/:pairCode.
    host: true,
    // Allow public tunnel hostnames (Cloudflare quick tunnel / localtunnel) so
    // a phone on ANY network can open the QR link over HTTPS — this also makes
    // the camera work (a public https:// origin is a secure context).
    allowedHosts: ['.trycloudflare.com', '.loca.lt', '.ngrok-free.app', '.ngrok.io'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Proxy the phone-proctor websocket through Vite so the page and the
      // socket share ONE origin (avoids a separate ws://...:3001 link that
      // would be blocked as mixed content when the page is served over HTTPS).
      '/proctor-socket': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
