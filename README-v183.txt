Sheet Music G2 v1.8.3 – G2 performance update

- Reuses the same image page container between library and score instead of rebuilding it on every navigation event.
- Pre-encodes the four 288x144 G2 quadrants during view rendering/prefetch.
- Neighbor views are cached with ready-to-send G2 image bytes.
- Keeps Even image transfers serialized as required by the SDK.
- Existing PDF, folders, library navigation, line grouping, and logo behavior remain unchanged.
