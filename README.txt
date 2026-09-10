Sheet Music for Even G2 — v1.2

Changes:
- Branded G2 start library with Wetscher Optik logo and SHEET MUSIC header.
- Logo is bundled as monochrome artwork so the G2 renders it in native green.
- 1 to 8 visible staff lines, displayed as one continuous 576x288 crop.
- Phone controls use two rows: 1–4 and 5–8.
- Existing fast caching, automatic G2 refresh, saved-score library and ink-only/invert modes retained.


v1.4 security changes:
- pdfjs-dist updated to 6.3.289 (newer PDF.js line with eval-based PostScript compiler removed upstream).
- HEIC decoder changed from heic2any to CSP-safe heic-to/csp build.
- Production build now fails automatically if bundled JS contains new Function() or direct eval().
