# UML-03: the Lending model as a class diagram. Facts come from api/src/contexts/lending/{domain,application,infrastructure}
# and shared/money.ts. Members are a faithful subset: the ones that carry rules.
import uml
from uml import klass, line, note, text

o = uml.sheet('Lending, as classes')

def add(*a, **k):
    svg, box = klass(*a, **k)
    o.append(svg)
    return box

# Application and ports (left)
uc = add(60, 170, 260, 'ApplyForLoan', 'use case', ['-applicants: ApplicantGateway', '-loans: LoanRepository', '-policy: LendingPolicy'],
         ['+execute(cmd)'])
gw = add(60, 360, 260, 'ApplicantGateway', 'port', [], ['+describe(borrowerId): Applicant'])
cg = add(60, 520, 260, 'CompositeApplicantGateway', 'adapter', ['-sources: ApplicantSources'], ['+describe(borrowerId)'])
rp = add(340, 360, 200, 'LoanRepository', 'repository', [], ['+byId(id)', '+save(loan)', '+recordOf(borrowerId)', '+markOverdue(today)'])
d1 = add(340, 560, 200, 'D1LoanRepository', 'adapter', ['-db: D1Database'], ['+save(loan): one batch'])

# The aggregate (centre)
ln = add(560, 170, 330, 'Loan', 'aggregate root',
         ['-id: string', '-borrowerId: string', '-status: LoanStatus', '-decidedBy: string | null',
          '-approvedAt: Date | null', '-cancelledAt: Date | null'],
         ['+apply(...): Loan  «factory»', '+approve(by, at, newId, documentId)', '+decline(by, at)', '+cancel(at)',
          '+payDeposit(method, at, reference)', '+recordPayment(installmentId, amount)', '+remaining: Money',
          '+pullEvents(): DomainEvent[]'], accent=True)

# Inside the aggregate (right column)
it = add(980, 170, 270, 'Installment', 'entity', ['+number: number', '+dueDate: string', '+amountDue: Money',
         '-amountPaid: Money', '-status: InstallmentStatus', '-paidAt: Date | null'], ['+applyPayment(amount, at)', '+statusOn(today)'])
dp = add(980, 400, 270, 'Deposit', 'value object', ['+required: boolean', '+amount: Money', '+paid: boolean'],
         ['+pay(method, at, ref): Deposit', '+satisfied: boolean'])
lt = add(980, 590, 270, 'LoanTerms', 'value object', ['+principal: Money', '+flatRate: number', '+termMonths: number'],
         ['+totalRepayable: Money', '+fee: Money'])
ra = add(980, 780, 270, 'RiskAssessment', 'value object', ['+finalScore', '+bankSafety', '+behavior', '+threshold'],
         ['+acceptable: boolean'], lh=16)

# Domain services (bottom)
rk = add(60, 700, 260, 'RiskPolicy', 'domain service', ['WEIGHTS = bank 0.6, behaviour 0.4'], ['+assess(bankSafety, record)'])
dpp = add(340, 700, 200, 'DepositPolicy', 'domain service', ['+threshold: Money', '+pct: number'], ['+requirementFor(principal)'])
sc = add(560, 700, 330, 'buildRepaymentSchedule', 'domain service', [],
         ['(terms, startsOn): ScheduledPayment[]', 'equal months, last one takes the rounding'])

# Events and the shared kernel (far right)
ev = add(1290, 170, 260, 'LendingEvent', 'domain events', ['loan-applied', 'loan-approved', 'loan-declined', 'loan-cancelled',
         'deposit-paid', 'installment-paid', 'loan-repaid'], [], lh=17)
mo = add(1290, 400, 260, 'Money', 'value object, shared kernel', ['-cents: integer'],
         ['+fromDollars(n): Money', '+plus(m), minus(m), times(k)', '+gte(m), isPositive()'])

def mid_y(b):
    return b[1] + b[3] / 2

# Composition: the Loan owns its installments and values (one trunk, diamond at the Loan)
o.append(line(f'M{ln[0]+ln[2]} 230 H{it[0]-2}', start='dia'))
o.append(line(f'M935 230 V{mid_y(ra)}'))
for b in (dp, lt, ra):
    o.append(line(f'M935 {mid_y(b)} H{b[0]-2}'))
o.append(text(948, 222, '1..*', style='font-size:11px') + text(948, mid_y(dp) - 6, '1', style='font-size:11px'))

# Dependencies (dashed, open head) and realizations (dashed, hollow triangle)
o.append(line(f'M{uc[0]+uc[2]} 205 H{ln[0]-2}', 'dashed', end='open') + text(400, 199, '«create»', style='font-size:10.5px'))
o.append(line(f'M190 {uc[1]+uc[3]} V{gw[1]-2}', 'dashed', end='open'))
o.append(line(f'M300 {uc[1]+uc[3]} V330 H440 V{rp[1]-2}', 'dashed', end='open'))
o.append(line(f'M190 {cg[1]} V{gw[1]+gw[3]+2}', 'dashed', end='tri'))
o.append(line(f'M440 {d1[1]} V{rp[1]+rp[3]+2}', 'dashed', end='tri'))
o.append(line(f'M{uc[0]} 250 H44 V{mid_y(rk)} H{rk[0]-2}', 'dashed', end='open'))
o.append(line(f'M44 {mid_y(rk)} V{dpp[1]+dpp[3]+22} H440 V{dpp[1]+dpp[3]+2}', 'dashed', end='open'))
o.append(line(f'M725 {sc[1]-2} V{ln[1]+ln[3]+2}', 'dashed', end='open') + text(733, 680, 'used by approve()', style='font-size:10.5px'))
o.append(line(f'M820 {ln[1]} V142 H1420 V{ev[1]-2}', 'dashed', end='open') + text(1150, 160, '«records»', style='font-size:10.5px'))

# Legend
o.append(text(1290, 600, 'KEY', 't'))
o.append(line('M1290 624 H1350', start='dia') + text(1362, 628, 'owns (composition)'))
o.append(line('M1290 648 H1350', 'dashed', end='open') + text(1362, 652, 'uses'))
o.append(line('M1290 672 H1350', 'dashed', end='tri') + text(1362, 676, 'implements'))
o.append(note(1290, 700, 260, ['Only the Loan changes its parts.', 'Other code holds a loan by id', 'and calls one of its methods.'], accent=True))
uml.finish(o, 'uml-lending-classes', 'UML-03 LENDING')
