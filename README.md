# ténati highlighter

A lightweight Firefox extension that surfaces a floating highlighter whenever you select text. Hover or click the capsule to open a modern panel with pastel tones, then apply the color to the selection.

## Features
- Detects text selections on any page and positions an inline floating action button nearby.
- Panel reveals on hover/click with six curated pastel swatches.
- Highlights persist per page via `storage.local`, so they reappear the next time you open the document.
- Saved highlights live inside the extension popup (click the ténati icon) so the inline panel stays focused on quick color picks.
- Highlights are injected as `<mark>` elements with rounded edges so copied text stays intact.
- Glassmorphism-inspired styling with blurred highlight/delete bubbles keeps the UI modern without clashing with site themes.

## Getting started
1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Choose this folder and select `manifest.json`.
4. Visit any page, select text, and hover/click the ténati button to highlight.

## Notes
- Highlights are scoped per page URL; clearing site data or using private windows will bypass storage.
- Clicking an existing highlight now surfaces a glass bubble with Highlight + Delete controls side-by-side, so you can restyle or remove inline without opening the full menu manually.
- Both the highlight trigger and inline delete bubble share the same blurred glass capsule so interactions feel consistent.
- The UI intentionally detaches when you scroll or click elsewhere to stay unobtrusive.
