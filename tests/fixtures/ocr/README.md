`pre21-tesseract.js.gz` is the self-contained Tesseract 7 runtime chunk from
production build `6466928a89ca278770d6b8a606b6e2d365c11986`, before OCR
generation installation. Its exact URL and SHA-256 are recorded in
`src/lib/pwa/legacy-ocr-assets.json`; the module has no import dependencies.
This fixture checks the retained library and deployment copy without
initializing OCR or committing an application build.
