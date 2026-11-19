# UML-06: how the code is organised. Left (3D): the layers of one context as three stacked rounded slabs.
# Right: the packages in api/src. Bottom: the rules that api/test/architecture.spec.ts enforces.
import textwrap
import blueprint as bp
bp.H = 1100
from blueprint import ACC, INK
import uml
from uml import MONO, TINT, line, note, text

o = uml.sheet('How the code is organised')

def pkg(x, y, w, h, name, lines=(), accent=False, mono_name=True, size=13):
    """UML package: a folder tab on top of a body, name in the tab, lines in the body."""
    col, fill = (ACC, TINT) if accent else (INK, '#fff')
    tw = max(70, len(name) * 8 + 24)
    o.append(f'<path d="M{x} {y} H{x+tw} V{y+22} H{x+w} V{y+h} H{x} Z" style="fill:{fill};stroke:{col};stroke-width:{2 if accent else 1.5}"/>'
             f'<line x1="{x}" y1="{y+22}" x2="{x+tw}" y2="{y+22}" style="stroke:{col};stroke-width:1"/>')
    o.append(text(x + 10, y + 16, name, 'h', style=f'{MONO if mono_name else ""};font-size:{size}px;{"fill:" + ACC if accent else ""}'))
    for i, l in enumerate(lines):
        o.append(text(x + 12, y + 46 + i * 18, l, style='font-size:12px'))

# --- left: the layers of one context, as three rounded slabs stacked in 3D ------------------------------
# The old nested rings, lifted apart. The outer ring (interface and infrastructure) is the bottom slab, the
# application ring sits above it and the domain on top. Arrows go up: every dependency points inward.
import math
from blueprint import SIDE_X, SIDE_Y
o.append(text(60, 190, 'INSIDE EVERY CONTEXT', 't'))
bp.VIEW, bp.TILE_H = (8, 50), 14
PW_, PD_ = 440, 260
G, TH = 150, 14                                      # gap between slabs, slab thickness
bp.fit(PW_, PD_, (320, 225, 835, 790), h=2 * G + TH)
iso, face = bp.iso, bp.face

