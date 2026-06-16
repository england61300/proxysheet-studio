# ProxySheet Studio

Desktop card sheet builder for custom cards, playtest proxies, and tabletop prototypes.

## Run with portable Node on Windows

From the project folder:

```powershell
$env:Path = "$PWD\tools\node;$env:Path"
.\tools\node\npm.cmd install
.\tools\node\npm.cmd run tauri dev
```

Build installers:

```powershell
$env:Path = "$PWD\tools\node;$env:Path"
.\tools\node\npm.cmd run tauri build
```

Do not use plain `npm` in PowerShell if Windows blocks `npm.ps1`. Use `npm.cmd`.

## v0.2.0 updates

- Fixed oversized/wide image export spillover by rasterizing every card into a clipped card-sized surface before PDF placement.
- Added front/back preview toggle.
- Added back library so backs can be imported before or after fronts.
- Added apply single back to selected/all cards.
- Added clearer selection indicators, selected card strip, select all, and clear selection.
- Added full-art custom card mode.
- Added uploaded mana/cost icon support.
- Added `[icon:name]` tokens for the cost row and rules text.
- Added semi-transparent rules text box controls.
- Added stronger frame, border, radius, title box, type box, and text color customization.
- Added `canvg`, `html2canvas`, and `dompurify` dependencies to avoid jsPDF/Vite optional dependency import errors.
- Included required Tauri Windows icons.

## Legal positioning

This app is intended for original custom cards, playtesting, tabletop prototypes, and personal print layouts. Do not distribute copyrighted card scans or official game assets that you do not have rights to use.


## v0.7 Digital asset export

- Export zipped digital asset packs for generic, Unity-friendly, or Godot-friendly folder layouts
- Include flattened front PNGs, back PNGs, and JSON metadata
- Export card-size-consistent PNGs based on the current card dimensions and DPI
