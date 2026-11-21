# UML-02: the D1 schema as an entity-relationship diagram. Facts come from api/migrations/0001..0012
# (the final shape after every ALTER and table rebuild) and the D1 repositories.
# Layout: one column per context in the top row, the supporting tables in the bottom row. Lines run in clear
# channels between columns. A far foreign key to users is a "→ users" label, not a line across the sheet.
import blueprint as bp
bp.H = 1220
import uml
from uml import MONO, line, note, table, text

o = uml.sheet('Where the data lives')
T = {}

def put(key, x, y, w, name, cols, group, accent=False):
    svg, box, rows = table(x, y, w, name, cols, accent, group)
    o.append(svg)
    T[key] = (box, rows)

# Top row: the core tables, one column per context
put('users', 60, 200, 300, 'users', [('PK', 'id', 'text'), ('UQ', 'email', 'text'), ('', 'password_hash', 'text'),
    ('', 'role', 'enum'), ('', 'email_verified_at', 'ts'), ('', 'created_at', 'ts'), ('', 'updated_at', 'ts')], 'IDENTITY')
put('tokens', 60, 440, 300, 'email_tokens', [('PK', 'token_hash', 'text'), ('FK', 'user_id', 'text'), ('', 'purpose', 'enum'),
    ('', 'expires_at', 'ts'), ('', 'used_at', 'ts')], 'IDENTITY')
put('profiles', 440, 200, 300, 'profiles', [('PK FK', 'user_id', 'text'), ('', 'first_name', 'sealed'), ('', 'last_name', 'sealed'),
    ('', 'phone', 'sealed'), ('', 'address', 'sealed'), ('', 'national_id_number', 'sealed'), ('', 'kyc_status', 'enum'),
    ('', 'didit_session_id', 'text'), ('', 'kyc_updated_at', 'ts')], 'BORROWER')
put('plaid', 440, 470, 300, 'plaid_items', [('PK FK', 'user_id', 'text'), ('', 'item_id', 'text'), ('', 'access_token', 'sealed'),
    ('', 'institution_name', 'text'), ('', 'bank_safety_score', 'real'), ('', 'bank_signals', 'json')], 'BORROWER')
put('loans', 820, 200, 340, 'loans', [('PK', 'id', 'text'), ('FK', 'borrower_id', 'text'), ('', 'amount', 'real $'),
    ('', 'interest_rate', 'real'), ('', 'term_months', 'int'), ('', 'status', 'enum'), ('', 'risk_assessment_score', 'real'),
    ('', 'risk_assessment_summary', 'json'), ('FK', 'approved_by', 'text'), ('', 'approved_at', 'ts'),
    ('', 'cancelled_at', 'ts'), ('', 'upfront_required', 'bool'), ('', 'upfront_amount', 'real $'),
    ('', 'upfront_paid', 'bool'), ('', 'upfront_payment_id', 'text'), ('', 'upfront_paid_at', 'ts')], 'LENDING', True)
put('inst', 1240, 200, 290, 'installments', [('PK', 'id', 'text'), ('FK', 'loan_id', 'text'), ('', 'installment_number', 'int'),
    ('', 'due_date', 'date'), ('', 'amount_due', 'real $'), ('', 'amount_paid', 'real $'), ('', 'status', 'enum'),
    ('', 'paid_at', 'ts')], 'LENDING', True)
put('txn', 1240, 460, 290, 'transactions', [('PK', 'id', 'text'), ('FK', 'loan_id', 'text'), ('FK', 'installment_id', 'text'),
    ('', 'type', 'enum'), ('', 'amount', 'real $'), ('', 'payment_method', 'enum'), ('UQ', 'external_reference_id', 'text'),
    ('', 'status', 'enum')], 'PAYMENTS')

