Sheet Music G2 v1.8.9 — Even SDK audit

Fixes after comparison with current official Even Realities SDK guidance:
- Correct protobuf event parsing: CLICK_EVENT=0 is only the final input fallback; lifecycle events are no longer misread as clicks.
- Native library list is now the single event-capture container.
- Native firmware selection border enabled (isItemSelectBorderEn=1).
- Fixed double-step bug: listEvent already moves selection; app no longer increments it a second time.
- Library only rebuilds when crossing a 4-item page or entering/leaving a folder.
- Removed unsupported menuObject fields from page payloads.
- Removed artificial 300 ms startup delay.
- createStartUpPageContainer remains one-shot.
- Image sends remain strictly serialized.
- PDF inline worker and safe cleanup retained.

Important Even platform limitation:
Image frames over BLE are not instant. Current Even guidance states roughly 0.5–2 s per image frame; full 576x288 requires four 288x144 containers. Continuous image scrolling therefore cannot be guaranteed smooth. Native list/text interactions can be near-instant.

Known Even platform issue (July 2026): showing shutDownPageContainer(1) and cancelling can permanently break later updateImageRawData until full relaunch. Double-click exit remains required for review, but do not cancel the exit dialog during image use if possible.
