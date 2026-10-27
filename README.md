# Diffchecker

Text & code compare tool in the DaintyDust style. Everything runs in the browser.

- Split and unified view, with Smart / Word / Char precision for changes inside a line
- Syntax highlighting (auto-detected from file name or content, or pick a language)
- Hide whitespace changes, ignore case, custom ignore rules (plain text or `/regex/`)
- Hide unchanged lines, line wrap on/off, real-time editor
- All settings live in a collapsible widget you can snap to the left (default) or right edge, or leave floating; the page makes room for it when snapped
- Jump between changes (Alt + ↑ / ↓), open or drag & drop files, swap sides, Ctrl + Enter to compare
- Merge changes: click a change, then copy it to the other side (with undo)
- Copy or download the result as a unified `.diff` patch
- Inputs and settings are remembered in localStorage

## Development

```sh
npm install
npm run dev
npm run build
```
