"""Regenerate the listing report from listing-kit.json plus public/press.

Copy comes from listing-kit.json so the report can never drift from the vetted
strings — the first hand-written draft shipped three claims the content gates
reject. Run: python3 ops/listings/gen-report.py
"""
import base64, io, json, os
from PIL import Image

ROOT  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PRESS = os.path.join(ROOT, 'apps/web/public/press')
HERE  = os.path.join(ROOT, 'ops/listings')
KIT   = json.load(open(os.path.join(HERE, 'listing-kit.json')))

def datauri(path, maxw):
    im = Image.open(path).convert('RGBA')
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

CAPTIONS = {
 'mobile-1-landing':      ('Landing', 'The hero states the whole product in three words.'),
 'mobile-2-create-room':  ('Create a room', 'Name, currency, your name. That is the entire setup.'),
 'mobile-3-who-is-in':    ('Add the group', 'Names only — nobody else needs an account.'),
 'mobile-4-add-expense':  ('Add an expense', 'Amount, category, who paid, how it splits.'),
 'mobile-5-room-balances':('Balances', 'Who owes what, computed live across five expenses.'),
 'mobile-6-settle-up':    ('Settle up', 'Balances turned into a short payment plan.'),
 'desktop-1-landing':     ('Landing, wide', 'The strongest single image for a directory listing.'),
}
ORDER = ['mobile-1-landing','mobile-2-create-room','mobile-3-who-is-in','mobile-4-add-expense',
         'mobile-5-room-balances','mobile-6-settle-up','desktop-1-landing']

cards = []
for key in ORDER:
    p = os.path.join(PRESS, 'screenshots', key + '.png')
    if not os.path.exists(p):
        continue
    title, cap = CAPTIONS[key]
    wide = key.startswith('desktop')
    cards.append(f'''<figure class="shot{' shot--wide' if wide else ''}">
      <img src="{datauri(p, 900 if wide else 460)}" alt="{title}">
      <figcaption><b>{title}</b><span>{cap}</span></figcaption>
    </figure>''')

def esc(v):
    return v.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

FIELDS = [
    ('Name', KIT['product']),
    ('Tagline (60)', KIT['tagline_60']),
    ('Tagline (100)', KIT['tagline_100']),
    ('Website', KIT['url']),
    ('Description (260)', KIT['description_260']),
    ('Description (long)', KIT['description_long']),
    ('Categories', ', '.join(KIT['categories'])),
    ('Tags', ', '.join(KIT['tags'])),
    ('Pricing', KIT['pricing']),
    ('Platforms', ', '.join(KIT['platforms'])),
    ('Company / author', KIT['maker']),
    ('Contact', KIT['contact']),
]
fields = '\n    '.join(
    f'''<div class="field">
      <div class="field__head"><span class="field__label">{label}</span>
        <button class="copy" data-target="f{i}" type="button">Copy</button></div>
      <pre id="f{i}" class="field__val">{esc(val)}</pre>
    </div>''' for i, (label, val) in enumerate(FIELDS))

feats = '\n      '.join(f'<li>{esc(f)}</li>' for f in KIT['key_features'])

html = open(os.path.join(HERE, 'template.html')).read()
html = (html.replace('{{GALLERY}}', '\n    '.join(cards))
            .replace('{{FIELDS}}', fields)
            .replace('{{FEATURES}}', feats)
            .replace('{{RULES}}', esc(KIT['_copy_rules']))
            .replace('{{ICON}}', datauri(os.path.join(PRESS, 'icons/peanut-split-icon-512.png'), 200)))
out = os.path.join(HERE, 'report.html')
open(out, 'w').write(html)
print('wrote', out, os.path.getsize(out) // 1024, 'KB;', len(cards), 'shots')