def rpts(x, y, w, d, r, n=7):
    """Outline of a rounded rectangle, clockwise on the screen (plane y runs down)."""
    pts = []
    for cx, cy, a0 in ((x + r, y + r, 180), (x + w - r, y + r, 270), (x + w - r, y + d - r, 0), (x + r, y + d - r, 90)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def mix(c0, c1, t):
    a = [int(c0[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(a[k] + (b[k] - a[k]) * t):02x}' for k in range(3))

def rslab(x, y, w, d, r, z, accent=False):
    """Extruded rounded slab: sides that face the camera, shaded by direction, then the top face."""
    P = rpts(x, y, w, d, r)
    n_ = len(P)
    az = math.radians(bp.VIEW[0])
    vis, out = [], ''
    for i in range(n_):
        (x0, y0), (x1, y1) = P[i], P[(i + 1) % n_]
        nx, ny = (y1 - y0), -(x1 - x0)
        ln = math.hypot(nx, ny) or 1
        nx, ny = nx / ln, ny / ln
        v = nx * math.sin(az) + ny * math.cos(az) > 0
        vis.append(v)
        if v:
            fill = mix(SIDE_X, SIDE_Y, max(0, min(1, ny)))
            q = ' '.join(f'{a:.1f},{b:.1f}' for a, b in (iso(x0, y0, z), iso(x1, y1, z), iso(x1, y1, z + TH), iso(x0, y0, z + TH)))
            out += f'<polygon points="{q}" style="fill:{fill};stroke:{fill};stroke-width:.6"/>'
    # outline: bottom edge of the visible run, and a vertical edge where visibility changes
    path = ''
    for i in range(n_):
        if vis[i]:
            (x0, y0), (x1, y1) = P[i], P[(i + 1) % n_]
            if not vis[i - 1]:
                path += 'M%.1f %.1f ' % iso(x0, y0, z)
            path += 'L%.1f %.1f ' % iso(x1, y1, z)
    out += f'<path d="{path}" class="ink" style="stroke-linejoin:round"/>'
    for i in range(n_):
        if vis[i] != vis[i - 1]:
            px, py = P[i]
            out += '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" class="ink"/>' % (iso(px, py, z) + iso(px, py, z + TH))
    top = ' '.join(f'{a:.1f},{b:.1f}' for a, b in (iso(px, py, z + TH) for px, py in P))
    col, fill = (ACC, TINT) if accent else (INK, '#fff')
    out += f'<polygon points="{top}" style="fill:{fill};stroke:{col};stroke-width:{2 if accent else 1.5};stroke-linejoin:round"/>'
    return out

def up(x, y, z_from, z_to, label, side='right'):
    """Arrow straight up from the lower slab's top to the underside of the upper slab, with a flat label beside it."""
    (X0, Y0), (X1, Y1) = iso(x, y, z_from + TH), iso(x, y, z_to)
    out = f'<path d="M{X0:.1f} {Y0:.1f} L{X1:.1f} {Y1:.1f}" class="ink" marker-end="url(#ae)"/>'
    lx, anchor = (X0 + 12, 'start') if side == 'right' else (X0 - 12, 'end')
    return out + text(lx, (Y0 + Y1) / 2 + 4, label, anchor=anchor, style='font-size:12px;paint-order:stroke;stroke:#fff;stroke-width:4px')

def label(x, y, z, s, cls='t', size=12, color=INK, anchor='start'):
    """Text lying on a slab's top face (plane coordinates)."""
    return face(z + TH) + text(x, y, s, cls, anchor, f'font-size:{size}px;fill:{color}') + '</g>'

Z0, Z1, Z2 = 0, G, 2 * G
# bottom: interface | infrastructure
o.append(rslab(0, 0, PW_, PD_, 26, Z0))
o.append(face(Z0 + TH) + f'<line x1="220" y1="24" x2="220" y2="{PD_ - 24}" class="dash"/></g>')
o.append(label(60, 245, Z0, 'INTERFACE', 'h', 15))
o.append(label(245, 245, Z0, 'INFRASTRUCTURE', 'h', 15))
# middle: application
o.append(rslab(50, 45, 340, 170, 22, Z1))
o.append(label(72, 199, Z1, 'APPLICATION', 'h', 15))
# top: domain
o.append(rslab(105, 45, 230, 130, 16, Z2, accent=True))
o.append(label(124, 74, Z2, 'DOMAIN', 'h', 15, ACC))
o.append(label(124, 92, Z2, 'Pure TypeScript', 's', 12))
for i, l in enumerate(['aggregates, entities', 'value objects, rules', 'domain events', 'repository interfaces']):
    o.append(label(124, 114 + i * 17, Z2, l, 's', 12, INK))
# arrows up: each one crosses a gap, from the layer outside to the layer inside
o.append(up(88, 215, Z0, Z1, 'calls', 'left'))
o.append(up(352, 215, Z0, Z1, 'implements', 'right'))
o.append(up(220, 175, Z1, Z2, 'calls', 'right'))

# Layer names on leader lines at the left, like an engineering sheet
for z, x0, yf, name, cap in ((Z2, 105, 175, 'DOMAIN', 'Pure TypeScript, no outside imports'),
                             (Z1, 50, 215, 'APPLICATION', 'Use cases and the ports they need'),
                             (Z0, 0, 260, 'INTERFACE AND INFRASTRUCTURE', 'Routes call use cases. Adapters talk to D1, R2 and providers.')):
    X, Y = iso(x0, yf - 20, z + TH)
    color = f'fill:{ACC};' if name == 'DOMAIN' else ''
    o.append(f'<line x1="60" y1="{Y:.1f}" x2="{X-6:.1f}" y2="{Y:.1f}" class="thin"/><circle cx="{X:.1f}" cy="{Y:.1f}" r="2.5" fill="{ACC if name == "DOMAIN" else INK}"/>'
             + text(60, Y - 9, name, 'h', style=f'font-size:13.5px;{color}'))
    for j, line_ in enumerate(textwrap.wrap(cap, 34)):
        o.append(text(60, Y + 15 + j * 16, line_, style='font-size:12px'))
o.append(text(330, 830, 'Every arrow points up and inward. The domain depends on nothing outside.', style=f'font-size:12.5px;fill:{INK}'))

# --- right: the packages in api/src ------------------------------------------------
o.append(text(840, 190, 'THE PACKAGES IN api/src', 't'))
pkg(840, 210, 700, 270, 'contexts/', ['One package per bounded context. Each has the same four layers.'])
CTX = [('identity', 'accounts, email checks'), ('borrower', 'profile, KYC, bank'), ('lending', 'the Loan: core domain'),
       ('payments', 'money in, the ledger'), ('documents', 'PDFs in R2'), ('communication', 'alerts and email'),
       ('reporting', 'read models')]
for i, (name, role) in enumerate(CTX):
    col, row = i % 4, i // 4
    x, y = 860 + col * 168, 280 + row * 95
    pkg(x, y, 156, 70, name, [role], accent=(name == 'lending'), size=12.5)
pkg(840, 520, 340, 120, 'shared/', ['The shared kernel, deliberately tiny:', 'Money, Clock, IdGenerator, DomainError,',
                                    'EventBus, crypto, the overdue rule'])
pkg(1200, 520, 340, 120, 'app/', ['The composition root: container.ts and', 'wiring/&lt;context&gt;.ts build every class.',
                                  'http.ts maps each domain error to a status.'])
pkg(840, 670, 340, 80, 'middleware/', ['requireAuth, requireRole, turnstile'])
pkg(1200, 670, 340, 80, 'index.ts', ['Mounts the routers. Exports the Worker', 'and the daily cron.'])

# package dependencies (dashed, open head): app builds contexts, contexts use shared, index uses app
o.append(line('M1370 520 V482', 'dashed', end='open') + text(1380, 505, 'builds', style='font-size:11px'))
o.append(line('M1010 482 V518', 'dashed', end='open') + text(1020, 505, 'uses', style='font-size:11px'))
o.append(line('M1370 670 V642', 'dashed', end='open') + text(1380, 660, 'uses', style='font-size:11px'))

# --- bottom: the rules the architecture test enforces -------------------------------
o.append(f'<line x1="60" y1="860" x2="1540" y2="860" class="thin" style="stroke:#d3dcea"/>')
o.append(text(60, 890, 'GUARDED BY api/test/architecture.spec.ts', 't'))
rules = ['Domain code depends only on the shared kernel and its own domain.',
         'Domain code never touches the platform: no Hono, no D1, no fetch.',
         'Application code does not depend on infrastructure or the web layer.',
         'A context never reaches into the infrastructure or interface of another context.',
         'Interface code calls use cases. It contains no repositories and no SQL.']
for i, r in enumerate(rules):
    x, y = (60, 920 + i * 24) if i < 3 else (760, 920 + (i - 3) * 24)
    o.append(bp.lu('check', x, y - 12, 14, ACC) + text(x + 22, y, r))
uml.finish(o, 'uml-packages', 'UML-06 STRUCTURE', view='ISO + FLAT')