# Bottom row: supporting tables
o.append(text(60, 742, 'SUPPORTING TABLES', 't'))
o.append(f'<line x1="60" y1="752" x2="1530" y2="752" class="thin" style="stroke:#d9dcdb"/>')
W2, Y2 = 262, 772
for i, (key, name, cols, group) in enumerate([
    ('docs', 'documents', [('PK', 'id', 'text'), ('FK', 'user_id', '→ users'), ('', 'document_type', 'enum'),
                           ('', 'reference_id', 'text'), ('', 'r2_key', 'text')], 'DOCUMENTS'),
    ('notif', 'notifications', [('PK', 'id', 'text'), ('FK', 'user_id', '→ users'), ('', 'kind', 'text'), ('', 'title', 'text'),
                                ('', 'body', 'text'), ('', 'read_at', 'ts')], 'COMM.'),
    ('outbox', 'email_outbox', [('PK', 'id', 'text'), ('', 'user_id', 'text'), ('', 'to_address', 'text'), ('', 'template', 'text'),
                                ('', 'status', 'enum'), ('', 'error', 'text')], 'COMM.'),
    ('remind', 'reminder_settings', [('PK FK', 'user_id', '→ users'), ('', 'enabled', 'bool'), ('', 'days_before', '1..14'),
                                     ('', 'updated_at', 'ts')], 'REPORTING'),
    ('audit', 'audit_logs', [('PK', 'id', 'text'), ('', 'actor_id', 'text'), ('', 'action', 'text'), ('', 'target_type', 'text'),
                             ('', 'target_id', 'text')], 'UNUSED'),
]):
    put(key, 60 + i * (W2 + 40), Y2, W2, name, cols, group)

def r(key, col):
    return T[key][1][col]

def left(key):
    return T[key][0][0]

def right(key):
    b = T[key][0]
    return b[0] + b[2]

def top(key):
    return T[key][0][1]

uid = r('users', 'id')
# Identity and Borrower: one-to-one on the user's id, through the channel between the columns (x 400)
o.append(line(f'M{left("profiles")} {r("profiles", "user_id")} H{right("users")}', start='one', end='one'))
o.append(line(f'M{left("plaid")} {r("plaid", "user_id")} H400 V{uid}', start='one'))
# email_tokens -> users, along the left margin
o.append(line(f'M{left("tokens")} {r("tokens", "user_id")} H44 V{uid} H{left("users")}', start='many', end='one'))
# loans -> users (borrower_id and approved_by), through the channel above the top row
o.append(line(f'M{left("loans")} {r("loans", "borrower_id")} H790 V170 H210 V{top("users")}', start='many', end='one'))
o.append(text(440, 162, 'loans.borrower_id and loans.approved_by → users.id', style=f'{MONO};font-size:10.5px'))
# installments and transactions -> loans, through the channel between Lending and Payments (x 1200)
o.append(line(f'M{left("inst")} {r("inst", "loan_id")} H1200 V{r("loans", "id")} H{right("loans")}', start='many', end='one'))
o.append(line(f'M{left("txn")} {r("txn", "loan_id")} H1200 V{r("inst", "loan_id")}', start='many'))
# transactions.installment_id -> installments.id, along the right margin (optional link)
o.append(line(f'M{right("txn")} {r("txn", "installment_id")} H1552 V{r("inst", "id")} H{right("inst")}', 'dashed', start='many', end='one'))

# Key and note
ky = 990
o.append(text(60, ky, 'KEY', 't'))
o.append(line(f'M60 {ky+24} H124', start='many', end='one') + text(140, ky + 28, 'many to one'))
o.append(line(f'M60 {ky+50} H124', start='one', end='one') + text(140, ky + 54, 'one to one (shared key)'))
o.append(line(f'M60 {ky+76} H124', 'dashed', start='many', end='one') + text(140, ky + 80, 'optional'))
o.append(text(330, ky + 28, '→ users', style=f'{MONO};font-size:11px;fill:#14271f') + text(410, ky + 28, 'a foreign key to users.id (not drawn)'))
o.append(text(330, ky + 54, 'sealed', style=f'{MONO};font-size:11px;fill:#14271f') + text(410, ky + 54, 'AES-GCM ciphertext'))
o.append(text(330, ky + 80, 'real $', style=f'{MONO};font-size:11px;fill:#14271f') + text(410, ky + 80, 'dollars; the domain uses whole cents'))
o.append(note(760, 975, 560, ['Green tables: the Loan aggregate, saved together in one D1 batch.',
                              'A unique index on external_reference_id records each',
                              'provider payment at most once.',
                              'loans.status stores declined and cancelled as "defaulted".',
                              'Only the repository knows this mapping.'], accent=True))
uml.finish(o, 'uml-erd', 'UML-02 DATABASE')
