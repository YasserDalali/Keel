# Blueprint design system (documentation diagrams)

Style for every diagram in `docs/`. Light-mode engineering drawing: white sheet, Keel green-black ink, one green accent.

**Default view: 3D** (see "3D view" below). Reference sheet: `images/cf-domain-3d.svg` (CF-02), generator `images/build-cf-domain-3d.py`.
Use the flat 2D view only when a sheet has too much text for slanted tile faces. 2D reference: `images/cf-stack.svg`, generator `images/build-cf-stack.py`.

Every rule below applies to both views, unless the 3D section says otherwise.

## Canvas

| Item | Value |
|---|---|
| Size | 1600 × 1000, render PNG at 2× (3200 × 2000) |
| Background | `#ffffff` |
| Grid | 20 px minor `#eceeed` 0.6 px, 100 px major `#d9dcdb` 0.9 px |
| Frame | Outer rect 20 px inset, 1.5 px. Inner rect 30 px inset, 1 px |
| Title | 36 px, weight 600, top left at y=108. 1 px rule below at y=132 |
| Title block | Bottom right. Sheet id, sheet number, revision |

## Colour

The palette inherits from the app. Every colour below is a Keel token or a mix of Keel's ink with white, so the docs and the product look like one family. The tokens live in `frontend/src/styles/tokens.css`. If the app palette changes, change `blueprint.py` and the `DARK` map, then rebuild.

| Token | Hex | From Keel | Use |
|---|---|---|---|
| ink | `#14271f` | `ink` | Lines, headings, icons |
| ink-soft | `#5d6963` | `ink-2` | Captions |
| accent | `#1f7a4d` | `accent-600` | Step circles, the domain and aggregate. Nothing else |
| accent-tint | `#edf7f1` | `accent-50` | Fill of the domain and aggregate |
| paper | `#ffffff` | none | Sheet and box fill. Pure white, not Keel's canvas |
| faces and grid | `#e5e7e6`, `#f3f4f4`, `#eceeed`, `#d9dcdb` | `ink` at 5 to 16 % on white | Shaded sides, grid, soft rules |
| note paper | `#f7f6f2` | `canvas` | Notes |

## Type

Font: Inter, then Helvetica, then Arial.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Box title | 16 px | 700 | Caps, 0.6 px tracking |
| Section label | 11 px | 600 | Caps, 1.6 px tracking |
| Caption | 12.5 px | 400 | Colour ink-soft. One to three words |

## Lines

| Element | Stroke |
|---|---|
| Box | 1.5 px ink, white fill |
| Worker box | 2 px |
| Domain box | 2 px accent |
| Connector | 1.5 px ink, 9 px triangle head |
| Two-way connector | Triangle head at both ends |
| Platform boundary | 1.2 px ink, dash `7 5` |
| Optional or shared element | 1 px ink, dash `4 3` |

## Icons

Draw each icon at 2.2 px on screen, the stroke weight of the Worker glyph: `stroke-width = 2.2 × 24 / size`.

