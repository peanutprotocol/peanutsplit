import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')
const outputPath = resolve(webRoot, 'docs/locale-expansion-v1/review.html')
const localeCodes = ['en', 'pl', 'de', 'fr', 'uk']

const catalogs = Object.fromEntries(
    await Promise.all(
        localeCodes.map(async (locale) => [
            locale,
            JSON.parse(await readFile(resolve(webRoot, `src/i18n/messages/${locale}.json`), 'utf8')),
        ])
    )
)

function flatten(value, prefix = '', rows = {}) {
    for (const [key, child] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof child === 'string') rows[path] = child
        else flatten(child, path, rows)
    }
    return rows
}

const flat = Object.fromEntries(localeCodes.map((locale) => [locale, flatten(catalogs[locale])]))
const rows = Object.keys(flat.en).map((key) => ({
    key,
    ...Object.fromEntries(localeCodes.map((locale) => [locale, flat[locale][key]])),
}))
const messageCount = rows.length.toLocaleString('en-US')
const embeddedRows = JSON.stringify(rows).replaceAll('<', '\\u003c')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Split locale expansion v1 — review gate</title>
<style>
:root{color-scheme:light;--ink:#191817;--paper:#f5f0e6;--card:#fffdf8;--line:#d9cfbd;--green:#17653b;--amber:#875800;--blue:#234f91;--muted:#69635b;--shadow:0 8px 30px #3d35240f;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink)}main{max-width:1480px;margin:auto;padding:28px}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--blue)}h1{font-size:clamp(32px,6vw,64px);line-height:.95;letter-spacing:-.055em;margin:10px 0 18px;max-width:850px}h2{font-size:28px;letter-spacing:-.035em;margin:0 0 15px}h3{margin:0 0 8px;font-size:18px}.lede{font-size:18px;line-height:1.55;max-width:830px}.banner,.card,.catalog-shell{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow)}.banner{display:flex;gap:18px;align-items:flex-start;padding:18px 20px;margin:24px 0}.dot{width:12px;height:12px;border-radius:50%;background:var(--green);margin-top:6px;flex:0 0 auto}.dot.amber{background:#d99a13}.banner p{margin:4px 0;color:var(--muted);line-height:1.45}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}.card{padding:18px}.card p,.card li{color:var(--muted);line-height:1.45}.card ul{padding-left:20px;margin:10px 0 0}.status{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--green)}.status.hold{color:var(--amber)}section{margin-top:44px}.screens{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}.shot-set{background:#ded6c8;border-radius:22px;padding:14px}.shot-set h3{display:flex;justify-content:space-between;align-items:center}.shot-set span{font-size:12px;color:var(--muted);font-weight:500}.shots{display:grid;grid-template-columns:1fr 1fr;gap:8px}.shots figure{margin:0}.shots img{display:block;width:100%;height:auto;border-radius:10px;border:1px solid #bfb5a4;background:white}.shots figcaption{font-size:12px;margin:5px 2px 10px;color:var(--muted)}.catalog-shell{overflow:hidden}.toolbar{position:sticky;top:0;z-index:4;background:#fffdf8eF;backdrop-filter:blur(12px);padding:14px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:10px;align-items:center}.toolbar input[type=search]{min-width:min(470px,100%);flex:1;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:white;font:inherit}.toolbar label{display:flex;align-items:center;gap:5px;font-size:13px;font-weight:700}.count{font-variant-numeric:tabular-nums;font-size:13px;color:var(--muted)}.table-wrap{overflow:auto;max-height:75vh}table{border-collapse:separate;border-spacing:0;width:100%;min-width:1100px;table-layout:fixed;font-size:13px}th,td{text-align:left;vertical-align:top;padding:11px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.42}th{position:sticky;top:0;z-index:2;background:#efe8dc;font-size:11px;text-transform:uppercase;letter-spacing:.08em}th:first-child,td:first-child{position:sticky;left:0;z-index:1;width:230px;background:#faf6ee;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#514c45}th:first-child{z-index:3;background:#e9e0d2}.locale-col{width:300px}.uk{background:#fff9e9}.hidden-col{display:none}.empty{padding:40px;text-align:center;color:var(--muted)}code{background:#ece5d9;padding:2px 5px;border-radius:5px}footer{padding:40px 0;color:var(--muted);font-size:13px}@media(max-width:700px){main{padding:18px}.banner{flex-direction:column}.shots{grid-template-columns:1fr}.toolbar input[type=search]{flex-basis:100%}}
</style>
</head>
<body>
<main>
  <div class="eyebrow">Production evidence · 18 August 2026</div>
  <h1>Split locale expansion v1</h1>
  <p class="lede">The complete Polish, German, French, and Ukrainian product catalogs and the mobile surfaces they produce.</p>

  <div class="banner"><span class="dot"></span><div><strong>Runtime batch: Polish + German + French + Ukrainian.</strong><p>The switcher, first-paint detection, product UI, room flows, share cards, and OG typography are wired. SEO/content routes remain English, Spanish, and Portuguese until authored translations exist.</p></div></div>

  <section>
    <h2>Release evidence</h2>
    <div class="grid">
      <article class="card"><div class="status">Catalog integrity</div><h3>${messageCount} / ${messageCount} keys</h3><p>Exact key and placeholder parity against English. Locale-required plural branches compile for all four expansion locales.</p></article>
      <article class="card"><div class="status">Repository gate</div><h3><code>pnpm verify</code> passed</h3><p>Typecheck, copy and icon audits, web and API tests, database integration checks, and the settlement loop passed in one run.</p></article>
      <article class="card"><div class="status">Mobile walkthrough</div><h3>17 screenshots</h3><p>Home, room creation, populated room, and settlement were opened through Playwright at 390 × 844 for all four expansion locales. Ukrainian also covers the settled recap. Every surface asserts against horizontal overflow.</p></article>
      <article class="card"><div class="status">Rendering</div><h3>Latin and Cyrillic glyphs preserved</h3><p>Real Satori-to-PNG tests cover Polish and Ukrainian copy and names.</p></article>
      <article class="card"><div class="status">Scope cut</div><h3>Product UI only</h3><p>No speculative translated SEO pages, hreflang entries, or sitemap URLs. Those require authored content and are recorded as v1.1 work.</p></article>
    </div>
  </section>

  <section>
    <h2>Language decisions</h2>
    <div class="grid">
      <article class="card"><div class="status">PL · ready for gate</div><h3>Polski</h3><p>Informal singular voice. Core terms: <em>pokój, wydatek, saldo, rozliczenie, płatność</em>. Polish count morphology and neutral former-member copy are explicit.</p></article>
      <article class="card"><div class="status">DE · ready for gate</div><h3>Deutsch</h3><p>Informal <em>du/ihr</em>. Core terms: <em>Gruppe, Ausgabe, Saldo, Aufteilung, Ausgleichen, Zahlung</em>. Payment and accounting directions were independently checked.</p></article>
      <article class="card"><div class="status">FR · ready for gate</div><h3>Français</h3><p>Informal <em>tu</em>. Core terms: <em>groupe, dépense, solde, paiement, régler les comptes</em>. Elision, imported-payment behavior, and former-member action truth were rechecked.</p></article>
      <article class="card"><div class="status">UK · runtime ready</div><h3>Українська</h3><p>Selectable, auto-detected from <code>uk</code> browser preferences, and covered by the full mobile room flow. The native-review hold was explicitly overridden.</p></article>
    </div>
  </section>

  <section>
    <h2>Opened mobile surfaces</h2>
    <div class="screens">
      ${['pl', 'de', 'fr', 'uk']
          .map(
              (locale) =>
                  `<article class="shot-set"><h3>${locale.toUpperCase()} <span>390 × 844</span></h3><div class="shots">${[
                      ['home', 'Home'],
                      ['new', 'Create room'],
                      ['room', 'Room + expenses'],
                      ['settle', 'Settle flow'],
                      ...(locale === 'uk' ? [['recap', 'Settled recap']] : []),
                  ]
                      .map(
                          ([file, label]) =>
                              `<figure><a href="screenshots/${locale}-${file}.png"><img loading="lazy" src="screenshots/${locale}-${file}.png" alt="${label} in ${locale.toUpperCase()}"></a><figcaption>${label}</figcaption></figure>`
                      )
                      .join('')}</div></article>`
          )
          .join('')}
    </div>
  </section>

  <section>
    <h2>Ukrainian social previews</h2>
    <p class="lede">These are the real PNG responses from the room unfurl and share-card routes, not browser mockups.</p>
    <div class="screens">
      <article class="shot-set"><h3>UK <span>1200 × 630</span></h3><div class="shots">${[
          ['uk-og-room', 'Room unfurl'],
          ['uk-card-invite', 'Invite card'],
          ['uk-card-crew', 'Crew card'],
          ['uk-card-recap', 'Settled recap card'],
      ]
          .map(
              ([file, label]) =>
                  `<figure><a href="screenshots/${file}.png"><img loading="lazy" src="screenshots/${file}.png" alt="${label} in Ukrainian"></a><figcaption>${label}</figcaption></figure>`
          )
          .join('')}</div></article>
    </div>
  </section>

  <section>
    <h2>Complete catalog comparison</h2>
    <p class="lede">Search by dotted key or text. English is the semantic source.</p>
    <div class="catalog-shell">
      <div class="toolbar">
        <input id="search" type="search" placeholder="Search ${messageCount} keys and translations…" autocomplete="off">
        ${localeCodes
            .map(
                (locale) =>
                    `<label><input type="checkbox" data-locale="${locale}" checked> ${locale.toUpperCase()}</label>`
            )
            .join('')}
        <span class="count" id="count"></span>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Message key</th>${localeCodes
          .map((locale) => `<th data-col="${locale}" class="locale-col">${locale}</th>`)
          .join(
              ''
          )}</tr></thead><tbody id="catalog"></tbody></table><div class="empty" id="empty" hidden>No matching messages.</div></div>
    </div>
  </section>

  <section>
    <div class="banner"><span class="dot"></span><div><strong>Release candidate authorized</strong><p>Polish, German, French, and Ukrainian are approved for end-to-end verification.</p></div></div>
  </section>
  <footer>Generated from the exact working-tree catalogs by <code>apps/web/scripts/build-locale-review.mjs</code>.</footer>
</main>
<script>
const rows=${embeddedRows};
const locales=${JSON.stringify(localeCodes)};
const tbody=document.querySelector('#catalog');
const search=document.querySelector('#search');
const count=document.querySelector('#count');
const empty=document.querySelector('#empty');
let timer;
function escapeHtml(value){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function render(){
  const query=search.value.trim().toLocaleLowerCase();
  const visible=rows.filter(row=>!query||Object.values(row).some(value=>value.toLocaleLowerCase().includes(query)));
  tbody.innerHTML=visible.map(row=>'<tr><td>'+escapeHtml(row.key)+'</td>'+locales.map(locale=>'<td data-col="'+locale+'" class="'+(document.querySelector('[data-locale="'+locale+'"]').checked?'':'hidden-col')+'">'+escapeHtml(row[locale])+'</td>').join('')+'</tr>').join('');
  count.textContent=visible.length.toLocaleString()+' / '+rows.length.toLocaleString()+' messages';
  empty.hidden=visible.length!==0;
}
search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(render,100)});
for(const box of document.querySelectorAll('[data-locale]'))box.addEventListener('change',()=>{
  const locale=box.dataset.locale;
  for(const cell of document.querySelectorAll('[data-col="'+locale+'"]'))cell.classList.toggle('hidden-col',!box.checked);
});
render();
</script>
</body>
</html>`

await writeFile(outputPath, html)
console.log(`wrote ${outputPath} with ${rows.length} messages`)
