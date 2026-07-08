# Image Cost Analysis — StudAI Prism

**Finding: Prism has no image-generation or server-side image-analysis features. Cost: $0.**

Evidence (code search across the production codebase):

- No DALL·E / gpt-image / Stable Diffusion / any image-generation API call sites.
- No vision-model chat calls (no image content parts in any AI request).
- Camera frames from the proctoring flow are analyzed **client-side** by face-api.js (models served statically from `public/models/`) — presence/attention signals only, computed in the candidate's browser at zero server AI cost, and **never scored for facial expression or emotion** (prohibited by build rules).
- ID/OCR checks run client-side via tesseract.js (wasm in-browser). No server OCR service exists.
- Phone-proctor snapshots relay through socket.io in memory (5 MB buffer) and are not sent to any AI service.

If an image feature is ever proposed (e.g., avatar portrait generation), it must be re-costed here first: image generation typically runs $0.01–$0.17 per image — 10–100× a full text exchange — and would need its own plan metering. See also the Creator-product note in [PRICING_STRATEGY.md](PRICING_STRATEGY.md) §5.