| Source | Licence | Use |
|---|---|---|
| [Lucide](https://lucide.dev) | ISC | All generic and platform icons |
| [Simple Icons](https://simpleicons.org) | CC0 | Brand logos, drawn in ink, not brand colour |

Rules:
- Ink colour only. No brand colours.
- Sizes: 32 px (provider cards, edge row), 48 px (bindings), 56 px (client cards).
- Icons used now are copied to `images/icons/`. Add a new icon there before you use it.
- Use a letter badge only when no icon exists.

Current mapping:

| Item | Icon |
|---|---|
| Browser | Lucide `app-window` |
| Webhooks | Lucide `webhook` |
| Edge | Lucide `shield-check` |
| Turnstile | Lucide `bot` |
| Assets | Lucide `panels-top-left` |
| D1 | Lucide `database` |
| KV | Lucide `key-round` |
| R2 | Lucide `archive` |
| Plaid | Lucide `landmark` |
| Didit | Lucide `scan-face` |
| Worker | Simple Icons `cloudflareworkers` |
| PayPal, Resend | Simple Icons, same names |

## Step circles

- Radius 8 px, 2 px accent stroke, white fill, 9.5 px bold number.
- Centre the circle on the connector shaft, half way between the two arrowheads.
- Put the label text 20 px to the side of the line. Never touch the circle.
- The key lists the steps in order, in the bottom left.

## Cards

- Box with an icon on the left and a title plus one caption on the right.
- Title: noun, caps. Caption: one to three words.
- No marketing words. No slogans.

## Text rules

Write the key and captions in Simplified Technical English (`/asd-ste100`):
- One idea per sentence, 20 words at most.
- Active voice. Simple tenses.
- One word for one thing. Use the same name in every diagram.
- Remove any text that the diagram already shows.

## Layout

- Clients on the left, platform in the middle in a dashed boundary, external providers on the right.
- Request flow runs left to right and top to bottom.
- Dependencies point inward: Interface → Application → Domain ← Infrastructure.
- Cards align to a 5 px grid. Gaps between cards: 15 px in a row, 20 px in a column.

## Build

```bash
python3 docs/images/build-cf-domain-3d.py
cd docs/images && google-chrome --headless --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1600,1000 --screenshot="$PWD/cf-domain-3d.png" "file://$PWD/cf-domain-3d.svg"
```

Every sheet builds the same way: run its `build-*.py`, then screenshot its SVG.

Do not render with ImageMagick. It drops arrowheads and the background. `render.sh <name>` renders both the light and the dark PNG.

## Planned sheets

| Sheet | Subject |
|---|---|
| CF-01 | Cloudflare stack, flat 2D (done: `cf-stack`) |
| CF-02 | Bounded contexts and domain events (done: `cf-domain-3d`) |
| CF-03 | Inside Lending: Loan aggregate, services, ports, status machine (done: `cf-lending-3d`) |
| CF-04 | Inside Payments: use cases, gateway port, ledger, safety checks (done: `cf-payments-3d`) |
| CF-05 | Use cases: actors, system boundary, use cases by zone (done: `cf-usecases-3d`) |
| CF-06 | Request lifecycle: apply, approve, repay |

### Camera views

Give each sheet its own camera, so the set does not look the same. Set `bp.VIEW = (azimuth, elevation)` and call `bp.fit(width, depth, box)`. Fit sets the scale and origin so the plane fills a screen box. Sort the blocks with `bp.depth(x, y)`, and write the view in the title block (`title_block(..., view='AXO 18/42')`).

| Sheet | View | Look |
|---|---|---|
| CF-01 | flat 2D | the one 2D sheet |
| CF-02 | isometric (`VIEW = None`) | one plane, diagonal |
| CF-03 | `(18, 42)` | low and wide. Text runs almost flat |
| CF-04 | `(8, 68)` | almost overhead, like a plan with depth |
| CF-05 | `(80, 45)` | mirrored: blocks show their left side, and the long side runs flat |

**Upright labels (billboards).** When text must stay level at any angle, project the anchor with `iso()` and draw the text flat on the sheet. CF-05 does this for every label, so its camera is free. Actors are an icon standing on a disc on the floor, with the name and role under it. Start an actor's line past its label so the line does not cross the text.

**Transposed layouts.** At an azimuth above 45, the plane's y axis is the flat one. Write the layout as usual, wrap the floor in `matrix(0,-1,1,0,0,W)`, and project anchors with `iso(y, W - x)`. The data then keeps its left-to-right order on screen (see `build-cf-usecases-3d.py`).

Keep the azimuth between 0 and 90, because the side faces assume it. A low azimuth makes the roof text easier to read. A high elevation flattens the blocks but makes the plane taller, so give it more height or move the key into the left column.

Context sheets (CF-03, CF-04) put one platform per layer: application, domain, infrastructure. Draw the aggregate boundary as a green dashed rectangle on the domain floor. A fourth arrow style, dash-dot `9 3 2 3`, means "implements a port". When an arrow runs through the back margin, put the floor labels at the front (`floor_labels(..., y=PD - 8)`).

## 3D view (default)

Isometric view. Reference: `images/cf-domain-3d.svg`. Generator: `images/build-cf-domain-3d.py`.

All 3D sheets import `images/blueprint.py` (projection, slabs, tiles, badges, header, leaders, key, title block). A new sheet is one `build-<name>-3d.py` file that only places content.

Two layouts:
- **Single plane** (default, CF-02): all blocks stand on one ground slab and arrows show the relations. Small blocks (24 px high), wide gaps, so the arrows carry the picture. Arrows and step circles lie at roof height, drawn after every block. Columns run along x: upstream, core (with the bus), downstream. Each column stands on its own platform with a 70-unit gap. Column names lie on the platform floor at y=42, and blocks start at y=90 so the names stay clear. Turn the bus label with `rotate(-90)` so it reads upward. Put arrow joints in the middle of a gap, away from both platform edges. Set `bp.K` (plane scale) so the plane fits, and enlarge the roof text to match.
- **Exploded stack** (the README hero): one slab per layer. Use it only when the subject is layers, not relations. CF-01 had a 3D exploded version. It was removed, and the flat sheet stays.

Arrow styles on a single plane: solid = calls a port, dashed `6 4` = publishes an event, dotted `1.5 3.5` = reads tables. Show the legend top left.

These rules apply to the exploded stack and replace the 2D "Step circles" and connector rules:

- Projection: 30° isometric. `X = ox + (x − y)·0.866`, `Y = oy + (x + y)·0.5 − z`.
- One slab per layer, stacked top to bottom in request order: edge, worker, bindings. Slab 460 × 200, 10 px thick, 195 px apart.
- Tiles are extruded 12 px. Draw their text and icons on the top face with `matrix(0.866, 0.5, −0.866, 0.5, …)`.
- Shading: right face `#e5e7e6`, left face `#f3f4f4`, top face white with the minor grid.
- Fill with `style="fill:…"`, not the `fill` attribute. The `.ink` class sets `fill:none` and wins over the attribute.
- Draw from bottom to top: lower slab, risers, upper slab. Upper layers hide lower ones.
- Risers: 1 px dashed lines at the left and right slab corners only.
- Step circles sit on the tile top face, back right corner, and are drawn in the plane, so they show as ellipses.
- Layer names sit on leader lines on the left, in flat 2D. Providers and the key stay flat 2D.
- No vertical arrows between slabs. They always cross the tiles below. The step numbers and risers carry the flow.
- Tile text: title plus one short caption. Slanted text is harder to read, so cut harder than in 2D.

## README art

`images/build-readme-art.py` makes the README hero (`readme/hero.png`) and the pill badges (`readme/pill-*.png`) in the same style. The hero copies the layout of an engineering sheet: title on the left, a small exploded stack with leader labels on the right, and a strip of caps notes along the bottom. Pills list the whole stack in four rows: platform, backend, frontend and services. Each pill carries an icon in ink: a Simple Icons brand mark, or a Lucide icon when no brand mark exists (Plaid, Didit, D1, KV, R2). Pills are PNG so the Inter font survives on GitHub. Show them at `height="26"`.

README screenshots live in `images/screens/` as PNG, with transparent rounded corners (radius 24 to 28 px) and a 2 px `#d0d7de` border baked in. GitHub removes CSS, so the image itself must carry the rounding.

README text follows the text rules above: paragraphs, not only lists, in STE style. Each sheet gets two to four short paragraphs, with the facts taken from the code. The Q&A section gives each answer a technical paragraph and a business paragraph (cost, complexity).

## UML sheets (flat 2D)

UML sheets use the same frame, palette and type as the blueprint sheets. They are flat, because UML notation must stay exact. The kit is `images/uml.py`. Render any sheet with `images/render.sh <name>`.

| Sheet | Kind | Generator |
|---|---|---|
| UML-01 | Use cases | `build-uml-usecases.py` |
| UML-02 | Entity-relationship (D1 tables) | `build-uml-erd.py` |
| UML-03 | Class diagram (Lending) | `build-uml-lending-classes.py` |
| UML-04, 05, 07 | Sequences: apply, approve, pay | `build-uml-sequences.py` |
| UML-06 | Package diagram: three stacked rounded 3D slabs on the left, flat packages on the right | `build-uml-packages.py` |
| UML-08 | Event bus: 3D flow on top, flat comparison table below | `build-uml-eventbus.py` |

Rules:
- Actors are stick figures. External systems are boxes with the «system» stereotype.
- Class boxes have three parts: name (with stereotype), attributes, operations. Code text uses a monospace font.
- Use green only for the aggregate root, the aggregate's tables, domain events and notes that carry the main point.
- Relations: a filled diamond means owns, a dashed open arrow means uses, a dashed hollow triangle means implements. Crow's foot means many, two bars mean one.
- Sequence messages: a solid line with a filled head is a call. A dashed line with an open head is a return. A dashed green line is a domain event. Each message has a step number in bold green text, with no circle.
- Message labels have a white halo, so they stay readable where they cross a lifeline.
- Show only the members that carry a rule. A class diagram is not a copy of the source.

## Spacing rules (learned the hard way)

- A sheet can be taller than 1000 px: set `bp.H` before `header()`. The title block moves with it, and `render.sh` reads the height from the SVG.
- 3D feature sheets are overviews. The class and sequence diagrams carry the detail, so keep only the wires that explain the layout.
- Put each block on the same row as the block it calls, so each wire runs straight across a gap.
- Leave at least 120 plane units between platforms. Wires need room, and so do their step numbers.
- When a wire would cross the whole sheet, drop it and put the step number on the block instead.
- Move the status machines, rules, keys and legends into a strip under the plane. The plane then takes the full width.
- In an ERD, give each context its own column and route lines through the channels between columns. A far foreign key to `users` is a `→ users` label, not a line.

## Mixing 3D and flat on one sheet

UML sheets may carry a 3D part. Keep tables, keys and notes flat so they stay readable.
- Set the camera for the 3D part (`bp.VIEW`, or `None` for isometric) and call `bp.fit(...)` with a box that holds only that part. Draw everything else after it, in flat coordinates.
- In a vertical stack, each upper slab hides the back of the one below. Put tiles in the front band of the slab: plane y greater than `PD - G + TILE_H`, where `G` is the gap between slabs. Otherwise the upper slab clips the icons.
- Draw links between slabs along the front-left edge, from the bottom of one slab to the top of the next. Put the label to the left of the arrow, away from the tiles.
- Name the layers on leader lines at the left, as in the stack sheets.

## Camera angle and readable text

Text lies on the 3D faces, so it takes on the shear of the plane's depth axis. At azimuth 22 the depth axis leans about 33 degrees and text is hard to read. At azimuth 7 to 10 it leans 6 to 8 degrees, which is fine.
- For a sheet with lots of text on 3D faces, use a near-frontal camera: azimuth 5 to 10, elevation 48 to 55. Examples: `(7, 52)` in UML-08, `(8, 50)` in UML-06, `(8, 68)` in CF-04.
- Use a higher azimuth only for shapes with little text.

## Rounded slabs

UML-06 draws rounded slabs with `rslab()` in `build-uml-packages.py`: the outline is a polygon, each side that faces the camera is a shaded quad, and the top face is drawn last.
- Stack three slabs for nested layers. The outer layer is the bottom slab and the core is the top slab, so an arrow that goes up is an arrow that points inward.
- Each slab is smaller than the one below, so the lower slab shows a front strip. Put its label in that strip.
- Draw each up arrow at the front edge of the slab above: from the lower slab's top face up to the underside of the upper slab. Put its label to the side, flat.

## Dark theme

Every sheet ships in two files: `name.svg` and `name-dark.svg`, with a PNG for each. Draw the sheet once, in the light palette. `blueprint.write_text()` makes the dark file from the same drawing by swapping each palette colour, so the two files cannot drift apart.

| Role | Light | Dark | Dark comes from |
|---|---|---|---|
| Page and box fill | `#ffffff`, `#fff` | `#0d1117` | The GitHub dark page |
| Ink and icons | `#14271f` | `#f2f1ec` | Keel `canvas`, a little lighter |
| Soft text | `#5d6963` | `#a6b1ab` | Keel `ink-3`, lighter |
| Accent | `#1f7a4d` | `#7fd1ae` | Keel `mint` |
| Accent tint | `#edf7f1` | `#102220` | Keel `accent-600` at 16 % on the page |
| Shaded faces | `#e5e7e6`, `#f3f4f4` | `#182426`, `#131b1f` | Keel `mint` at 10 % and 5 % |
| Grid | `#eceeed`, `#d9dcdb` | `#141d20`, `#1c2a2b` | Keel `mint` at 6 % and 13 % |
| Empty marks | `#bcc0be` | `#263b38` | Keel `mint` at 22 % |
| Note paper | `#f7f6f2` | `#24282d` | Keel `canvas` at 10 % |

Rules:
- Use only palette colours in a sheet. A colour that is not in the table stays the same in both themes. Add it to `DARK` in `blueprint.py` first.
- Sheets have rounded corners (24 px) and a transparent corner in the PNG, so they sit cleanly on either page colour. Pills and the hero follow the same rule. `render.sh` renders with a transparent background.
- In the README, wrap each image in `<picture>` with a `prefers-color-scheme: dark` source. GitHub picks the file from the viewer's theme setting. A bare SVG cannot do this, because the colour scheme in an SVG follows the operating system and not the GitHub setting.
- Product screenshots keep the real (light) interface in both themes. Only the border changes: `#d0d7de` in light, `#30363d` in dark.
- To check the dark theme without GitHub, load the page in Chromium with the colour scheme set to dark (for example Playwright's `colorScheme: 'dark'`). The `--blink-settings` flag does not change it.
