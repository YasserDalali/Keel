# CF-05: use cases. The system is one platform. Use cases lie on its floor as ellipses, grouped in zones.
# Actors stand around it. Every label is drawn upright (billboard), so the camera can take any angle.
# Writes cf-usecases-3d.svg next to this file. Facts come from the routes in api/src/contexts/*/interface/*.ts,
# their requireAuth/requireRole guards, the Turnstile check on register and login, and the cron in api/src/index.ts.
import blueprint as bp
bp.VIEW, bp.TILE_H = (80, 45), 24
PW, PD = 1000, 640
# The layout below is written in data coordinates (x across, y back to front). It is transposed onto the plane
# (plane x = data y, plane y = 1000 - data x). At azimuth 80 plane y runs flat and leftwards, so the flip keeps
# the data's left-to-right order on screen, and the blocks show their left side: a mirrored view.
bp.fit(780, 1250, (60, 200, 1545, 850), xmin=-200, ymin=-250)
from blueprint import INK, block, face, header, iso, lu, platform, si, title_block, wire, write

o = [header('Keel: use cases')]
o.append(platform(0, PD, PW))
SWAP = '<g transform="matrix(0,-1,1,0,0,1000)">'  # data (x, y) -> plane (y, 1000 - x)

def at(x, y, z=0):
    return iso(y, 1000 - x, z)

ZONES = {  # name: (x0, y0, w, d, [(use case, cx, cy), ...])
    'ACCOUNT': (40, 40, 260, 250, [('Register', 170, 125), ('Log in', 170, 190), ('Verify email', 170, 255)]),
    'DECISIONS': (360, 40, 280, 250, [('Review applicant', 500, 125), ('Approve loan', 500, 190), ('Decline loan', 500, 255)]),
    'SCHEDULED': (700, 40, 260, 250, [('Mark overdue', 830, 165)]),
    'TRACKING': (40, 330, 260, 270, [('View schedule', 170, 405), ('Download documents', 170, 460),
                                      ('Read notifications', 170, 515), ('Set reminders', 170, 570)]),
    'BORROWING': (360, 330, 280, 270, [('Apply for loan', 500, 405), ('Pay deposit', 500, 460),
                                        ('Cancel application', 500, 515), ('Pay installment', 500, 570)]),
    'ONBOARDING': (700, 330, 260, 270, [('Complete profile', 830, 415), ('Verify identity', 830, 480), ('Link bank', 830, 545)]),
}
RX, RY = 92, 24

# Floor: zones, then associations, then ellipses (so lines end under the ellipse edges)
floor = face(0) + SWAP
for name, (x0, y0, w, d, _) in ZONES.items():
    floor += f'<rect x="{x0}" y="{y0}" width="{w}" height="{d}" rx="14" class="dash"/>'
floor += (
    wire('M-146 190 H38', end=False) +                                  # visitor -> account
    wire('M500 -55 V38', end=False) +                                  # officer -> decisions (starts below the label)
    wire('M830 -55 V38', end=False) +                                  # scheduler -> scheduled
    wire('M-146 520 H-40 V622 H830', end=False) +                       # borrower -> bus along the front
    ''.join(wire(f'M{x} 622 V602', end=False) for x in (170, 500, 830)) +   # bus -> tracking, borrowing, onboarding
    wire('M1110 480 H924', end=False) + wire('M1110 545 H924', end=False) +  # Didit, Plaid
    wire('M1110 720 H670 V460 H594', end=False) + wire('M670 570 H594', end=False))  # PayPal -> deposit, installment
for name, (_, _, _, _, cases) in ZONES.items():
    for _, cx, cy in cases:
        floor += f'<ellipse cx="{cx}" cy="{cy}" rx="{RX}" ry="{RY}" class="ink" style="fill:#fff"/>'
floor += '</g></g>'
o.append(floor)

def label(x, y, text, cls='s', size=12.5, anchor='middle', dy=4, fill=INK):
    X, Y = at(x, y)
    return (f'<text x="{X:.1f}" y="{Y + dy:.1f}" class="{cls}" text-anchor="{anchor}" '
            f'style="fill:{fill};font-size:{size}px">{text}</text>')

for name, (x0, y0, _, _, cases) in ZONES.items():
    o.append(label(x0 + 16, y0 + 18, name, 't', 11, 'start'))
    for text, cx, cy in cases:
        o.append(label(cx, cy, text))

def actor(x, y, icon, name, role):
    """Standing figure: a disc on the floor, the icon upright above it, the name and role below."""
    X, Y = at(x, y)
    return (face(0) + f'<ellipse cx="{y}" cy="{1000 - x}" rx="34" ry="34" class="ink" style="fill:#fff"/></g>' +
            lu(icon, X - 24, Y - 52, 48) +
            f'<text x="{X:.1f}" y="{Y + 30:.1f}" class="h" text-anchor="middle" style="font-size:14px">{name}</text>'
            f'<text x="{X:.1f}" y="{Y + 47:.1f}" class="s" text-anchor="middle">{role}</text>')

def system(x, y, logo, name):
    """Secondary actor: an external system, drawn as a block with an upright logo and name."""
    X, Y = at(x + 70, y + 30, bp.TILE_H)
    return (block(y, 1000 - x - 140, 60, 140, 0, bp.TILE_H) + logo(X - 34, Y - 11) +
            f'<text x="{X - 8:.1f}" y="{Y + 5:.1f}" class="h" style="font-size:13px">{name}</text>')

o.append(actor(-180, 175, 'user-round', 'VISITOR', 'Not signed in'))
o.append(actor(500, -170, 'user-round-cog', 'OFFICER', 'Officer or admin role'))
o.append(actor(830, -170, 'clock', 'SCHEDULER', 'Cron, daily 06:00 UTC'))
o.append(system(1110, 450, lambda x, y: lu('scan-face', x, y, 22), 'DIDIT'))
o.append(system(1110, 518, lambda x, y: lu('landmark', x, y, 22), 'PLAID'))
o.append(system(1110, 690, lambda x, y: si('paypal', x, y, 22), 'PAYPAL'))
o.append(actor(-180, 520, 'user-round', 'BORROWER', 'Signed in'))

# Notes (flat, bottom left)
notes = ['Register and log in pass a Turnstile check first.',
         'Officer cases need the officer or admin role. A borrower sees only their own loans.',
         'Demo mode adds shortcuts. They are not shown.']
o.append('<text x="60" y="880" class="t">NOTES</text>')
for i, n in enumerate(notes):
    o.append(f'<text x="60" y="{904 + i * 20}" class="s">{n}</text>')
o.append(title_block('CF-05 USE CASES', view='AXO 80/45'))
write('cf-usecases-3d', o)
