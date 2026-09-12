v2.0.7 – Persistent Library Fix

- Fixes saved scores/folders disappearing after closing and reopening the Even Hub app.
- IndexedDB remains the fast runtime cache.
- Saved PDFs/photos and library metadata are mirrored to Even App bridge local storage.
- On a cold WebView restart the library is automatically restored before the UI reads it.
- Includes one-time migration from an existing v2.0.6 IndexedDB library when still available.
- Large files are stored in chunks to avoid one oversized bridge-storage value.
- No G2 menu design, scrolling behavior, language logic, rendering, or navigation was changed.
