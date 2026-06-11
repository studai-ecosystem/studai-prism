// Stub for jsPDF's optional peer deps (canvg, dompurify) which are only used
// for SVG/HTML rendering. The certificate export is raster (PNG via
// html2canvas), so these are never invoked at runtime. Aliasing them here
// stops Vite/esbuild from failing to resolve the bare imports.
export default {}
