Sheet Music for Even G2 — v0.9.0

Fixes:
- PDF.js worker is bundled inline so Even Hub does not fetch pdf.worker from 127.0.0.1.
- Photo decoding uses FileReader + HTMLImageElement instead of createImageBitmap for better Android WebView compatibility.
- G2 output is quantized to the hardware's 16 green brightness levels.
- Default output is bright notation on an off/dark background, matching G2's display model.
- G2 page follows Even Hub Display guidelines: 4 x 288x144 image containers, exactly one full-screen event capture layer, serialized image sends, explicit z-order.

GitHub build:
1. Replace your repository root files with these v0.9 files (preserve src/ if using the structured version).
2. Your existing .github/workflows/build-ehpk.yml can stay unchanged.
3. Commit to main; GitHub Actions will build sheet-music-g2.ehpk.
