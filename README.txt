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


v1.5.0: Adds a brief OS-rendered startup screen on G2 before the library/score flow, as required by Even Hub review. Also normalizes unique zOrderIndex values in the branded library layout.


v1.6.0
- Phone camera now uses the official Even Hub SDK captureImageFromCamera() API.
- Gallery import now uses the official Even Hub SDK pickImageFromAlbum() API.
- Existing universal image decoding, PDF import, detection, editing, saving and G2 rendering remain unchanged.
- Browser file inputs remain only as a development/local-testing fallback.

v1.7.0
- After the short startup page, the Wetscher Optik / SHEET MUSIC library always opens automatically.
- Empty library text is now German: "Keine Noten vorhanden. Speichere Noten in der Handy-App ab."
- Library: swipe changes selection, click opens the selected score.
- Score: swipe changes pages/views, click returns to the library.
- Double-click remains direct exit because Even Hub review requires it.
- G2 long press is OS-reserved for the contextual menu; use its built-in "Close Sheet Music" action to exit from long press.
- Added start-simulator.bat for one-click Windows simulator startup after npm install.
