v1.9.6 – Menu return reliability fix

- Fixes a real regression in v1.9.5: menu return no longer waits forever for busy image transfers.
- Uses the official SDK event-envelope rules: tap/double tap via sysEvent, scroll via text/list event, protobuf click=0 fallback only on present envelopes.
- Single click in score always triggers a bounded return-to-library path.
- BLE image writes and rebuilds have timeouts; a stuck write triggers one bridge recovery instead of trapping the user.
- Old score image queue is invalidated before menu rebuild, preventing stale quadrants from painting over the library.
- Keeps valid 288x52 Wetscher logo and compact native library.
