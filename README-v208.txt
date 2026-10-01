v2.0.8 – iOS PDF compatibility fix

- Adds a small compatibility polyfill for Map/WeakMap getOrInsert and getOrInsertComputed before PDF.js loads.
- Fixes PDF.js 6.x failing on older iOS WKWebView with: getOrInsertComputed is not a function.
- No changes to G2 menu, scrolling/prompter, storage, folders, language, crop, rendering settings, or navigation.
