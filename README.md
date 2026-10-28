# Master Carton and Pallet Planner


A browser tool that designs master cartons from a single product unit, stacks them on one or more pallet options with interlocking (brick-wall) layers, checks the result against theoretical transit-test criteria, and exports PDF documents for the warehouse and for quality, packaging, logistics and supply chain teams.

It runs entirely in the browser: no server and no install. The only external files are three.js (3D views) and jsPDF (PDF export), loaded from cdnjs.

## Quick start

```bash
npm run build   # writes dist/master-carton-planner.html
npm test        # engine checks, Node 18+, no dependencies
```

Open `dist/master-carton-planner.html` in a browser. The same file can be published as a claude.ai Artifact. There, PDF export uses the Artifact `downloads` capability, which asks the viewer to confirm each save. When the file is opened on its own, PDFs download normally.

## What it does

- **Master cartons:** every carton that can be built from 2 to 40 units, in all unit orientations and all three flap directions. Cartons are regular slotted cartons (RSC, FEFCO-ESBO code 0201). Side walls add 2 board thicknesses per dimension and the flap direction adds 4, because the flaps overlap 2 deep at the top and bottom.
- **Pallets:** up to 4 pallet options side by side (length, width, max height, with or without the pallet itself). Layer patterns come from guillotine and 5-block pinwheel layouts.
- **Brick wall:** optional rule that every layer must bridge the joints of the layer below by a set share (default 50% of cartons, each overlapping a second carton by at least 20% of its base), with 75% of every carton base supported.
- **Rules:** keep cartons upright (flaps top and bottom), keep the product upright, overhang, max pallet weight, max carton weight and size, packing clearance, size tolerance check.
- **Compression:** box strength estimated with the McKee short formula, BCT = 5.87 × ECT × √(thickness × perimeter). It is reduced for interlocked layers and for cartons on their side, then compared with the load above times a safety factor.
- **Transit checks (theoretical):** mapped to ISTA 1A / 2A (single cartons up to 68 kg) and 1E / 3E (unit loads). These cover test scope, drop height band, unit movement, carton fill, handling weight, compression, interlock, floor coverage, overhang, slenderness, impact energy and height margin.
- **Freight:** gross, volumetric (default 1:6000) and chargeable weight per pallet and per unit, with optional cost per unit.
- **3D and 2D:** pallet view with a loading animation, units shown inside cartons, and sliders to separate layers and cartons. A carton view shows units being packed and the flaps closing, with product dimensions. Layer plans and a side view are in 2D. Board cross-sections are drawn to scale.
- **PDF exports:**
  - *Pallet loading instruction:* step-by-step packing and pallet build with numbered layer plans and 3D progress images, for the warehouse.
  - *Packaging and logistics specification:* product, carton, all pallet options, layer plans, compression, transit readiness, board alternatives, freight and supply chain figures, a quality checklist and the method.

## Board and test standards

The default board is **double wall, 6 mm**. Other boards stay available; their thickness defaults sit at or above the published nominal values, so cartons are never drawn undersized:

| Board | Default (mm) | Fibre Box Association nominal (US) | DIN 55468 flute height (Europe) |
|---|---|---|---|
| Single wall F | 1.2 | 0.8 | not listed |
| Single wall E | 2.0 | 1.6 | 1.0 to 1.8 |
| Single wall B | 3.2 | 3.2 | 2.2 to 3.0 |
| Single wall C | 4.2 | 4.0 | 3.2 to 4.0 |
| Double wall 6 mm (default) | 6.0 | sum of flutes plus one liner | |
| Double wall E/B, E/C, B/C | 4.5, 6.5, 7.6 | sum of flutes plus one liner | |
| Triple wall B/C/B | 11.0 | sum of flutes plus liners | |

ISO standards define how to test boards and boxes, not the values themselves. Ask the board supplier for:

- thickness measured to **ISO 3034**
- edge crush (ECT) to **ISO 3037** or **TAPPI T 811**
- box compression to **ISO 12048** or **ASTM D642**

ECT and board weight defaults are typical estimates, not standard values. Replace them with the supplier's certificate.

## Limits

- All results are theoretical estimates. Approve cartons and pallets with a physical sample and accredited lab tests (ISTA 1A/2A for cartons, 1E/3E for pallets).
- ISTA drop heights and compression test loads are in the full procedures, which are not public. The drop height shown is a commonly quoted band.
- For very small products (many cartons per layer), layer patterns are limited to simpler block layouts to keep the search fast.
- PDFs use the standard Helvetica font, because the page's web fonts cannot be embedded.

## Project layout

```
src/app.html       page: UI, 3D views, PDF export (marker /*ENGINE*/ is filled at build)
src/engine.js      calculation engine (also runs in Node and in a Web Worker in the page)
scripts/build.js   inlines the engine into one HTML file
test/engine.test.js engine checks
dist/              built, self-contained planner (generated by npm run build)
```
