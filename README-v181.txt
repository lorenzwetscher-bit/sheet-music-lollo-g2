Sheet Music G2 v1.8.1

PDF compatibility fix:
- robust PDF detection by MIME, extension and %PDF signature
- Vite-emitted PDF.js worker URL instead of inline Worker
- PDF.js WASM disabled to avoid OpenJPEG/qcms WASM lookup failures on localhost/Even WebView
- exact PDF.js error is shown if loading still fails
- all v1.8.0 app features retained
