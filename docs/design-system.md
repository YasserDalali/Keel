# Blueprint design system (documentation diagrams)

Style for every diagram in `docs/`. Light-mode engineering drawing: white sheet, navy ink, one blue accent.

**Default view: 3D exploded isometric** (see "3D view" below). Reference sheet: `images/cf-stack-3d.svg` (CF-01), generator `images/build-cf-stack-3d.py`.
Use the flat 2D view only when a sheet has too much text for slanted tile faces. 2D reference: `images/cf-stack.svg`, generator `images/build-cf-stack.py`.

Every rule below applies to both views, unless the 3D section says otherwise.

## Canvas

| Item | Value |
|---|---|
| Size | 1600 × 1000, render PNG at 2× (3200 × 2000) |
| Background | `#ffffff` |
| Grid | 20 px minor `#e9eef6` 0.6 px, 100 px major `#d3dcea` 0.9 px |
| Frame | Outer rect 20 px inset, 1.5 px. Inner rect 30 px inset, 1 px |
| Title | 36 px, weight 600, top left at y=108. 1 px rule below at y=132 |
| Title block | Bottom right. Sheet id, sheet number, revision |

## Colour

| Token | Hex | Use |
|---|---|---|
| ink | `#14213d` | Lines, headings, icons |
| ink-soft | `#4a5670` | Captions |
| accent | `#1f4fe0` | Step circles, the domain box. Nothing else |
| accent-tint | `#f1f5ff` | Fill of the domain box |
| paper | `#ffffff` | Box fill |

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
python3 docs/images/build-cf-stack-3d.py
cd docs/images && google-chrome --headless --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1600,1000 --screenshot="$PWD/cf-stack-3d.png" "file://$PWD/cf-stack-3d.svg"
```

For the 2D sheet, use `build-cf-stack.py` and `cf-stack` in place of `build-cf-stack-3d.py` and `cf-stack-3d`.

Do not render with ImageMagick. It drops arrowheads and the background.

## Planned sheets

| Sheet | Subject |
|---|---|
| CF-01 | Cloudflare stack (done) |
| CF-02 | Bounded contexts and domain events (done: `cf-domain-3d`) |
| CF-03 | Inside Lending: Loan aggregate, services, ports, status machine (done: `cf-lending-3d`) |
| CF-04 | Inside Payments: use cases, gateway port, ledger, safety checks (done: `cf-payments-3d`) |
| CF-05 | Use cases: actors, system boundary, use cases by zone (done: `cf-usecases-3d`) |
| CF-06 | Request lifecycle: apply, approve, repay |

### Camera views

Give each sheet its own camera, so the set does not look the same. Set `bp.VIEW = (azimuth, elevation)` and call `bp.fit(width, depth, box)`. Fit sets the scale and origin so the plane fills a screen box. Sort the blocks with `bp.depth(x, y)`, and write the view in the title block (`title_block(..., view='AXO 18/42')`).

| Sheet | View | Look |
|---|---|---|
| CF-01 | isometric (`VIEW = None`) | exploded stack |
| CF-02 | isometric (`VIEW = None`) | one plane, diagonal |
| CF-03 | `(18, 42)` | low and wide. Text runs almost flat |
| CF-04 | `(8, 68)` | almost overhead, like a plan with depth |
| CF-05 | `(80, 45)` | mirrored: blocks show their left side, and the long side runs flat |

**Upright labels (billboards).** When text must stay level at any angle, project the anchor with `iso()` and draw the text flat on the sheet. CF-05 does this for every label, so its camera is free. Actors are an icon standing on a disc on the floor, with the name and role under it. Start an actor's line past its label so the line does not cross the text.

**Transposed layouts.** At an azimuth above 45, the plane's y axis is the flat one. Write the layout as usual, wrap the floor in `matrix(0,-1,1,0,0,W)`, and project anchors with `iso(y, W - x)`. The data then keeps its left-to-right order on screen (see `build-cf-usecases-3d.py`).

Keep the azimuth between 0 and 90, because the side faces assume it. A low azimuth makes the roof text easier to read. A high elevation flattens the blocks but makes the plane taller, so give it more height or move the key into the left column.

Context sheets (CF-03, CF-04) put one platform per layer: application, domain, infrastructure. Draw the aggregate boundary as a blue dashed rectangle on the domain floor. A fourth arrow style, dash-dot `9 3 2 3`, means "implements a port". When an arrow runs through the back margin, put the floor labels at the front (`floor_labels(..., y=PD - 8)`).

## 3D view (default)

Exploded isometric view. Reference: `images/cf-stack-3d.svg`. Generator: `images/build-cf-stack-3d.py`.

All 3D sheets import `images/blueprint.py` (projection, slabs, tiles, badges, header, leaders, key, title block). A new sheet is one `build-<name>-3d.py` file that only places content.

Two layouts:
- **Single plane** (default, CF-02): all blocks stand on one ground slab and arrows show the relations. Small blocks (24 px high), wide gaps, so the arrows carry the picture. Arrows and step circles lie at roof height, drawn after every block. Columns run along x: upstream, core (with the bus), downstream. Each column stands on its own platform with a 70-unit gap. Column names lie on the platform floor at y=42, and blocks start at y=90 so the names stay clear. Turn the bus label with `rotate(-90)` so it reads upward. Put arrow joints in the middle of a gap, away from both platform edges. Set `bp.K` (plane scale) so the plane fits, and enlarge the roof text to match.
- **Exploded stack** (CF-01): one slab per layer. Use it only when the subject is layers, not relations.

Arrow styles on a single plane: solid = calls a port, dashed `6 4` = publishes an event, dotted `1.5 3.5` = reads tables. Show the legend top left.

These rules apply to the exploded stack and replace the 2D "Step circles" and connector rules:

- Projection: 30° isometric. `X = ox + (x − y)·0.866`, `Y = oy + (x + y)·0.5 − z`.
- One slab per layer, stacked top to bottom in request order: edge, worker, bindings. Slab 460 × 200, 10 px thick, 195 px apart.
- Tiles are extruded 12 px. Draw their text and icons on the top face with `matrix(0.866, 0.5, −0.866, 0.5, …)`.
- Shading: right face `#e3e9f2`, left face `#f2f5fa`, top face white with the minor grid.
- Fill with `style="fill:…"`, not the `fill` attribute. The `.ink` class sets `fill:none` and wins over the attribute.
- Draw from bottom to top: lower slab, risers, upper slab. Upper layers hide lower ones.
- Risers: 1 px dashed lines at the left and right slab corners only.
- Step circles sit on the tile top face, back right corner, and are drawn in the plane, so they show as ellipses.
- Layer names sit on leader lines on the left, in flat 2D. Providers and the key stay flat 2D.
- No vertical arrows between slabs. They always cross the tiles below. The step numbers and risers carry the flow.
- Tile text: title plus one short caption. Slanted text is harder to read, so cut harder than in 2D.

## README art

`images/build-readme-art.py` makes the README hero (`readme/hero.png`) and the pill badges (`readme/pill-*.png`) in the same style. The hero copies the layout of an engineering sheet: title on the left, a small exploded stack with leader labels on the right, and a strip of caps notes along the bottom. Pills are PNG so the Inter font survives on GitHub. Show them at `height="28"` so all seven fit on one row.
