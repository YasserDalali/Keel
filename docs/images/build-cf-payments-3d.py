# CF-04: inside the Payments context. Use cases, the ports and checks they rely on, and the adapters behind them.
# Writes cf-payments-3d.svg next to this file. Facts come from api/src/contexts/payments/**, app/wiring/payments.ts.
# Stripe is left out on purpose: the user is removing it (stripe-gateway.ts is still wired in the code).
import textwrap
import blueprint as bp
bp.VIEW, bp.TILE_H, bp.H = (8, 68), 24, 1240  # camera: (azimuth, elevation), see blueprint.py
from blueprint import (ACC, CALL, EVT, IMPL, badge, card, chip, face, floor_labels, header, key, legend, lu, platform,
                       si, tile, title_block, wire, write)

H, PD = bp.TILE_H, 700
bp.fit(1310, PD, (60, 170, 1545, 830))  # 1310 wide: includes the out-labels
o = [header('Keel: inside Payments')]

# Wide gaps, and each use case on the same row as the port it calls, so every wire runs straight.
o += [platform(0, 260, PD), platform(420, 380, PD), platform(960, 220, PD)]
o.append(floor_labels(((30, 'APPLICATION'), (440, 'DOMAIN'), (980, 'INFRASTRUCTURE')), y=PD - 12))

def paypal_card():  # PayPal is a brand logo (Simple Icons), so it is drawn filled, not through lu()
    return (si('paypal', 14, 12, 28) + '<text x="14" y="62" class="h" style="font-size:13px">PAYPAL GATEWAY</text>'
            '<text x="14" y="82" class="s" style="font-size:14px">Capture settles once</text>')

tiles = [
    (30, 90, 210, 110, card('circle-plus', 'CREATE PAYMENT', 'Deposit or installment', size=15) + badge(1, 192, 18), False),
    (30, 240, 210, 110, card('circle-check', 'CONFIRM PAYMENT', 'Capture, then verify', size=15), False),
    (30, 440, 210, 110, card('receipt', 'RECORD REPAYMENT', 'Once per reference', size=15) + badge(6, 192, 18), False),
    (30, 590, 210, 80, chip('bell', 'ON LOAN-APPROVED', 'Event subscriber', size=13), False),
    (440, 90, 340, 120, card('plug', 'LENDING PORTS', 'DepositQuotes, InstallmentQuotes,', size=15,
                             lines=['DepositCollector']), False),
    (440, 240, 340, 70, chip('plug', 'PAYMENT GATEWAY', 'Port: open(), settle()'), False),
    (440, 330, 340, 70, chip('shield-check', 'VERIFY SETTLEMENT', 'Domain service', ACC), True),
    (440, 440, 340, 190, card('book-open', 'PAYMENT LEDGER', 'Port, append-only', size=15,
                              lines=['recordDisbursement()', 'recordRepayment()', 'hasRepayment()']), False),
    (980, 90, 180, 110, card('plug', 'LENDING ADAPTERS', 'app/wiring', size=13), False),
    (980, 225, 180, 100, paypal_card(), False),
    (980, 470, 180, 100, card('database', 'D1 LEDGER', 'transactions table', size=13), False),
]
for x, y, w, d, inner, acc in sorted(tiles, key=lambda t: bp.depth(t[0], t[1])):
    o.append(tile(x, y, w, d, 0, inner, acc))

o.append(face(H) +
         wire('M240 145 H438') +                       # 1 create -> lending ports (quote)
         wire('M240 275 H438') +                       # 2 confirm -> gateway (settle)
         wire('M240 340 H438') +                       # 3 confirm -> verify
         wire('M135 350 V438') +                       # 4 confirm -> record repayment
         wire('M240 495 H438') +                       # 5 record -> ledger
         wire('M240 615 H438', EVT) +                  # 7 loan-approved -> ledger (disbursement)
         wire('M980 145 H782', IMPL) + wire('M980 275 H782', IMPL) + wire('M980 520 H782', IMPL) +
         ''.join(wire(f'M1160 {y} H1215') + f'<text x="1222" y="{y + 5}" class="t" style="font-size:12px">{t}</text>'
                 for y, t in ((145, 'LENDING'), (275, 'PAYPAL API'), (520, 'D1')))
         + badge(2, 340, 275) + badge(3, 340, 340) + badge(4, 135, 394)
         + badge(5, 340, 495) + badge(7, 340, 615) + '</g>')

Y = 880
o.append(f'<line x1="60" y1="{Y-30}" x2="1540" y2="{Y-30}" class="thin" style="stroke:#d3dcea"/>')
checks = ['Payments asks Lending for the amount. The client never sets it.',
          'The provider must report the money as collected.',
          'The payment must match the loan, the user and the installment.',
          'The amount recorded is the amount the provider collected.',
          'The ledger records each provider reference once. A repeat returns the first result.',
          'A PayPal capture runs once. A repeat is answered from the ledger.']
o.append(f'<text x="60" y="{Y}" class="t">SAFETY CHECKS</text>')
y = Y + 26
for c in checks:
    for j, line in enumerate(textwrap.wrap(c, 54)):
        o.append((lu('check', 60, y - 12, 14, ACC) if j == 0 else '') + f'<text x="82" y="{y}" class="s">{line}</text>')
        y += 19
    y += 7

o.append(key(['Create asks Lending for the amount due.', 'The gateway opens a PayPal order. Confirm captures it.',
              'verifySettlement checks the money arrived for this target.',
              'Confirm sends an installment payment to RecordRepayment.',
              'The ledger records the payment once per provider reference.',
              'Lending applies the payment. A deposit goes to Lending directly.',
              'On loan-approved, the ledger records the disbursement.'], y0=Y, x=560))
o.append(legend(((CALL, 'Calls', True), (IMPL, 'Implements a port', True), (EVT, 'Reacts to an event', True)), y0=Y, x=1080))
o.append(title_block('CF-04 PAYMENTS', view='AXO 8/68'))
write('cf-payments-3d', o)
