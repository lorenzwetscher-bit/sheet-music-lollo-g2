Sheet Music v1.7.5

- Wetscher Optik logo is now cropped to its actual artwork and shown much larger in the G2 library.
- Restored the exact v1.6/v1.5 score detection/grouping implementation.
- Restored the original v1.6 PDF rendering path while keeping robust PDF identification by MIME, filename and %PDF signature.
- Selecting 1–8 visible lines now always resets to the beginning of the document and rebuilds every view from line/system 1.
- Grouping remains page-safe: 1 means one detected system per view, 2 means two consecutive systems per view, ... up to 8. Groups never cross a source PDF page.
- v1.7.x library navigation fixes remain.
