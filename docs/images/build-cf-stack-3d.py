# CF-01: the Cloudflare stack as an exploded isometric view. Writes cf-stack-3d.svg next to this file.
# Render: google-chrome --headless --hide-scrollbars --force-device-scale-factor=2 --window-size=1600,1000 --screenshot=cf-stack-3d.png file://$PWD/cf-stack-3d.svg
from blueprint import *

TOP, MID, BOT = Z
o = [header('Microloans on Cloudflare')]

o.append(leader(TOP, 'EDGE', 'TLS, WAF, Turnstile, assets'))
o.append(leader(MID, 'WORKER', 'Hono, DDD layers', si('cloudflareworkers', 330, 0, 18)))
o.append(leader(BOT, 'BINDINGS', 'D1, KV, R2'))

# Clients feed the edge leader
_, YE = iso(0, PD, TOP)
o.append('<text x="60" y="165" class="t">CLIENTS</text>')
for i, (ic, t, s) in enumerate((('app-window', 'BROWSER', 'Keel SPA'), ('webhook', 'WEBHOOKS', 'Didit, PayPal'))):
    y0 = 180 + i * 110
    o.append(f'<rect x="60" y="{y0}" width="230" height="90" class="ink" style="fill:#fff"/>{lu(ic, 76, y0+21, 48)}'
             f'<text x="140" y="{y0+42}" class="h">{t}</text><text x="140" y="{y0+62}" class="s">{s}</text>'
             f'<path d="M290 {y0+45} H310 V{YE-30:.0f}" class="ink"/>')
o.append(f'<path d="M310 {YE-30:.0f} V{YE:.1f} H328" class="ink" marker-end="url(#ae)"/>')

# Bottom: bindings
o.append(slab(BOT))
for x, ic, t, s, n in ((15, 'database', 'D1', 'env.DB', 4), (165, 'key-round', 'KV', 'env.LOAN_CACHE', 5), (315, 'archive', 'R2', 'env.DOCS_BUCKET', 6)):
    o.append(tile(x, 30, 130, 140, BOT, big_tile_inner(130, ic, t, s, n)))
o.append(risers(MID))

# Middle: worker
o.append(slab(MID))
layers = ((15, 'INTERFACE', 'Routes'), (127, 'APPLICATION', 'Use cases'), (239, 'DOMAIN', 'Aggregates'), (351, 'INFRASTRUCTURE', 'Adapters'))
for x, t, s in layers:
    acc = t == 'DOMAIN'
    col = f'style="fill:{ACC}"' if acc else ''
    fs = 'style="font-size:8.5px;letter-spacing:.2px"' if t == 'INFRASTRUCTURE' else col
    inner = (f'<text x="47" y="46" class="t" text-anchor="middle" {fs}>{t}</text>'
             f'<text x="47" y="66" class="s" text-anchor="middle">{s}</text>')
    o.append(tile(x, 25, 94, 100, MID, inner, acc))
o.append(face(MID) +
         ''.join(f'<path d="M{a} 75 H{b}" class="ink" marker-end="url(#ae)"/>' for a, b in ((109, 125), (221, 237))) +
         '<path d="M351 75 H335" class="ink" marker-end="url(#ae)"/>'
         '<rect x="15" y="145" width="430" height="34" class="dash" style="fill:#fff"/>'
         '<text x="230" y="166" class="t" text-anchor="middle">SHARED KERNEL: EVENTBUS, MONEY, CLOCK</text></g>')

# Worker -> providers
XR, YR = iso(PW, 0, MID - T / 2)
o.append(f'<path d="M{XR:.1f} {YR:.1f} H1180" class="ink"/>')
o.append(num(7, (XR + 1180) / 2, YR))

# Top: edge
o.append(risers(TOP))
o.append(slab(TOP))
for x, ic, t, s, n in ((15, 'shield-check', 'EDGE', 'TLS, WAF, DDoS', 1), (165, 'bot', 'TURNSTILE', 'Bot check', 2), (315, 'panels-top-left', 'ASSETS', 'Static SPA', 3)):
    o.append(tile(x, 30, 130, 140, TOP, big_tile_inner(130, ic, t, s, n)))

# Providers
o.append('<text x="1230" y="318" class="t">EXTERNAL PROVIDERS</text>')
provs = ((si('paypal', 0, 0, 28), 'PAYPAL', 'Payments'), (lu('landmark', 0, 0, 28), 'PLAID', 'Bank link'),
         (lu('scan-face', 0, 0, 28), 'DIDIT', 'Identity check'), (si('resend', 0, 0, 28), 'RESEND', 'Email'))
ys = [335 + i * 70 for i in range(len(provs))]
for y0, (ic, t, s) in zip(ys, provs):
    ic = ic.replace('x="0" y="0"', f'x="1246" y="{y0+14}"')
    o.append(f'<rect x="1230" y="{y0}" width="300" height="56" class="ink" style="fill:#fff"/>{ic}'
             f'<text x="1290" y="{y0+25}" class="h">{t}</text><text x="1290" y="{y0+43}" class="s">{s}</text>'
             f'<path d="M1180 {y0+28} H1228" class="ink" marker-end="url(#ae)"/>')
o.append(f'<path d="M1180 {ys[0]+28} V{max(ys[-1]+28, YR):.1f}" class="ink"/>')  # reach the Worker line
o.append(f'<text x="1230" y="{ys[-1]+90}" class="t">ANTI-CORRUPTION LAYER</text>')

o.append(key(['The edge screens each request.', 'Turnstile checks the bot token.', 'Assets serve the SPA. Hono serves /api.',
              'Use cases read and write D1.', 'KV keeps the token blacklist, a throttle and webhook dedup keys.', 'Domain events write PDF files to R2.',
              'Adapters call providers. Providers send webhooks to Hono.']))
o.append(title_block('CF-01 STACK'))
write('cf-stack-3d', o)
