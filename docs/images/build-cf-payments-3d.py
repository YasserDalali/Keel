# CF-04: inside the Payments context. Use cases, the ports and checks they rely on, and the adapters behind them.
# Writes cf-payments-3d.svg next to this file. Facts come from api/src/contexts/payments/**, app/wiring/payments.ts.
# Stripe is left out on purpose: the user is removing it (stripe-gateway.ts is still wired in the code).
import textwrap
import blueprint as bp
bp.VIEW, bp.TILE_H = (8, 68), 24  # camera: (azimuth, elevation), see blueprint.py
from blueprint import (ACC, CALL, EVT, IMPL, badge, card, chip, face, floor_labels, header, key, legend, lu, platform,
                       si, tile, title_block, wire, write)

H, PD = bp.TILE_H, 620
bp.fit(1080, PD, (440, 165, 1545, 870))  # 1080 wide: includes the out-labels
o = [header('Microloans: inside Payments')]

o += [platform(0, 250, PD), platform(340, 340, PD), platform(750, 190, PD)]
o.append(floor_labels(((30, 'APPLICATION'), (360, 'DOMAIN'), (765, 'INFRASTRUCTURE')), y=PD - 8))

def paypal_card():  # PayPal is a brand logo (Simple Icons), so it is drawn filled, not through lu()
    return (si('paypal', 14, 12, 28) + '<text x="14" y="62" class="h" style="font-size:13px">PAYPAL GATEWAY</text>'
            '<text x="14" y="82" class="s" style="font-size:14px">Capture settles once</text>')

tiles = [
    (30, 90, 200, 110, card('circle-plus', 'CREATE PAYMENT', 'Deposit or installment', size=15), False),
    (30, 230, 200, 110, card('circle-check', 'CONFIRM PAYMENT', 'Capture, then verify', size=15), False),
    (30, 370, 200, 110, card('receipt', 'RECORD REPAYMENT', 'Once per reference', size=15), False),
    (30, 510, 200, 80, chip('bell', 'ON LOAN-APPROVED', 'Event subscriber', size=13), False),
    (360, 90, 300, 125, card('plug', 'LENDING PORTS', 'DepositQuotes, InstallmentQuotes,', size=15,
                             lines=['DepositCollector']), False),
    (360, 230, 300, 70, chip('plug', 'PAYMENT GATEWAY', 'Port: open(), settle()'), False),
    (360, 315, 300, 70, chip('shield-check', 'VERIFY SETTLEMENT', 'Domain service', ACC), True),
    (360, 420, 300, 160, card('book-open', 'PAYMENT LEDGER', 'Port, append-only', size=15,
                              lines=['recordDisbursement()', 'recordRepayment()', 'hasRepayment()']), False),
    (765, 90, 160, 110, card('plug', 'LENDING ADAPTERS', 'app/wiring', size=13), False),
    (765, 215, 160, 100, paypal_card(), False),
    (765, 440, 160, 100, card('database', 'D1 LEDGER', 'transactions table', size=13), False),
]
for x, y, w, d, inner, acc in sorted(tiles, key=lambda t: bp.depth(t[0], t[1])):
    o.append(tile(x, y, w, d, 0, inner, acc))

o.append(face(H) +
         wire('M230 130 H358') +                       # 1 create -> lending ports (quote)
         wire('M230 180 H280 V262', CALL, False) +     # create joins the gateway line (open)
         wire('M230 262 H358') +                       # 2 confirm -> gateway (settle)
         wire('M230 330 H358') +                       # 3 confirm -> verify
         wire('M130 340 V368') +                       # 4 confirm -> record repayment
         wire('M230 440 H358') +                       # 5 record -> ledger
         wire('M230 405 H310 V175 H358') +             # 6 record -> lending (apply payment)
         wire('M230 540 H358', EVT) +                  # 7 loan-approved -> ledger (disbursement)
         wire('M765 145 H662', IMPL) + wire('M765 265 H662', IMPL) + wire('M765 490 H662', IMPL) +
         ''.join(wire(f'M925 {y} H985') + f'<text x="992" y="{y + 5}" class="t" style="font-size:12px">{t}</text>'
                 for y, t in ((145, 'LENDING'), (265, 'PAYPAL API'), (490, 'D1')))
         + badge(1, 295, 130) + badge(2, 334, 262) + badge(3, 262, 330) + badge(4, 130, 354)
         + badge(5, 270, 440) + badge(6, 310, 218) + badge(7, 295, 540) + '</g>')

o.append(legend(((CALL, 'Calls', True), (IMPL, 'Implements a port', True), (EVT, 'Reacts to an event', True))))

checks = ['Payments asks Lending for the amount. The client never sets it.',
          'The provider must report the money as collected.',
          'The payment must match the loan, the user and the installment.',
          'The amount recorded is the amount the provider collected.',
          'The ledger records each provider reference once. A repeat returns the first result.',
          'A PayPal capture runs once. A repeat is answered from the ledger.']
o.append('<text x="60" y="320" class="t">SAFETY CHECKS</text>')
y = 346
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
              'On loan-approved, the ledger records the disbursement.'], y0=y + 16))
o.append(title_block('CF-04 PAYMENTS', view='AXO 8/68'))
write('cf-payments-3d', o)
