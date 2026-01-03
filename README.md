# Ténati highlighter

A lightweight Firefox extension that surfaces a floating highlighter whenever you select text. Hover or click the capsule to open a modern panel with pastel tones, then apply the color to the selection.

## Installation

Install from the [Firefox Add-ons store](https://addons.mozilla.org/en-US/firefox/addon/t%C3%A9nati/)

## Features
- Detects text selections on any page and positions an inline floating action button nearby.
- Panel reveals on hover/click with six curated pastel swatches (Apricot, Coral, Pistachio, Mint, Periwinkle, and Lavender).
- Highlights persist per page via `storage.local`, so they reappear the next time you open the document.
- Saved highlights live inside the extension popup (click the ténati icon) where you can manage, focus, or delete them.
- Export highlights as Markdown files or export the entire page as PDF directly from the popup.
- Highlights are injected as `<mark>` elements with rounded edges so copied text stays intact.

## Notes
- Highlights are scoped per page URL; clearing site data or using private windows will bypass storage.
- Clicking an existing highlight surfaces a bubble with Highlight + Delete controls side-by-side, so you can restyle or remove inline.
- Both the highlight trigger and inline delete bubble share the same blurred capsule so interactions feel consistent.
- The UI intentionally detaches when you scroll or click elsewhere to stay unobtrusive.
