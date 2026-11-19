# README art for Keel in the blueprint style: the hero banner and the pill badges. Writes SVGs into readme/ and renders
# each to PNG with headless Chrome (PNG keeps the Inter font; GitHub would fall back to another font in an SVG).
import os, subprocess
import blueprint as bp
bp.OX, bp.OY, bp.K = 1170, 262, 0.5
from blueprint import ACC, INK, PD, SOFT, Z, iso, lu, risers, slab, tile

OUT = os.path.join(bp.HERE, 'readme')
os.makedirs(OUT, exist_ok=True)

def head(w, h):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="Inter, Helvetica, Arial, sans-serif">
<defs>
<pattern id="minor" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e9eef6" stroke-width="0.6"/></pattern>
<pattern id="major" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#minor)"/><path d="M100 0H0V100" fill="none" stroke="#d3dcea" stroke-width="0.9"/></pattern>
</defs>
<style>
.ink{{stroke:{INK};fill:none;stroke-width:1.5;stroke-linejoin:round}}.thin{{stroke:{INK};fill:none;stroke-width:1}}
.acc{{stroke:{ACC};fill:none;stroke-width:2}}.dash{{stroke:{INK};fill:none;stroke-width:1;stroke-dasharray:4 3}}
.t{{fill:{INK};font-size:11px;letter-spacing:1.6px;font-weight:600}}.s{{fill:{SOFT};font-size:12px}}
</style>'''

def render(name, w, h):
    svg, png = os.path.join(OUT, name + '.svg'), os.path.join(OUT, name + '.png')
    subprocess.run(['google-chrome', '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=2', f'--window-size={w},{h}', f'--screenshot={png}', f'file://{svg}'],
                   check=True, capture_output=True)

# --- hero -----------------------------------------------------------------
W, H = 1600, 560
o = [head(W, H), f'<rect width="{W}" height="{H}" fill="#fff"/><rect width="{W}" height="{H}" fill="url(#major)"/>',
     f'<rect x="10" y="10" width="{W-20}" height="{H-20}" class="ink"/>',
     '<text x="60" y="90" class="t">KEEL · SHEET 00</text>',
     f'<text x="60" y="172" fill="{INK}" font-size="68" font-weight="600" letter-spacing="-1">Keel</text>',
     f'<text x="60" y="222" fill="{INK}" font-size="24">Small business loans, serverless</text>',
     f'<text x="60" y="254" fill="{INK}" font-size="24">on Cloudflare, built with DDD.</text>']

TOP, MID, BOT = Z
icons = {TOP: ('shield-check', 'bot', 'panels-top-left'), MID: ('list-checks', 'hand-coins', 'plug'),
         BOT: ('database', 'key-round', 'archive')}
for z in (BOT, MID, TOP):  # bottom first: upper slabs hide what is under them
    o.append(slab(z))
    for x, ic in zip((15, 165, 315), icons[z]):
        o.append(tile(x, 30, 130, 140, z, lu(ic, 37, 42, 56, ACC if ic == 'hand-coins' else INK), ic == 'hand-coins'))
    if z != TOP:
        o.append(risers(z + bp.GAP))

for z, name in ((TOP, 'Edge'), (MID, 'Worker'), (BOT, 'Bindings')):  # leader lines, like an engineering sheet
    X, Y = iso(0, PD, z)
    o.append(f'<line x1="760" y1="{Y:.1f}" x2="{X - 5:.1f}" y2="{Y:.1f}" class="thin"/>'
             f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="2.5" fill="{INK}"/>'
             f'<text x="760" y="{Y + 22:.1f}" fill="{INK}" font-size="18">{name}</text>')

o.append(f'<line x1="60" y1="470" x2="{W-60}" y2="470" class="thin"/>')
# Footer row, like a drawing's notes strip: (x, y, text) so columns line up without padding spaces
foot = [(60, 500, 'A FULL LENDING PLATFORM'), (60, 517, 'ON ONE CLOUDFLARE WORKER.'),
        (560, 500, 'BUILT ON:'), (680, 500, '→ D1'), (680, 517, '→ KV'), (680, 534, '→ R2'),
        (1060, 500, 'DDD   →'), (1150, 500, 'SEVEN BOUNDED CONTEXTS,'), (1150, 517, 'TALKING THROUGH DOMAIN EVENTS.')]
for x, y, line in foot:
    o.append(f'<text x="{x}" y="{y}" class="t" style="font-size:12px;letter-spacing:2.4px">{line}</text>')
o.append('</svg>')
open(os.path.join(OUT, 'hero.svg'), 'w').write('\n'.join(o))
render('hero', W, H)

# --- pills ----------------------------------------------------------------
# (label, icon kind, icon name). Brand marks come from Simple Icons, the rest from Lucide. All drawn in ink.
PILLS = [('Cloudflare Workers', 'si', 'cloudflare'), ('D1 · KV · R2', 'lu', 'database'), ('Hono', 'si', 'hono'),
         ('TypeScript', 'si', 'typescript'), ('Domain-Driven Design', 'lu', 'boxes'), ('Vitest', 'si', 'vitest'),
         ('Design system', 'lu', 'ruler')]
for label, kind, icon in PILLS:
    text = label.upper()
    w, h = int(62 + len(text) * 9.4), 40
    # ponytail: 2.2 px icon strokes looked heavy at pill size; Lucide icons draw at 1.5 px here, brand marks
    # are solid shapes, so they shrink to 18 px to sit lighter.
    bp.ICON_PX = 1.5
    mark = bp.si(icon, 16, 11, 18) if kind == 'si' else lu(icon, 15, 10, 20)
    svg = (head(w, h) + f'<rect x="1" y="1" width="{w-2}" height="{h-2}" rx="19" class="ink" style="fill:#fff"/>' + mark +
           f'<text x="44" y="24.5" class="t" style="font-size:12px;letter-spacing:1.8px">{text}</text></svg>')
    slug = label.lower().replace(' · ', '-').replace(' ', '-')
    open(os.path.join(OUT, f'pill-{slug}.svg'), 'w').write(svg)
    render(f'pill-{slug}', w, h)
print('ok', sorted(os.listdir(OUT)))
