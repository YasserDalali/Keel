# CF-03: inside the Lending context, as a spatial overview. Application, domain (the Loan aggregate and its
# services), infrastructure. The class diagram (UML-03) carries the detail, so this sheet keeps few wires and wide gaps.
# Facts come from api/src/contexts/lending/**, app/wiring/lending.ts and the cron handler in api/src/index.ts.
import blueprint as bp
bp.VIEW, bp.TILE_H, bp.H = (18, 42), 24, 1240  # camera: (azimuth, elevation), see blueprint.py
from blueprint import (ACC, CALL, IMPL, badge, card, chip, face, floor_labels, header, key, legend,
                       platform, tile, title_block, wire, write)

H, PD = bp.TILE_H, 700
bp.fit(1260, PD, (60, 170, 1545, 830))
o = [header('Keel: inside Lending')]

# Three platforms with wide gaps: application 0-260, domain 380-900, infrastructure 1020-1260
o += [platform(0, 260, PD), platform(380, 520, PD), platform(1020, 240, PD)]
o.append(floor_labels(((30, 'APPLICATION'), (410, 'DOMAIN'), (1050, 'INFRASTRUCTURE')), y=PD - 12))
o.append(face(0) + '<rect x="395" y="68" width="490" height="420" class="dash" style="stroke:#1f7a4d"/>'
         f'<text x="500" y="478" class="t" style="fill:{ACC};font-size:12px">AGGREGATE BOUNDARY</text></g>')

COMMANDS = ['ApplyForLoan', 'ApproveLoan', 'DeclineLoan', 'CancelLoan', 'PayDeposit', 'RecordInstallmentPayment',
            'MarkOverdue (cron)']
tiles = [
    (30, 90, 210, 330, card('list-checks', 'USE CASES', 'One class each', lines=COMMANDS), False),
    (410, 90, 220, 250, card('hand-coins', 'LOAN', 'Aggregate root', ACC,
                             lines=['apply()', 'approve()', 'decline()', 'cancel()', 'payDeposit()', 'recordPayment()'])
                        + badge(2, 202, 18), True),
    (680, 90, 190, 75, chip('calendar', 'INSTALLMENT', 'Entity', size=13), False),
    (680, 190, 190, 75, chip('piggy-bank', 'DEPOSIT', 'Value object', size=13), False),
    (680, 290, 190, 75, chip('file-signature', 'LOAN TERMS', 'Value object', size=13), False),
    (680, 390, 190, 75, chip('gauge', 'RISK ASSESSMENT', 'Value object', size=12), False),
    (400, 560, 150, 85, chip('calendar-range', 'SCHEDULE', 'Domain service', size=13), False),
    (570, 560, 150, 85, chip('gauge', 'RISK', 'RiskPolicy', size=13), False),
    (740, 560, 150, 85, chip('percent', 'DEPOSIT', 'DepositPolicy', size=13), False),
    (1040, 90, 200, 120, card('plug', 'APPLICANT GATEWAY', 'Implements the port', size=13,
                              lines=['ApplicantGateway']) + badge(5, 182, 18), False),
    (1040, 250, 200, 120, card('database', 'LOAN REPOSITORY', 'One D1 batch per save', size=13), False),
    (1040, 410, 200, 120, card('search', 'LOAN QUERIES', 'Reads D1 for lists', size=13) + badge(7, 182, 18), False),
]
for x, y, w, d, inner, acc in sorted(tiles, key=lambda t: bp.depth(t[0], t[1])):
    o.append(tile(x, y, w, d, 0, inner, acc))

o.append(face(H) +
         # owns: the Loan -> its entity and value objects (one trunk)
         wire('M630 200 H655', CALL, False) + wire('M655 127 V427', CALL, False) +
         ''.join(wire(f'M655 {c} H678', CALL, False) for c in (127, 227, 327, 427)) +
         wire('M240 165 H408') +                                       # 1 use case -> Loan
         wire('M240 380 H320 V672 H815 V647') + wire('M645 672 V647') +  # 3 ApplyForLoan -> risk and deposit policies
         wire('M475 558 V342') +                                       # 4 schedule -> Loan.approve
         wire('M1040 310 H887', IMPL) +                                # 6 repository implements LoanRepository
         badge(1, 324, 165) + badge(3, 320, 530) + badge(4, 475, 450) + badge(6, 963, 310) + '</g>')

# Bottom strip: status machine, rules, key, legend
Y = 880

def node(x, y, w, label, dashed=False):
    st = 'stroke-dasharray:4 3' if dashed else ''
    return (f'<rect x="{x}" y="{y}" width="{w}" height="26" class="ink" style="fill:#fff;{st}"/>'
            f'<text x="{x + w/2}" y="{y+17}" class="t" text-anchor="middle" style="font-size:9.5px;letter-spacing:1px">{label}</text>')

def edge_label(x, y, text):
    return f'<text x="{x}" y="{y}" class="s" text-anchor="middle" style="font-size:10px">{text}</text>'

o.append(f'<line x1="60" y1="{Y-30}" x2="1540" y2="{Y-30}" class="thin" style="stroke:#d9dcdb"/>')
o.append(f'<text x="60" y="{Y}" class="t">LOAN STATUS</text>')
b = Y + 18
o += [node(60, b, 80, 'PENDING'), node(200, b, 76, 'ACTIVE'), node(336, b, 76, 'REPAID'),
      node(200, b + 54, 76, 'DECLINED'), node(336, b + 54, 76, 'DEFAULTED', True), node(200, b + 108, 76, 'CANCELLED'),
      wire(f'M140 {b+13} H198'), edge_label(169, b + 6, 'approve'),
      wire(f'M276 {b+13} H334'), edge_label(305, b + 6, 'paid off'),
      wire(f'M100 {b+26} V{b+67} H198'), edge_label(150, b + 61, 'decline'),
      wire(f'M100 {b+67} V{b+121} H198'), edge_label(150, b + 115, 'cancel'),
      wire(f'M256 {b+26} V{b+40} H374 V{b+52}', 'stroke-dasharray:4 3'),
      edge_label(374, b + 96, 'not built yet')]

rules = ['Apply: email verified, KYC approved, bank linked.', 'Apply: the risk score reaches the threshold.',
         'Deposit: due when the amount is above the threshold.', 'Approve: pending, and the deposit is paid.',
         'Decline: pending only.', 'Cancel: pending, and no deposit is paid.', 'Payment: the amount is positive.',
         'Repaid: every installment is paid.']
o.append(f'<text x="490" y="{Y}" class="t">RULES ON THE LOAN</text>')
for i, r in enumerate(rules):
    o.append(f'<text x="490" y="{Y + 26 + i * 21}" class="s">{r}</text>')

o.append(key(['A use case loads the Loan, calls one method and saves it.',
              'The Loan checks every rule and records an event for each change.',
              'ApplyForLoan asks the risk and deposit policies first.',
              'Approve builds the schedule. The last payment takes the rounding.',
              'The applicant gateway asks Identity and Borrower.',
              'The repository saves the aggregate in one batch. A stale write fails.',
              'Queries read D1 directly for lists and the detail page.'], y0=Y, x=880))
o.append(legend(((CALL, 'Calls', True), (IMPL, 'Implements a port', True), (CALL, 'Owns', False)), y0=Y + 200, x=60))
o.append(title_block('CF-03 LENDING', view='AXO 18/42'))
write('cf-lending-3d', o)
