# UML-01: use cases, flat 2D. Facts come from the routes in api/src/contexts/*/interface/*.ts, their
# requireAuth/requireRole guards, the Turnstile check on register and log in, and the cron in api/src/index.ts.
from blueprint import lu, si
import uml
from uml import actor, line, note, package, system_box, text, usecase

o = uml.sheet('What the system does')
o.append(f'<rect x="280" y="215" width="890" height="585" style="fill:none;stroke:#14213d;stroke-width:2"/>')
o.append(text(296, 238, 'KEEL', 't', style='font-size:11px'))

W = 250
PACKAGES = {  # name: (x, y, h, [use cases])
    'ACCOUNT': (300, 250, 225, ['Register', 'Log in', 'Verify email']),
    'SCHEDULED': (600, 250, 225, ['Mark overdue']),
    'DECISIONS': (900, 250, 225, ['Review applicant', 'Approve loan', 'Decline loan']),
    'TRACKING': (300, 505, 280, ['View schedule', 'Download documents', 'Read notifications', 'Set reminders']),
    'BORROWING': (600, 505, 280, ['Apply for loan', 'Pay deposit', 'Pay installment', 'Cancel application']),
    'ONBOARDING': (900, 505, 280, ['Complete profile', 'Verify identity', 'Link bank']),
}
pos = {}
for name, (x, y, h, cases) in PACKAGES.items():
    o.append(package(x, y, W, h, name))
    for i, c in enumerate(cases):
        cy = y + 62 + i * 50
        pos[c] = (x + W / 2, cy)
        o.append(usecase(x + W / 2, cy, c))



# Primary actors
o.append(actor(160, 400, 'VISITOR', 'Not signed in'))
o.append(line('M190 362 H298'))
o.append(actor(725, 210, '', ''))
o.append(text(752, 180, 'SCHEDULER', 'h', style='font-size:14px') + text(752, 197, 'Cron, daily 06:00 UTC'))
o.append(line('M725 212 V248'))
o.append(actor(1290, 400, 'OFFICER', 'Officer or admin role'))
o.append(line('M1260 362 H1152'))
o.append(actor(560, 930, '', ''))
o.append(text(587, 900, 'BORROWER', 'h', style='font-size:14px') + text(587, 917, 'Signed in'))
o.append(line('M560 878 V842 H1025') + line('M425 842 H560'))
for x in (425, 725, 1025):
    o.append(line(f'M{x} 842 V787'))

# Secondary actors: external systems
o.append(system_box(1230, 590, 190, 48, 'DIDIT', lu('scan-face', 1242, 602, 24)))
o.append(system_box(1230, 650, 190, 48, 'PLAID', lu('landmark', 1242, 662, 24)))
o.append(system_box(1230, 768, 190, 48, 'PAYPAL', si('paypal', 1242, 780, 24)))
vx, vy = pos['Verify identity']; lx, ly = pos['Link bank']
o.append(line(f'M1230 614 L{vx + 105} {vy}') + line(f'M1230 674 L{lx + 105} {ly}'))
dx, dy = pos['Pay deposit']; ix, iy = pos['Pay installment']
o.append(line(f'M1230 792 H875 V{dy} H{dx + 105}') + line(f'M875 {iy} H{ix + 105}'))

# Notes
o.append(note(40, 560, 220, ['A line to a package means', 'the actor can use every', 'use case inside it.']))
o.append(text(60, 900, 'NOTES', 't'))
for i, n in enumerate(['Register and Log in pass a Turnstile check first.',
                       'Officer cases need the officer or admin role.',
                       'A borrower sees only their own loans.']):
    o.append(text(60, 924 + i * 20, n))
uml.finish(o, 'uml-usecases', 'UML-01 USE CASES')
