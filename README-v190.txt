Sheet Music G2 v1.9.0 – Speed + Folder UX

- Native G2 list keeps up to 20 items per firmware list; 4-row visual viewport remains.
- Old-style header/selection/footer restored without a bitmap logo resend on every library rebuild.
- Footer shows page indicator and number of saved pieces; updated via fast textContainerUpgrade.
- Folder click/back fixed around 0-based list index and 20-item chunks.
- Scroll OFF now correctly means normal score page swipes are active.
- Finger scroll intercepts swipes only when Scroll ON + Finger is selected.
- Phone library uses collapsible folders instead of rendering every score in one long page.
- Large PDF/photo binaries remain local in IndexedDB for fast random access. They are NOT pushed through bridge.setLocalStorage because Even's own guidance says bridge storage shares the bridge/BLE call queue; using it for large binaries would hurt speed/stability.
- createStartUpPageContainer remains one-shot; bridge/image calls stay serialized.
