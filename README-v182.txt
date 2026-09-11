Sheet Music G2 v1.8.2

PDF fix:
- fixes the runtime error "pdf.destroy is not a function"
- PDF rendering is kept unchanged
- cleanup is now compatibility-safe and can no longer invalidate an otherwise successfully rendered PDF
- uses PDFLoadingTask.destroy() when available, with safe fallbacks

All v1.8.1 library/folder/navigation features remain unchanged.
