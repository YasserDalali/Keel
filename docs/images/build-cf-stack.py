# Regenerates docs/images/cf-stack.svg. Render: google-chrome --headless --screenshot=cf-stack.png --force-device-scale-factor=2 --window-size=1600,1000 file://$PWD/cf-stack.svg
import re
import os
ICON_PX=2.2  # on-screen stroke, matches the Worker glyph
HERE=os.path.dirname(os.path.abspath(__file__))
SI=HERE+'/icons/simple-icons/'; LU=HERE+'/icons/lucide/'
def si(n,x,y,sz):
    d=re.search(r' d="([^"]+)"',open(SI+n+'.svg').read()).group(1)
    return f'<svg x="{x}" y="{y}" width="{sz}" height="{sz}" viewBox="0 0 24 24"><path fill="#14213d" d="{d}"/></svg>'
def lu(n,x,y,sz,sw=None):
    sw=sw or round(ICON_PX*24/sz,3)
    t=open(LU+n+'.svg').read().split('stroke-linejoin="round"')[1]
    inner=re.search(r'>\s*(<(?:path|ellipse|circle|rect|line|polyline)[\s\S]*)</svg>',t).group(1)
    return f'<svg x="{x}" y="{y}" width="{sz}" height="{sz}" viewBox="0 0 24 24" fill="none" stroke="#14213d" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{inner}</svg>'
def box(x,y,w,h,title,sub,icon,tx=None):
    tx=tx or x+(w-0)//1
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" class="box"/>{icon}'
def card(x,y,w,h,icon,title,sub,tx):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" class="box"/>{icon}'
            f'<text x="{tx}" y="{y+h/2-3:.0f}" class="h">{title}</text><text x="{tx}" y="{y+h/2+17:.0f}" class="s">{sub}</text>')
def num(n,cx,cy):
    return f'<circle cx="{cx}" cy="{cy}" r="8" class="acc" style="fill:#fff"/><text x="{cx}" y="{cy+3}" class="n">{n}</text>'
