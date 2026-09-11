Sheet Music G2 v1.8.6 – Stability + speed repair

- Restores the previous Wetscher/SHEET MUSIC library design.
- Library and score share one image page, so switching between them does not rebuild the page container.
- Library swipes resend only image quadrants that actually changed.
- Restores reliable PNG image transport for photos and score pages.
- Pre-encodes neighboring score pages; only +1, -1, +2 and +3 are prefetched to keep the phone responsive.
- Automatic one-time bridge reconnect/rebuild on a failed image update.
- Saved-score click opens through the same shared page without a library->score page rebuild.
- PDF inline-worker fix from v1.8.4 remains unchanged.
