# UML-08: the event bus. Top (3D): what happens when a loan is approved. Bottom (flat): how the in-process bus compares
# with a broker. Facts come from api/src/shared/events.ts, the use cases in contexts/lending/application, and the
# subscribers in contexts/{payments,communication,documents}/application/subscribers.ts.
import html
import blueprint as bp
bp.H = 1300
bp.VIEW, bp.TILE_H = (7, 52), 24       # near-frontal camera: text leans about 6 degrees, so it stays readable
from blueprint import ACC, INK, card, chip, face, key, platform, tile, badge, wire
import uml
from uml import TINT, note, text

o = uml.sheet('The event bus')
PW, PD = 1030, 330
bp.fit(PW, PD, (60, 190, 1545, 670))   # the 3D part fills this box; everything below is flat 2D
H = bp.TILE_H
o.append(text(60, 186, 'WHAT HAPPENS WHEN A LOAN IS APPROVED', 't'))
o.append(platform(0, PW, PD))

esc = html.escape
tiles = [
    (20, 30, 170, 130, card('hand-coins', 'LOAN', 'Aggregate root', ACC, lines=['records loan-approved'], size=16), True),
    (245, 30, 190, 130, card('list-checks', 'APPROVELOAN', 'Use case', lines=['approve, save, publish'], size=16), False),
    (245, 200, 190, 100, card('database', 'D1', 'One batch for the loan', size=16), False),
    (510, 15, 230, 300, card('radio-tower', 'EVENTBUS', 'In memory, in the Worker', ACC, size=16,
                             lines=['subscribe(type, handler)', 'publish(events)', '', esc('Map<type, handler[]>'),
                                    'each handler in try/catch']), True),
    (810, 15, 200, 85, chip('wallet', 'PAYMENTS', 'writes the disbursement', size=14), False),
    (810, 120, 200, 85, chip('mail', 'COMMUNICATION', 'notifies, sends the email', size=13), False),
    (810, 225, 200, 85, chip('file-text', 'DOCUMENTS', 'renders the loan PDF', size=14), False),
]
for x, y, w, d, inner, acc in sorted(tiles, key=lambda t: bp.depth(t[0], t[1])):
    o.append(tile(x, y, w, d, 0, inner, acc))

EVT = 'stroke-dasharray:6 4;stroke:#1f4fe0'
o.append(face(H) +
         wire('M190 95 H243') +                  # 1 Loan -> use case (pullEvents)
         wire('M340 160 V198') +                 # 2 use case -> D1 (save)
         wire('M435 95 H508') +                  # 3 use case -> bus (publish)
         wire('M740 57 H808', EVT) + wire('M740 162 H808', EVT) + wire('M740 267 H808', EVT) +   # 4 to 6 the handlers
         badge(1, 217, 95) + badge(2, 340, 179) + badge(3, 472, 95)
         + badge(4, 774, 57) + badge(5, 774, 162) + badge(6, 774, 267) + '</g>')

o.append(key(['The Loan records loan-approved. The use case pulls the event with pullEvents().',
              'The use case saves the Loan to D1, in one batch.',
              'After the save, the use case publishes the event to the bus.',
              'The bus calls the Payments handler, which writes the disbursement entry.',
              'The bus calls the Communication handler, which notifies the borrower and sends the email.',
              'The bus calls the Documents handler, which renders the loan agreement PDF into R2.'], y0=700, x=60))
o.append(note(960, 716, 520, ['A handler that throws is logged. The loan stays approved.',
                              'Each handler subscribes once at startup, in app/wiring/.',
                              'Nothing is stored between the steps.'], accent=True))

# --- comparison table (flat) ---------------------------------------------------------
o.append(text(60, 880, 'HOW IT COMPARES WITH A BROKER', 't'))
X0, Y0 = 60, 896
COLW = [240, 310, 310, 310, 310]
cols = [('', ''), ('In-process bus', 'Keel today'), ('Cloudflare Queues', 'the upgrade path'),
        ('RabbitMQ', 'a message broker'), ('Kafka', 'an event log')]
rows = [('Where it runs', ['Inside the Worker', 'Managed by Cloudflare', 'A broker you run or rent', 'A broker cluster']),
        ('Needs an always-on server', ['No', 'No', 'Yes', 'Yes']),
        ('Keeps messages if the Worker stops', ['No', 'Yes', 'Yes', 'Yes']),
        ('Retries a failed handler', ['No', 'Yes', 'Yes', 'Yes, by replay']),
        ('Fits one Worker deploy', ['Yes', 'Yes', 'No', 'No']),
        ('Cost shape', ['None extra', 'Per message', 'Fixed monthly, plus upkeep', 'Fixed monthly, plus upkeep'])]
HEAD, RH = 46, 34
xs = [X0]
for w in COLW:
    xs.append(xs[-1] + w)
total_h = HEAD + RH * len(rows)
o.append(f'<rect x="{xs[1]}" y="{Y0}" width="{COLW[1]}" height="{total_h}" style="fill:{TINT};stroke:{ACC};stroke-width:2"/>')
o.append(f'<rect x="{xs[2]}" y="{Y0}" width="{COLW[2]}" height="{total_h}" style="fill:none;stroke:{ACC};stroke-width:1.5;stroke-dasharray:6 4"/>')
o.append(f'<rect x="{X0}" y="{Y0}" width="{xs[-1]-X0}" height="{total_h}" style="fill:none;stroke:{INK};stroke-width:1.5"/>')
o.append(f'<line x1="{X0}" y1="{Y0+HEAD}" x2="{xs[-1]}" y2="{Y0+HEAD}" style="stroke:{INK};stroke-width:1.5"/>')
for i, (t, sub) in enumerate(cols):
    if i:
        o.append(text(xs[i] + 14, Y0 + 20, t, 'h', style=f'font-size:13.5px;{"fill:" + ACC if i == 1 else ""}'))
        o.append(text(xs[i] + 14, Y0 + 37, sub, style='font-size:11px'))
for r, (label, cells) in enumerate(rows):
    y = Y0 + HEAD + r * RH
    if r:
        o.append(f'<line x1="{X0}" y1="{y}" x2="{xs[-1]}" y2="{y}" style="stroke:#d3dcea;stroke-width:1"/>')
    o.append(text(X0 + 14, y + 22, label, style='font-size:12.5px;fill:#14213d'))
    for c, v in enumerate(cells):
        o.append(text(xs[c + 1] + 14, y + 22, v, style='font-size:12.5px;fill:#14213d'))
o.append(text(60, 1174, 'Keel starts with the simplest bus that works. The contexts only know publish and subscribe,', style='font-size:13px;fill:#14213d'))
o.append(text(60, 1194, 'so Cloudflare Queues can replace it later without a change to Lending, Payments or Documents.', style='font-size:13px;fill:#14213d'))
uml.finish(o, 'uml-eventbus', 'UML-08 EVENT BUS', view='AXO 7/52')