o=[]
o.append('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000" font-family="Inter, Helvetica, Arial, sans-serif">
<defs>
<pattern id="minor" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e9eef6" stroke-width="0.6"/></pattern>
<pattern id="major" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#minor)"/><path d="M100 0H0V100" fill="none" stroke="#d3dcea" stroke-width="0.9"/></pattern>
<marker id="ae" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 1L10 5L0 9z" fill="#14213d"/></marker>
<marker id="as" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M10 1L0 5L10 9z" fill="#14213d"/></marker>
</defs>
<style>
.ink{stroke:#14213d;fill:none;stroke-width:1.5}.box{stroke:#14213d;fill:#fff;stroke-width:1.5}.thin{stroke:#14213d;fill:none;stroke-width:1}
.dash{stroke:#14213d;fill:none;stroke-width:1.2;stroke-dasharray:7 5}.acc{stroke:#1f4fe0;fill:none;stroke-width:2}
.t{fill:#14213d;font-size:11px;letter-spacing:1.6px;font-weight:600}.h{fill:#14213d;font-size:16px;font-weight:700;letter-spacing:.6px}
.s{fill:#4a5670;font-size:12.5px}.n{fill:#1f4fe0;font-size:9.5px;font-weight:700;text-anchor:middle}
</style>
<rect width="1600" height="1000" fill="#ffffff"/><rect width="1600" height="1000" fill="url(#major)"/>
<rect x="20" y="20" width="1560" height="960" class="ink"/><rect x="30" y="30" width="1540" height="940" class="thin"/>
<text x="60" y="108" fill="#14213d" font-size="36" font-weight="600">Microloans on Cloudflare</text>
<line x1="60" y1="132" x2="1540" y2="132" class="thin"/>
<text x="60" y="285" class="t">CLIENTS</text>''')
o.append(card(60,300,240,110,lu('app-window',80,327,56),'BROWSER','Keel SPA',162))
o.append(card(60,500,240,110,lu('webhook',80,527,56),'WEBHOOKS','Didit, PayPal',162))
o.append('<path d="M300 355 H370 V420 H440" class="ink" marker-end="url(#ae)"/><path d="M300 555 H370 V500 H440" class="ink" marker-end="url(#ae)"/>')
o.append('<rect x="400" y="170" width="800" height="620" class="dash"/><text x="420" y="194" class="t">CLOUDFLARE</text>')
o.append(card(440,210,230,75,lu('shield-check',459,229,36),'EDGE','TLS, WAF, DDoS',506))
o.append(card(685,210,230,75,lu('bot',704,229,36),'TURNSTILE','Bot check',750))
o.append(card(930,210,230,75,lu('panels-top-left',949,229,36),'ASSETS','Static SPA',996))
for x in (555,800,1045): o.append(f'<path d="M{x} 285 V330" class="ink" marker-end="url(#ae)"/>')
# worker
o.append('<rect x="440" y="330" width="720" height="240" class="box" stroke-width="2"/>'+si('cloudflareworkers',458,342,22)+
 '<text x="488" y="358" class="h">WORKER</text><text x="1140" y="358" class="s" text-anchor="end">Hono</text><line x1="440" y1="372" x2="1160" y2="372" class="thin"/>')
layers=[(460,'INTERFACE','Routes',False),(638,'APPLICATION','Use cases',False),(816,'DOMAIN','Aggregates',True),(994,'INFRASTRUCTURE','Adapters',False)]
for x,t,sub,hi in layers:
    cls='acc' if hi else 'ink'; fill=' fill="#f1f5ff"' if hi else ''
    col='style="fill:#1f4fe0"' if hi else ''
    fs='style="letter-spacing:.6px;font-size:10px"' if t=='INFRASTRUCTURE' else col
    o.append(f'<rect x="{x}" y="395" width="140" height="90" class="{cls}"{fill}/><text x="{x+70}" y="436" class="t" text-anchor="middle" {fs}>{t}</text><text x="{x+70}" y="460" class="s" text-anchor="middle">{sub}</text>')
o.append('<path d="M600 440 H636" class="ink" marker-end="url(#ae)"/><path d="M778 440 H814" class="ink" marker-end="url(#ae)"/><path d="M992 440 H958" class="ink" marker-end="url(#ae)"/>')
o.append('<rect x="460" y="503" width="674" height="26" class="thin" stroke-dasharray="4 3"/><text x="797" y="520" class="t" text-anchor="middle">SHARED KERNEL: EVENTBUS, MONEY, CLOCK</text>')
o.append('<text x="460" y="557" class="s">7 bounded contexts</text>')
for x,l in ((555,'env.DB'),(800,'env.LOAN_CACHE'),(1045,'env.DOCS_BUCKET')):
    o.append(f'<path d="M{x} 570 V650" class="ink" marker-start="url(#as)" marker-end="url(#ae)"/><text x="{x+20}" y="615" class="s">{l}</text>')
o.append(card(440,650,230,110,lu('database',458,681,48),'D1','Loans, profiles, ledger',522))
o.append(card(685,650,230,110,lu('key-round',703,681,48),'KV','Blacklist, throttle, dedup',767))
o.append(card(930,650,230,110,lu('archive',948,681,48),'R2','PDF files',1012))
# externals
o.append('<text x="1310" y="190" class="t">EXTERNAL PROVIDERS</text>')
o.append(card(1310,210,240,80,si('paypal',1326,234,32),'PAYPAL','Payments',1376))
o.append(card(1310,310,240,80,lu('landmark',1326,334,32),'PLAID','Bank link',1376))
o.append(card(1310,410,240,80,lu('scan-face',1326,434,32),'DIDIT','Identity check',1376))
o.append(card(1310,510,240,80,si('resend',1326,534,32),'RESEND','Email',1376))
o.append('<path d="M1160 450 H1250" class="ink"/><path d="M1250 250 V550" class="ink"/>'+''.join(f'<path d="M1250 {y} H1308" class="ink" marker-end="url(#ae)"/>' for y in (250,350,450,550)))
o.append('<text x="1310" y="622" class="t">ANTI-CORRUPTION LAYER</text>')
# numbers beside arrows
for n,cx,cy in ((1,555,301),(2,800,301),(3,1045,301),(4,555,610),(5,800,610),(6,1045,610)): o.append(num(n,cx,cy))
o.append(num(7,1205,450))
# key
o.append('<text x="60" y="835" class="t">KEY</text>')
keys=['The edge screens each request.','Turnstile checks the bot token.','Assets serve the SPA. Hono serves /api.','Use cases read and write D1.',
      'KV keeps the token blacklist, a throttle and webhook dedup keys.','Domain events write PDF files to R2.','Adapters call providers. Providers send webhooks to Hono.']
for i,k in enumerate(keys):
    col,row=divmod(i,4); x=60+col*470; y=862+row*24
    o.append(f'<text x="{x}" y="{y}" fill="#1f4fe0" font-size="12.5" font-weight="700">{i+1}</text><text x="{x+22}" y="{y}" class="s">{k}</text>')
# title block
o.append('<rect x="1380" y="880" width="160" height="70" class="ink"/><line x1="1380" y1="915" x2="1540" y2="915" class="thin"/><line x1="1460" y1="915" x2="1460" y2="950" class="thin"/>'
 '<text x="1392" y="902" class="t">CF-01 STACK</text><text x="1392" y="938" class="s">SHEET 1</text><text x="1472" y="938" class="s">REV A</text></svg>')
open(HERE+'/cf-stack.svg','w').write('\n'.join(o))
