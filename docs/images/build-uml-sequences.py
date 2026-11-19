# UML-04, UML-05, UML-07: sequence diagrams for the three flows that carry the most rules.
# Facts come from the routes, use cases, subscribers and the wiring order in api/src/app/container.ts
# (payments, then communication, then documents subscribe, so they run in that order).
import uml
from uml import INK, Seq, note, text

def divider(s, y, label, a, b):
    """A dashed line across a frame: the [else] part of an alt fragment."""
    x0, x1 = s.x[a] - 90, s.x[b] + 90
    s.o.append(f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" class="dash"/>'
               + text(x0 + 10, y + 15, f'[{label}]', style="font-family:'DejaVu Sans Mono',monospace;font-size:11px"))

def phase(s, label):
    s.o.append(text(60, s.y - 6, label, 't', style='font-size:10.5px;fill:#1f4fe0'))
    s.gap(26)

# --- UML-04: apply for a loan ------------------------------------------------
o = uml.sheet('Applying for a loan')
s = Seq([('ui', 'BORROWER', 'browser'), ('rt', 'ROUTE', 'POST /api/loans'), ('uc', 'ApplyForLoan', 'use case'),
         ('gw', 'ApplicantGateway', 'Identity, Borrower'), ('repo', 'LoanRepository', 'D1'),
         ('loan', 'Loan', 'aggregate root', 'accent'), ('bus', 'EventBus', 'shared kernel'),
         ('com', 'Communication', 'handler')], top=165, bottom=850, step=33)
s.msg('ui', 'rt', '{ amount, termMonths }')
s.self_call('rt', 'requireAuth: JWT, KV blacklist')
s.msg('rt', 'uc', 'execute(cmd)')
s.msg('uc', 'gw', 'describe(borrowerId)')
s.msg('gw', 'uc', 'emailVerified, kyc, bankScore', 'return')
y0 = s.y - 14
s.gap(20)
s.msg('uc', 'rt', 'ApplicationRejected', 'return')
s.msg('rt', 'ui', '403 or 428 { error }', 'return')
s.frame('opt', 'a check fails', y0, s.y - 16, 'ui', 'gw')
s.gap(10)
s.msg('uc', 'repo', 'recordOf(borrowerId)')
s.self_call('uc', 'RiskPolicy.assess(): score >= threshold')
s.msg('uc', 'loan', 'Loan.apply(terms, deposit, risk)')
s.self_call('loan', 'record loan-applied')
s.msg('uc', 'repo', 'save(loan): one D1 batch')
s.msg('uc', 'bus', 'publish(loan.pullEvents())')
s.msg('bus', 'com', 'loan-applied', 'event')
s.self_call('com', 'notify staff, email borrower', left=True)
s.msg('uc', 'rt', '{ id, status: pending, riskScore }', 'return')
s.msg('rt', 'ui', '201 Created', 'return')
o += s.svg()
o.append(note(1180, 870, 180, ['Rules run in the', 'domain, not the route.'], accent=True))
uml.finish(o, 'uml-seq-apply', 'UML-04 APPLY')

# --- UML-05: approve a loan, and the events it fans out ----------------------
o = uml.sheet('Approving a loan: one save, three reactions')
s = Seq([('of', 'OFFICER', 'browser'), ('rt', 'ROUTE', 'POST /:id/approve'), ('uc', 'ApproveLoan', 'use case'),
         ('loan', 'Loan', 'aggregate root', 'accent'), ('repo', 'LoanRepository', 'D1'), ('bus', 'EventBus', 'shared kernel'),
         ('pay', 'Payments', 'ledger handler'), ('com', 'Communication', 'handler'), ('doc', 'Documents', 'handler')],
        top=165, bottom=850, step=34)
s.msg('of', 'rt', 'POST approve')
s.self_call('rt', 'requireRole(officer, admin)')
s.msg('rt', 'uc', 'execute(loanId, approverId)')
s.msg('uc', 'repo', 'byId(loanId)')
s.msg('repo', 'uc', 'Loan', 'return')
s.msg('uc', 'loan', 'approve(by, at, ...)')
s.self_call('loan', 'pending? deposit paid? build schedule')
s.msg('uc', 'repo', 'save(loan): one batch')
s.msg('uc', 'bus', 'publish([loan-approved])')
y0 = s.y - 14
s.gap(20)
phase(s, 'AFTER THE SAVE: EACH HANDLER IS ISOLATED')
s.msg('bus', 'pay', 'loan-approved', 'event')
s.self_call('pay', 'record disbursement (D1)')
s.msg('bus', 'com', 'loan-approved', 'event')
s.self_call('com', 'notify, email (Resend)')
s.msg('bus', 'doc', 'loan-approved', 'event')
s.self_call('doc', 'agreement PDF to R2', left=True)
s.frame('loop', 'each subscriber, in order', y0, s.y - 16, 'bus', 'doc')
s.gap(8)
s.msg('uc', 'rt', '{ status: active, documentId }', 'return')
s.msg('rt', 'of', '200 OK', 'return')
o += s.svg()
o.append(note(640, 880, 470, ['A handler that fails writes a log entry. The approval still', 'succeeds, so every handler must be safe to run twice.'],
              accent=True))
uml.finish(o, 'uml-seq-approve', 'UML-05 APPROVE')

# --- UML-07: pay an installment through PayPal --------------------------------
o = uml.sheet('Paying an installment through PayPal')
s = Seq([('ui', 'BORROWER', 'browser'), ('rt', 'ROUTE', '/api/payments/paypal'), ('uc', 'Payments', 'create, confirm'),
         ('lend', 'Lending', 'quote, apply', 'accent'), ('gw', 'PayPalGateway', 'adapter'), ('pp', 'PayPal API', 'external'),
         ('led', 'PaymentLedger', 'D1, append-only'), ('rr', 'RecordRepayment', 'use case')],
        top=165, bottom=870, step=28)
phase(s, '1  OPEN AN ORDER')
s.msg('ui', 'rt', 'installment-order')
s.msg('rt', 'uc', 'CreateInstallmentPayment')
s.msg('uc', 'lend', 'quote(loan, installment)')
s.msg('lend', 'uc', 'remaining', 'return')
s.msg('uc', 'gw', 'open(remaining, target)')
s.msg('gw', 'pp', 'create order')
s.msg('rt', 'ui', '{ orderId, amount }', 'return')
s.gap(6)
phase(s, '2  THE BORROWER APPROVES IN PAYPAL, THEN CONFIRMS')
s.msg('ui', 'rt', 'installment-capture { orderId }')
s.msg('rt', 'uc', 'ConfirmInstallmentPayment')
y0 = s.y - 14
s.gap(20)
s.msg('uc', 'led', 'hasRepayment(orderId)')
s.msg('led', 'uc', 'yes: answer from the ledger', 'return')
divider(s, s.y - 12, 'else', 'uc', 'rr')
s.gap(10)
s.msg('uc', 'gw', 'settle(orderId)')
s.msg('gw', 'pp', 'capture order')
s.msg('gw', 'uc', 'collected amount, target', 'return')
s.self_call('uc', 'verifySettlement()')
s.msg('uc', 'rr', 'execute(collected amount)')
s.msg('rr', 'led', 'recordRepayment(ref): once')
s.msg('rr', 'lend', 'recordPayment(): Loan, save, event')
s.frame('alt', 'orderId already recorded', y0, s.y - 12, 'uc', 'rr')
s.gap(6)
s.msg('rt', 'ui', '{ status, documentId }', 'return')
o += s.svg()
uml.finish(o, 'uml-seq-pay', 'UML-07 PAY')
