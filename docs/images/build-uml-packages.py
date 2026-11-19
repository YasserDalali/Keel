# UML-06: how the code is organised. Left: the layers of one context, with dependencies pointing inward.
# Right: the packages in api/src. Bottom: the rules that api/test/architecture.spec.ts enforces.
import blueprint as bp
bp.H = 1060
from blueprint import ACC, INK
import uml
from uml import MONO, TINT, line, note, text

o = uml.sheet('How the code is organised')

def pkg(x, y, w, h, name, lines=(), accent=False, mono_name=True, size=13):
    """UML package: a folder tab on top of a body, name in the tab, lines in the body."""
    col, fill = (ACC, TINT) if accent else (INK, '#fff')
    tw = max(70, len(name) * 8 + 24)
    o.append(f'<path d="M{x} {y} H{x+tw} V{y+22} H{x+w} V{y+h} H{x} Z" style="fill:{fill};stroke:{col};stroke-width:{2 if accent else 1.5}"/>'
             f'<line x1="{x}" y1="{y+22}" x2="{x+tw}" y2="{y+22}" style="stroke:{col};stroke-width:1"/>')
    o.append(text(x + 10, y + 16, name, 'h', style=f'{MONO if mono_name else ""};font-size:{size}px;{"fill:" + ACC if accent else ""}'))
    for i, l in enumerate(lines):
        o.append(text(x + 12, y + 46 + i * 18, l, style='font-size:12px'))

# --- left: the layers of one context ----------------------------------------------
o.append(text(60, 190, 'INSIDE EVERY CONTEXT', 't'))

def ring(x, y, w, h, label, sub, accent=False, dashed=False):
    col, fill = (ACC, TINT) if accent else (INK, '#fff')
    dash = 'stroke-dasharray:6 4;' if dashed else ''
    o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" style="fill:{fill};stroke:{col};stroke-width:{2 if accent else 1.5};{dash}"/>')
    o.append(text(x + w / 2, y + 26, label, 't', 'middle', f'font-size:12px;{"fill:" + ACC if accent else ""}'))
    o.append(text(x + w / 2, y + 44, sub, anchor='middle', style='font-size:11.5px'))

# Outer ring is split: the driving side (interface) and the driven side (infrastructure)
o.append(f'<rect x="60" y="210" width="700" height="520" rx="22" style="fill:#fff;stroke:{INK};stroke-width:1.5"/>')
o.append(f'<line x1="410" y1="210" x2="410" y2="308" class="dash"/><line x1="410" y1="652" x2="410" y2="730" class="dash"/>')
o.append(text(80, 240, 'INTERFACE', 't', style='font-size:12px') + text(80, 258, 'Hono routes. Parse, authorise,', style='font-size:11.5px')
         + text(80, 274, 'call one use case, map errors.', style='font-size:11.5px'))
o.append(text(740, 240, 'INFRASTRUCTURE', 't', anchor='end', style='font-size:12px')
         + text(740, 258, 'D1, R2 and provider adapters.', anchor='end', style='font-size:11.5px')
         + text(740, 274, 'Provider data stays here.', anchor='end', style='font-size:11.5px'))
ring(150, 310, 520, 340, 'APPLICATION', 'Use cases and the ports they need')
ring(260, 400, 300, 200, 'DOMAIN', 'Pure TypeScript', accent=True)
for i, l in enumerate(['aggregates, entities', 'value objects, rules', 'domain events', 'repository interfaces']):
    o.append(text(410, 470 + i * 20, l, anchor='middle', style=f'{MONO};font-size:11.5px;fill:{INK}'))

# Dependencies point inward
o.append(line('M110 470 H148', end='ae') + line('M710 470 H672', end='ae'))
o.append(line('M200 500 H258', end='ae') + line('M620 500 H562', end='ae'))
o.append(text(410, 770, 'Every arrow points inward. The domain depends on nothing outside.', anchor='middle',
              style=f'font-size:12.5px;fill:{INK}'))

# --- right: the packages in api/src ------------------------------------------------
o.append(text(840, 190, 'THE PACKAGES IN api/src', 't'))
pkg(840, 210, 700, 270, 'contexts/', ['One package per bounded context. Each has the same four layers.'])
CTX = [('identity', 'accounts, email checks'), ('borrower', 'profile, KYC, bank'), ('lending', 'the Loan: core domain'),
       ('payments', 'money in, the ledger'), ('documents', 'PDFs in R2'), ('communication', 'alerts and email'),
       ('reporting', 'read models')]
for i, (name, role) in enumerate(CTX):
    col, row = i % 4, i // 4
    x, y = 860 + col * 168, 280 + row * 95
    pkg(x, y, 156, 70, name, [role], accent=(name == 'lending'), size=12.5)
pkg(840, 520, 340, 120, 'shared/', ['The shared kernel, deliberately tiny:', 'Money, Clock, IdGenerator, DomainError,',
                                    'EventBus, crypto, the overdue rule'])
pkg(1200, 520, 340, 120, 'app/', ['The composition root: container.ts and', 'wiring/&lt;context&gt;.ts build every class.',
                                  'http.ts maps each domain error to a status.'])
pkg(840, 670, 340, 80, 'middleware/', ['requireAuth, requireRole, turnstile'])
pkg(1200, 670, 340, 80, 'index.ts', ['Mounts the routers. Exports the Worker', 'and the daily cron.'])

# package dependencies (dashed, open head): app builds contexts, contexts use shared, index uses app
o.append(line('M1370 520 V482', 'dashed', end='open') + text(1380, 505, 'builds', style='font-size:11px'))
o.append(line('M1010 482 V518', 'dashed', end='open') + text(1020, 505, 'uses', style='font-size:11px'))
o.append(line('M1370 670 V642', 'dashed', end='open') + text(1380, 660, 'uses', style='font-size:11px'))

# --- bottom: the rules the architecture test enforces -------------------------------
o.append(f'<line x1="60" y1="810" x2="1540" y2="810" class="thin" style="stroke:#d3dcea"/>')
o.append(text(60, 840, 'GUARDED BY api/test/architecture.spec.ts', 't'))
rules = ['Domain code depends only on the shared kernel and its own domain.',
         'Domain code never touches the platform: no Hono, no D1, no fetch.',
         'Application code does not depend on infrastructure or the web layer.',
         'A context never reaches into the infrastructure or interface of another context.',
         'Interface code calls use cases. It contains no repositories and no SQL.']
for i, r in enumerate(rules):
    x, y = (60, 870 + i * 24) if i < 3 else (760, 870 + (i - 3) * 24)
    o.append(bp.lu('check', x, y - 12, 14, ACC) + text(x + 22, y, r))
uml.finish(o, 'uml-packages', 'UML-06 STRUCTURE')
