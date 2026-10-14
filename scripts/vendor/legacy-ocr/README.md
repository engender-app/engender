`pre21-tesseract.js.gz` is the self-contained Tesseract 7 runtime chunk from
production build `6466928a89ca278770d6b8a606b6e2d365c11986`, before OCR
generation installation. Its exact URL and SHA-256 are recorded in
`src/lib/pwa/legacy-ocr-assets.json`; the module has no import dependencies.
The asset recipe verifies its hash and ships it at that immutable URL so
new uploads can preserve retained scanners even when the previous release
lost the file. Node regressions use the same frozen bytes. This adds 15,829
raw bytes to installation; caching the file does not initialize OCR.
