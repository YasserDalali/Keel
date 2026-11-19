# CF-03: inside the Lending context. Application, domain (the Loan aggregate and its services), infrastructure.
# Writes cf-lending-3d.svg next to this file. Facts come from api/src/contexts/lending/**, app/wiring/lending.ts
# and the cron handler in api/src/index.ts.
import blueprint as bp
bp.VIEW, bp.TILE_H = (18, 42), 24  # camera: (azimuth, elevation), see blueprint.py
from blueprint import (ACC, INK, SOFT, CALL, IMPL, READ, badge, card, chip, face, floor_labels, header, key, legend,
                       platform, tile, title_block, wire, write)

H, PD = bp.TILE_H, 630
bp.fit(1060, PD, (440, 165, 1545, 790))
o = [header('Microloans: inside Lending')]

o += [platform(0, 250, PD), platform(320, 460, PD), platform(850, 210, PD)]
o.append(floor_labels(((30, 'APPLICATION'), (340, 'DOMAIN'), (870, 'INFRASTRUCTURE')), y=PD - 8))  # front: arrow 5 uses the back margin
# Aggregate boundary, drawn on the floor around the Loan and what it contains
o.append(face(0) + '<rect x="340" y="78" width="430" height="372" class="dash" style="stroke:#1f4fe0"/>'
         f'<text x="440" y="345" class="t" style="fill:{ACC};font-size:12px">AGGREGATE</text></g>')

USE_CASES = ['ApplyForLoan', 'ApproveLoan', 'DeclineLoan', 'CancelLoan', 'PayDeposit', 'RecordInstallmentPayment',
             'MarkOverdue (daily cron)', '', 'Queries:', 'ListLoans, GetLoan', 'QuoteDeposit', 'QuoteInstallment']
tiles = [
    (30, 90, 200, 400, card('list-checks', 'USE CASES', 'One class each', lines=USE_CASES), False),
    (355, 90, 190, 230, card('hand-coins', 'LOAN', 'Aggregate root', ACC,
                             lines=['apply()', 'approve()', 'decline()', 'cancel()', 'payDeposit()', 'recordPayment()'])
                        + badge(2, 172, 18), True),
    (575, 90, 185, 75, chip('calendar', 'INSTALLMENT', 'Entity', size=13), False),
    (575, 180, 185, 75, chip('piggy-bank', 'DEPOSIT', 'Value object', size=13), False),
    (575, 270, 185, 75, chip('file-signature', 'LOAN TERMS', 'Value object', size=13), False),
    (575, 360, 185, 75, chip('gauge', 'RISK ASSESSMENT', 'Value object', size=13), False),
    (350, 470, 125, 80, chip('calendar-range', 'SCHEDULE', 'Domain service', size=13), False),
    (490, 470, 125, 80, chip('gauge', 'RISK', 'RiskPolicy', size=13), False),
    (630, 470, 125, 80, chip('percent', 'DEPOSIT', 'DepositPolicy', size=13), False),
    (870, 90, 170, 100, card('plug', 'APPLICANT GATEWAY', 'Identity, Borrower', size=13), False),
    (870, 220, 170, 100, card('database', 'LOAN REPOSITORY', 'D1, one batch per save', size=13), False),
    (870, 350, 170, 100, card('search', 'LOAN QUERIES', 'D1 reads', size=13), False),
]
for x, y, w, d, inner, acc in sorted(tiles, key=lambda t: bp.depth(t[0], t[1])):
    o.append(tile(x, y, w, d, 0, inner, acc))

o.append(face(H) +
         # contains: Loan -> its entity and value objects
         wire('M545 205 H560', CALL, False) + wire('M560 127 V397', CALL, False) +
         ''.join(wire(f'M560 {c} H573', CALL, False) for c in (127, 217, 307, 397)) +
         wire('M230 160 H353') +                                    # 1 use case -> Loan
         wire('M230 380 H285 V575 H692 V552') + wire('M552 575 V552') +  # 3 ApplyForLoan -> policies
         wire('M412 470 V322') +                                    # 4 schedule -> Loan.approve
         wire('M870 120 H822 V60 H130 V88', IMPL) +                 # 5 gateway implements ApplicantGateway
         wire('M870 270 H772', IMPL) +                              # 6 repository implements LoanRepository
         wire('M870 400 H822 V605 H130 V492', READ) +               # 7 queries read D1
         badge(1, 292, 160) + badge(3, 420, 575) + badge(4, 412, 400) + badge(5, 600, 60)
         + badge(6, 821, 270) + badge(7, 600, 605) + '</g>')

# Left column: legend, status machine, rules
o.append(legend(((CALL, 'Calls', True), (IMPL, 'Implements a port', True), (READ, 'Reads the tables', True),
                 (CALL, 'Contains', False))))

def node(x, y, w, label, dashed=False):
    st = 'stroke-dasharray:4 3' if dashed else ''
    return (f'<rect x="{x}" y="{y}" width="{w}" height="26" class="ink" style="fill:#fff;{st}"/>'
            f'<text x="{x + w/2}" y="{y+17}" class="t" text-anchor="middle" style="font-size:9.5px;letter-spacing:1px">{label}</text>')

def edge_label(x, y, text):
    return f'<text x="{x}" y="{y}" class="s" text-anchor="middle" style="font-size:10px">{text}</text>'

o.append('<text x="60" y="342" class="t">LOAN STATUS</text>')
o += [node(60, 360, 80, 'PENDING'), node(200, 360, 76, 'ACTIVE'), node(336, 360, 76, 'REPAID'),
      node(200, 414, 76, 'DECLINED'), node(336, 414, 76, 'DEFAULTED', True), node(200, 468, 76, 'CANCELLED'),
      wire('M140 373 H198'), edge_label(169, 366, 'approve'),
      wire('M276 373 H334'), edge_label(305, 366, 'paid off'),
      wire('M100 386 V427 H198'), edge_label(150, 421, 'decline'),
      wire('M100 427 V481 H198'), edge_label(150, 475, 'cancel'),
      wire('M256 386 V400 H374 V412', 'stroke-dasharray:4 3'),
      edge_label(374, 456, 'not built yet')]

rules = ['Apply: email verified, KYC approved, bank linked.', 'Apply: the risk score reaches the threshold.',
         'Deposit: due when the amount is above the threshold.', 'Approve: pending, and the deposit is paid.',
         'Decline: pending only.', 'Cancel: pending, and no deposit is paid.', 'Payment: the amount is positive.',
         'Repaid: every installment is paid.']
o.append('<text x="60" y="540" class="t">RULES ON THE LOAN</text>')
for i, r in enumerate(rules):
    o.append(f'<text x="60" y="{566 + i * 21}" class="s">{r}</text>')

o.append(key(['A use case loads the Loan, calls one method and saves it.',
              'The Loan checks every rule and records an event for each change.',
              'ApplyForLoan asks the risk and deposit policies first.',
              'Approve builds the schedule. The last payment takes the rounding.',
              'The applicant gateway asks Identity and Borrower.',
              'The repository saves the aggregate in one batch. A stale write fails.',
              'Queries read D1 directly for lists and the detail page.'], y0=800))
o.append(title_block('CF-03 LENDING', view='AXO 18/42'))
write('cf-lending-3d', o)
