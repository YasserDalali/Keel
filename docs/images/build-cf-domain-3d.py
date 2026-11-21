# CF-02: the business domain as a context map. Three platforms (upstream, core, downstream) on one level,
# relations as arrows. Writes cf-domain-3d.svg next to this file. Facts come from
# api/src/contexts/*/domain/events.ts, */application/subscribers.ts and app/wiring/*.ts.
import blueprint as bp
bp.OX, bp.OY, bp.K, bp.TILE_H = 800, 205, 0.82, 24
from blueprint import ACC, INK, EVT, READ, card, face, floor_labels, header, key, lu, platform, tile, badge, title_block, write

H, PD = bp.TILE_H, 520
DY = 20  # extra back margin so the column titles clear the blocks
o = [header('Keel: the business domain')]

# Platforms: upstream x 0-250, core x 320-710, downstream x 780-1020.
o += [platform(0, 250, PD), platform(320, 390, PD), platform(780, 240, PD)]
o.append(floor_labels(((30, 'UPSTREAM'), (350, 'CORE DOMAIN'), (800, 'DOWNSTREAM'))))

# Blocks (x, y, w, d, inner, accent), drawn back to front.
tiles = [
    (30, 70, 190, 110, card('user-round-check', 'IDENTITY', 'User'), False),
    (30, 290, 190, 110, card('id-card', 'BORROWER', 'Profile, bank link'), False),
    (350, 70, 200, 110, card('hand-coins', 'LENDING', 'Loan aggregate', ACC) + badge(2, 182, 18), True),
    (350, 290, 200, 110, card('wallet', 'PAYMENTS', 'Ledger'), False),
    (640, 70, 40, 355, '<text x="20" y="177" class="t" text-anchor="middle" transform="rotate(-90 20 177)" dy="5" '
                       'style="font-size:13px">EVENTBUS</text>', False),
    (800, 70, 200, 95, card('file-text', 'DOCUMENTS', 'PDF files'), False),
    (800, 200, 200, 95, card('mail', 'COMMUNICATION', 'Email, alerts'), False),
    (800, 330, 200, 95, card('chart-column', 'REPORTING', 'Read models'), False),
]
for x, y, w, d, inner, acc in sorted(tiles, key=lambda t: t[0] + t[1]):
    o.append(tile(x, y + DY, w, d, 0, inner, acc))

# Relations at roof height, drawn after the blocks. Solid: calls a port. Dashed: event. Dotted: reads tables.
o.append(face(H) + f'<g transform="translate(0,{DY})">' +
         '<path d="M220 125 H348" class="ink" marker-end="url(#ae)"/>'
         '<path d="M220 345 H300 V125" class="ink"/>'  # joint mid-gap, clear of both platform edges
         '<path d="M450 290 V182" class="ink" marker-end="url(#ae)"/>'
         f'<path d="M550 125 H638" class="ink" style="{EVT}" marker-end="url(#ae)"/>'
         f'<path d="M680 117 H798" class="ink" style="{EVT}" marker-end="url(#ae)"/>'
         f'<path d="M680 247 H798" class="ink" style="{EVT}" marker-end="url(#ae)"/>'
         f'<path d="M640 345 H552" class="ink" style="{EVT}" marker-end="url(#ae)"/>'
         f'<path d="M450 400 V462 H900 V427" class="ink" style="{READ}" marker-end="url(#ae)"/>'
         + badge(1, 324, 125) + badge(3, 450, 236) + badge(4, 594, 125) + badge(5, 739, 117)
         + badge(6, 739, 247) + badge(7, 600, 462) + '</g></g>')

# Left column: line legend, event matrix, icon map (flat)
o.append('<text x="60" y="180" class="t">RELATIONS</text>')
for i, (style, label) in enumerate((('', 'Calls a port'), (EVT, 'Publishes an event'), (READ, 'Reads the tables'))):
    y = 208 + i * 26
    o.append(f'<path d="M60 {y} H104" class="ink" style="{style}" marker-end="url(#ae)"/><text x="118" y="{y+4}" class="s">{label}</text>')

COLS = (('P', 270, 'wallet', 'Payments: ledger entry'), ('D', 310, 'file-text', 'Documents: PDF file'),
        ('M', 350, 'mail', 'Communication: email, alert'))
o.append('<text x="60" y="310" class="t">DOMAIN EVENTS</text>')
for _, x, ic, _ in COLS:
    o.append(lu(ic, x - 10, 322, 20))
events = (('LENDING', (('loan-applied', 'M'), ('loan-approved', 'PDM'), ('loan-declined', 'M'), ('loan-cancelled', 'M'),
                       ('deposit-paid', 'DM'), ('installment-paid', 'DM'), ('loan-repaid', ''))),
          ('IDENTITY', (('user-registered', 'D'), ('verification-requested', 'M'))))
y = 364
for group, rows in events:
    o.append(f'<text x="60" y="{y}" class="t" style="font-size:10px">{group}</text>')
    y += 22
    for name, subs in rows:
        o.append(f'<text x="60" y="{y}" class="s">{name}</text>')
        for col, x, _, _ in COLS:
            o.append(f'<circle cx="{x}" cy="{y-4}" r="4.5" fill="{INK}"/>' if col in subs
                     else f'<circle cx="{x}" cy="{y-4}" r="1.5" fill="#bcc0be"/>')
        o.append(f'<line x1="60" y1="{y+7}" x2="365" y2="{y+7}" stroke="#eceeed" stroke-width="1"/>')
        y += 22
    y += 8
o.append(f'<text x="60" y="{y+12}" class="t" style="font-size:10px">ICONS</text>')
for i, (_, _, ic, label) in enumerate(COLS):
    yy = y + 40 + i * 26
    o.append(lu(ic, 60, yy - 14, 18) + f'<text x="88" y="{yy}" class="s">{label}</text>')

o.append(key(['Identity and Borrower answer the ApplicantGateway port.', 'The Loan aggregate applies the rules and records events.',
              'Payments gets quotes from Lending. Lending applies each payment.', 'Lending publishes its events after the save.',
              'Documents makes a PDF for each event it receives.', 'Communication sends notifications and emails.',
              'Reporting reads the loan and payment tables directly.'], y0=800))
o.append(title_block('CF-02 DOMAIN'))
write('cf-domain-3d', o)
