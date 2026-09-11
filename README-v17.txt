Sheet Music for Even G2 - v1.7.0

Glasses flow:
1. Short OS-rendered startup page.
2. Wetscher Optik / Sheet Music library opens automatically.
3. If empty: "Keine Noten vorhanden. Speichere Noten in der Handy-App ab."
4. In library: swipe up/down changes the selected score; click opens it.
5. In score: swipe up/down changes pages/views; click returns to the library.
6. Direct long-press-to-exit is not exposed as an app gesture by the G2 SDK. The OS owns long press for its contextual menu. Use the system "Close Sheet Music" item there. Double-click remains the required direct app-exit gesture for Even Hub review compatibility.

Windows simulator:
- First time in a fresh extracted version: npm install
- Then double-click start-simulator.bat

v1.7.1 PDF fix
- PDF worker is now bundled as a normal Vite asset instead of an inline/blob worker for better Even App/Android WebView compatibility.
- PDF detection now works by MIME type, .pdf filename, or %PDF signature.
- Saved PDFs with missing/incorrect MIME type are recognized correctly.
- Added clearer PDF validation/error messages.
