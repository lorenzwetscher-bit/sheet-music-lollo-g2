Sheet Music G2 v1.8.5 – Fast Navigation

Performance changes:
- Library no longer redraws/transfers a full 576x288 image on every swipe.
- Library is now native text UI: only the item text is updated while the selection moves.
- Full library rebuild only when entering/leaving a folder or crossing to another library page.
- Wetscher logo is transferred only when the library page itself is rebuilt.
- Score page layout is built once; page turns only replace the four required image quadrants.
- G2 image quadrants are precomputed as raw 4-bit grayscale data (no PNG decode during page turn).
- Next/previous 4 score views are prefetched first, then the remaining score views in the background.
- G2 navigation prepares the glasses pixels before creating/updating the phone preview.
- PDF inline-worker fix from v1.8.4 remains unchanged.

Expected result on real G2:
- Library swipes should feel nearly immediate because they use textContainerUpgrade only.
- Crossing a library page can take slightly longer because the page layout is rebuilt.
- Score page turns should be substantially faster once the adjacent page has been prefetched.
- Four serialized image transfers are still required by the G2 API for a full 576x288 score page, so absolute latency depends on BLE/Even App/firmware.
