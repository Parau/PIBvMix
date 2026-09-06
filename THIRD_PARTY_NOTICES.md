# Third-party notices

## Decimen Optical Transfer v0.3.0

PIBvMix optical fountain coding is adapted from **Decimen Optical Transfer v0.3.0** by Evan Crawley (Bash Alarmist):

- Source: https://github.com/bashalarmistalt/decimen-optical-transfer/tree/v0.3.0
- Files used as design/source material: `shared/fountain.ts` and the frame-protocol design in `shared/protocol.ts`.
- License of v0.3.0: **MIT**.

The current Decimen project changed to AGPL-3.0-or-later starting with v0.4.0. PIBvMix deliberately uses the still-MIT-licensed v0.3.0 material and does not incorporate the later AGPL decoder or application code.

MIT License

Copyright (c) 2026 Evan Crawley (Bash Alarmist)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## qrcode-generator 2.0.4

The optical sender loads `qrcode-generator` 2.0.4 in the browser to render QR symbols.

- Project: https://github.com/kazuhikoarase/qrcode-generator
- License: MIT
- Copyright: Kazuhiko Arase

The dependency is version-pinned and loaded as a client-side ES module; no transfer payload is sent to that service.

## jsQR 1.4.0

When the browser does not provide the Barcode Detection API, the optical receiver loads `jsQR` 1.4.0 as a pure-JavaScript fallback decoder.

- Project: https://github.com/cozmo/jsQR
- License: Apache License 2.0
- License text: https://github.com/cozmo/jsQR/blob/master/LICENSE

The dependency is version-pinned and runs entirely in the receiving browser.
