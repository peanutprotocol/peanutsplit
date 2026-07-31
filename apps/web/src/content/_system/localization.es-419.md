# Split — Latin American Spanish (`es-419`) localization context

**A rulebook, not an essay.** Paste it into every ES transcreation brief with
[`stylebook.md`](stylebook.md). Additive to the stylebook: every ban, voice rule, claim rule and
structural rule there applies unchanged in this locale. Where a rule here fights the stylebook, the
stylebook wins; where either fights a Konrad ruling in [`project.md`](project.md), `project.md` wins.

Conventions come from [`research/mono-localization-conventions.md`](research/mono-localization-conventions.md)
— the extraction of peanut.me's `content/_system/` ruleset — adopted under Konrad's binding ruling of
31 Jul: _"for localization use whatever we used on peanut.me mono content repo — for whatever
dilemmas, always consult the choices on mono peanut content."_ Rules below are one of three things,
always labelled: **carried** (mono, with its citation), **Split** (a deviation with its reason), or
**decision** (a coordinator call, **open to Konrad's overrule at batch-2 review**).

---

## 0. The locale in one line

| Field                                | Value                                                                                                      | Source                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Code — filename, frontmatter, briefs | `es-419`                                                                                                   | carried — `content/_system/guidelines/locales.md` §1: _"Locale codes are lowercase BCP 47 with hyphens in all filenames and frontmatter"_ |
| hreflang value in HTML               | `es-419`                                                                                                   | carried — same §1 (BCP 47 casing; `es-419` has no case to change)                                                                         |
| URL prefix                           | `/es-419/` + the **English** slug                                                                          | carried — `locales.md` §5: _"All path segments stay in English across all locales"_                                                       |
| Canonical                            | self, `/es-419/{english-slug}` — never cross-canonical to EN                                               | carried — `seo.md` §9.1                                                                                                                   |
| Fallback                             | **none.** An untranslated page does not exist: it 404s, it leaves the sitemap, hreflang never points at it | Split — stylebook §9; mono falls back es-419 → en, Split does not                                                                         |
| `es-ar` / `es-es`                    | not in scope                                                                                               | decision 1 — mono adds them only on Argentina/Spain-specific pages; Split plans none                                                      |

**One Spanish, and it is this one.** A reader in Spain lands here too, because Split ships no
`es-es`. That is why the Spain-unsafe vocabulary bans in §3 survive even though mono's `es-419`
permits some of them.

---

## 1. Audience & perspective

The reader is **a general Latin American user who organised something and paid for part of it** — a
flatmate, a trip organiser, whoever put the villa deposit on their card. Not a cross-border payments
user; Split moves no money and this locale never implies it does (stylebook §6.13).

- **Perspective:** the person who fronted the money and now has to ask four people for it. Stylebook
  §1.2 is the frame: write to the role, not the group, second person singular.
- **Emphasise:** the group chat, the shared flat, the trip everybody split badly, the arithmetic
  nobody wants to be the one to do.
- **De-emphasise:** country-specific payment rails. Bizum is Spain-only and never appears unscoped
  (stylebook §9.2); Pix belongs to `pt-br`; Mercado Pago is not a bill-splitting context.
- **Regional neutrality is the whole job.** Carried from mono `localization.es-419.md` §1: the reader
  is _"a general Latin American user"_, and §4: _"Do not assume familiarity with Argentine financial
  specifics"_. Split's version: assume no country. Idioms only inside country-scoped blocks (§4).
- **For a page about one country** (a trip to Argentina, rent in Mexico City): frame as a Latin
  American reader going there, not as a resident explainer. Mono's transcreation rule, applied
  (`localization.es-ar.md` §1, `localization.pt-br.md` §1).

---

## 2. Language rules

### Pronoun form — **tú**, locked

Carried verbatim from mono `localization.es-419.md` §2:

> - Use **tú** (informal second person singular): "puedes", "tienes", "envías"
> - Use **ustedes** for plural second person: "pueden", "tienen"
> - **Never** use voseo ("vos podés") — that is Argentine-specific (`es-ar` only)
> - **Never** use vosotros ("podéis") — that is Spain-specific (`es-es` only)

This closes the ES-register Open item in `project.md`. Stylebook §9.2 already said singular _tú_;
mono says the same and adds `ustedes` for plural.

**Do not lift ES strings from the product UI into content.** Shipped ES product copy is Rioplatense
voseo (`DIVIDÍ LO QUE SEA`, "poné", "tocá", "sos", "pagás"). Stylebook §9.2 stands. The ban is on the
**register**, not the **terminology**: `a mano`, `saldar`, `sala`, `saldo` are shared with the
catalogs and are correct here; a voseo conjugation never is.

**Known live breach:** `apps/web/src/content/blog/split-a-group-trip-across-countries/es.md` and
`alternatives/tricount-alternative/es.md` carry voseo imperatives (`Abrí el enlace`, `Dejalo fijado`,
`Pegá un enlace`, `Probalo`, `debés`). Batch-2 fix list.

### Verb conjugation — the verbs Split actually uses

| Infinitive          | tú present | tú imperative | ustedes present |
| ------------------- | ---------- | ------------- | --------------- |
| dividir             | divides    | divide        | dividen         |
| pagar               | pagas      | paga          | pagan           |
| cargar (an expense) | cargas     | carga         | cargan          |
| abrir (the link)    | abres      | abre          | abren           |
| compartir           | compartes  | comparte      | comparten       |
| saldar              | saldas     | salda         | saldan          |
| poder               | puedes     | —             | pueden          |
| tener               | tienes     | —             | tienen          |

Same pattern for every regular -ar/-er/-ir verb.

### Grammar notes

Carried from mono `localization.es-419.md` §2:

- Subjunctive is natural, use it ("para que nadie tenga que mandar ese mensaje").
- Contractions: "al" (a + el), "del" (de + el).
- _"Avoid overly formal register — keep it conversational but not slangy."_
- **usted is banned by omission.** No mono locale specifies a formal register, and stylebook §1.2 is
  second person singular. Never `usted`, never `ustedes` addressed to one reader.

---

## 3. Vocabulary

Three-column table, mono's shape (`localization.{locale}.md` §3). **Rows 1–7 are carried from mono
verbatim**; the rest are Split terms with no mono equivalent.

| English                     | es-419                                       | Avoid                                                                           |
| --------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| the app                     | la app                                       | la aplicación, **la plataforma** (banned in every locale, `messaging.md` §14.2) |
| phone                       | celular                                      | móvil (Spain), teléfono                                                         |
| money                       | **dinero**                                   | pasta, guita, lana — **and `plata`, see below**                                 |
| send money                  | enviar dinero                                | transferir fondos, remesar                                                      |
| instantly                   | al instante / instantáneamente               | —                                                                               |
| sign up                     | registrarse                                  | darse de alta (Spain)                                                           |
| computer                    | computadora                                  | ordenador (Spain)                                                               |
| a website                   | un sitio web / una web                       | **la app** — Split is not an app and says so (stylebook §10)                    |
| room                        | **la sala**                                  | el grupo, la cuenta, el evento                                                  |
| link                        | **el enlace**                                | el link, la liga (MX-only), el vínculo, la URL                                  |
| the link is the key         | **el enlace es la llave**                    | tu token, tu acceso                                                             |
| expense                     | **el gasto**                                 | el egreso, la erogación (accounting register)                                   |
| add an expense              | cargar un gasto / agregar un gasto           | ingresar un gasto                                                               |
| balance                     | **el saldo**                                 | el balance (false friend — a balance sheet)                                     |
| all square                  | **a mano** ("quedan a mano", "estás a mano") | en cero, balanceado, empatados                                                  |
| settle up (verb)            | **saldar**                                   | liquidar (accounting), pasar la cuenta, arreglar cuentas                        |
| settled                     | saldado / saldadas                           | cerrado, finiquitado                                                            |
| who owes who                | **quién le debe a quién**                    | quién debe qué                                                                  |
| free forever                | **gratis para siempre**                      | gratuito, sin costo, versión gratis                                             |
| twelve currencies           | doce monedas                                 | multimoneda, cualquier moneda (stylebook §6.7)                                  |
| converted at the day's rate | al tipo de cambio del día                    | tipo de cambio en vivo / en tiempo real (stylebook §6.6)                        |
| flatmate                    | roomie / compañero de departamento           | **compañero de piso** (Spain), piso                                             |
| flat                        | departamento                                 | piso (Spain)                                                                    |
| group chat                  | el chat del grupo                            | el grupo de WhatsApp (unscoped)                                                 |

**`plata` — Split deviates from mono, on purpose.** Mono's `es-419` table permits _"dinero / plata
(informal)"_; mono's `es-es` bans it. Split has no `es-es`, so `es-419` is also the page a reader in
Spain gets, and stylebook §9.2 lists `plata` under **Avoid (binding)**. Write **dinero**.
_Live debt:_ `plata` appears on three shipped ES pages (8 occurrences, e.g.
`blog/split-expenses-across-currencies/es.md`). Not a hard fail on legacy files; new pages use
`dinero`, and the old ones get fixed when next touched. **Decision — open to overrule.**

---

## 4. Anti-patterns

Stylebook §9.2 is binding and is not restated here. What it adds up to, plus the mono-shaped
avoid/use table:

| Avoid                                                            | Use instead                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| vosotros, estáis, habéis, vuestro/vuestra                        | ustedes, están, han, su/suyo                                                                    |
| vos podés, pagá, enviá, poné, sos                                | puedes, paga, envía, pon, eres                                                                  |
| a escote, a pachas                                               | dividir en partes iguales                                                                       |
| bare `bote` (jail in MX, GT, HN)                                 | name the variants together — _bote común_, _vaquita_, _coperacha_ — or scope one to its country |
| chaval, tío, vale, guay, coger                                   | neutral register; `tomar` for `coger`                                                           |
| pasta, guita, lana, plata                                        | dinero                                                                                          |
| compañero de piso, piso                                          | roomie, departamento                                                                            |
| "una cañita", "un vinito" — diminutives that are not locale-safe | "un café" is safe; name the physical thing                                                      |
| transferir fondos                                                | enviar dinero                                                                                   |
| la plataforma                                                    | la app / el sitio                                                                               |
| tasa de cambio                                                   | tipo de cambio                                                                                  |

**Idioms live only inside country-scoped blocks** (stylebook §9.2, coordinator decision 30 Jul): a
short block that names its country, not a full section per country. Unscoped prose names the variants
together rather than picking one.

**Keyword spine: `dividir gastos` / `compartir gastos`** (stylebook §9.2). Every neutral source uses
it; it is what the title, H1 and body target, and the slug stays English (§0).

### The no-account claim — `sin registrarse`, and how to frame it

Mono's positive-framing rule is a **pt-br** rule, and mono says so: `sem CPF` is banned in Portuguese
headings, while `content/countries/brazil/es-419.md:3` legitimately reads _"Usa Pix en Brasil sin
CPF."_ The distrust mechanism is Brazilian, not Latin American in general (conventions doc §3). So ES
inherits the **preference**, not the ban:

1. **The query is the query.** `sin registrarse`, `sin cuenta`, `sin descargar nada` appear in
   `title`, in `description`, in the FAQ question as a person types it, and in body prose. Never
   suppress them.
2. **Prefer an H1 that leads with what the reader gets.** → _"Divide la cuenta sin registrarse"_
   (leads with the action) or _"Solo un enlace, y cada uno carga lo que pagó"_ (leads with what
   exists). Avoid _"Sin registro para dividir la cuenta"_. This is a preference in ES, a hard test in
   `pt-br` — see [`localization.pt-br.md`](localization.pt-br.md) §6.1 for the asymmetry and its
   reason.
3. **Circumvention framing is banned in both locales:** `saltarte el registro`, `sin identificarte`,
   `sin documentos`, `elimina esa barrera`. Nobody registers anything in Split, so nothing describes
   getting round a registration.
4. **Honesty clamp.** `sin cuenta` describes the absence of a form. It never implies privacy or
   anonymity (stylebook §6.12 — accountless is a **friction** story), and never implies permanence
   (stylebook §7.3 — the link is the key, and a group that loses it loses the room).

---

## 5. Numbers, currency, dates

- **Numbers** — carried verbatim, mono `localization.es-419.md` §5: *"use period for thousands
  separator, comma for decimal (e.g., 1.000.000 merchants, $50,00) — this is the LATAM convention"*.
  So: `1.000.000`, `$50,00`, `12,5 %`.
- **Currency** — carried: `$` for a local amount, `USD` or `dólares` spelled out for dollars. Split
  adds: a worked example on a Split page needs a currency the whole page shares. Use the currency of
  the scene, name it once, and never mix `$` for two different pesos on one page.
- **Dates** — mono has no stated rule (conventions doc §6, "no convention found"). Observed and
  adopted: long form, lowercase month, `de` — `abril de 2025`. A stylebook §7.6 check date renders
  idiomatically in prose (`según la tasa de hoy`), and as an ISO date in the file's check-date
  comment, which is code, not prose.
- **Amounts in a derivation (stylebook §8.3) keep their arithmetic legible.** Show the working with
  the same separators, not with English ones.

---

## 6. Cast, example names and competitor quotes

**Decision 4 — cast and example names are locale-invariant. Never translated, never swapped for
local names.** Mono's cleanest precedent, from conventions doc §4: names put in the **data layer** are
inherited unchanged by every locale (`content/_system/data/blog-posts/rewards-v2-savings-calculator.md`
names _María_/_Diego_ once and all five locales keep them), and a real person's name is never
translated (`content/stories/cat/{en,es-419,pt-br}.md` are byte-identical on `*Cat, Buenos Aires*`).
Mono's prose layer is incoherent by contrast — `Alice`/`Bob` kept, `Alicia`/`Bruno` hispanicised,
`Ana`/`Carlos` invented, all in the same corpus. Split takes the data-layer precedent and drops the
prose-layer mess.

For Split that means:

- The 16 doodle personas keep their `avatars.ts` labels in every locale. **This RESOLVES stylebook
  §5.10**, which was provisional and forbade persona labels on localised pages. They are now allowed,
  unchanged and untranslated, under the same §5.4 density caps and §5.5 absence families as EN.
- The friend group is **Bea, Jules, Mo, Ana** in every locale (stylebook §5.7). Not Beatriz, not Ana
  becoming Ania.
- **Room names are the one exception, and they are not free translation.** The four shipped rooms have
  shipped localised names in `apps/web/src/i18n/messages/es.json`: **Finde en Lisboa**, **Depto 4B**,
  **Ramen del martes**, **Retiro remoto**. Use those strings exactly. Never invent a fifth room or a
  new translation of one of these (stylebook §5.7).
- Nationality adjectives and role labels translate; names do not. Carried from mono
  (`stories/cat/es-419.md`: `Cat es irlandesa`).

**Decision 5 — a byte-locked competitor quote never translates.** A verbatim quote inside
`<Quote source=…>` stays in the language of the page it was taken from, in every locale. The
surrounding in-locale prose carries the characterisation and, where the reader needs it, a short gloss
in our own words — never a translation presented as the quote. Translating a quote breaks the
byte-lock the whole claims discipline rests on (stylebook §7.1): the quote is the evidence.

This is already the shipped convention, stated in the live ES page's own header comment
(`alternatives/tricount-alternative/es.md`):

> _"Las citas se dejan en inglés a propósito: son la prueba."_

Keep that sentence in the header comment of every ES page that quotes a competitor.

---

## 7. Pinned strings

**Decision 6b — one string per locale per recurring CTA, pinned here.** Mono never did this and paid
for it: three different renderings of one CTA shipped live (conventions doc §8, trap 3).

### CTAs — the pins are the live shipped strings, so nothing on prod has to move

| #   | Surface                                                                             | EN (shipped)                                             | es-419 (pinned)                                                 |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| C1  | `<Hero cta>` and `<CTA text>` — the button, on every page                           | `Start a split`                                          | **`Crear un split`**                                            |
| C2  | `<Hero ctaHint>`, and `<CTA body>` where the body is the hint (10 + 3 shipped uses) | `Takes ten seconds. No email, no password, no download.` | **`Diez segundos. Sin correo, sin contraseña, sin descargas.`** |

C1 keeps `split` as the untranslated brand noun (§8), which is why it beats the stylebook's old
`Empezar a dividir` — that string was written in the stylebook and never used on a page. **§9 of the
stylebook is updated to match.** C2's `correo` reads unambiguously inside its three-item list
(`sin cuenta, sin correo`); mono has no single convention here (`email` 33, `correo electrónico` 32,
`correo` 20 across `es-419.md` files), so Split pins its own live string. Standing alone in body
prose, `correo electrónico` is the safer form.

### Recurring cross-link labels — new pins, no live string exists yet

Not CTAs, but the same one-string-per-locale rule, because they repeat across pages:

| #   | EN (shipped)                               | es-419 (pinned)                           |
| --- | ------------------------------------------ | ----------------------------------------- |
| L1  | `How Split compares to Splitwise` (4 uses) | **`Cómo se compara Split con Splitwise`** |
| L2  | `How Split compares to Tricount` (2 uses)  | **`Cómo se compara Split con Tricount`**  |
| L3  | `The calculators` (2 uses)                 | **`Las calculadoras`**                    |

Everything else — `<CTA title>`, `<CTA body>` when it is page-specific, `<Steps>` titles, section
headings — is **page-scoped and must not be pinned**. Stylebook §6.17 makes concrete artefacts
page-scoped; a shared `<CTA title>` is exactly the boilerplate that rule kills.

---

## 8. Do not translate

Carried verbatim from mono (`localization.es-419.md` §5, repeated in `generate-content.md` §7):

> Keep entity slugs, URL paths, and schema field names in English

Split's full list:

1. **Slugs and URL paths.** `/es-419/split-bill-no-signup`, never
   `/es/dividir-gastos-sin-registrarse`. The ES query is targeted through `title`, `H1` and body.
2. **Frontmatter keys and machine values:** `type`, `intent`, `claims`, `competitorClaims`, `cast`,
   `date`, `canonical`. Claim IDs and cast keys are identifiers, not words. **`tags` is the
   exception — facet labels are reader-facing and do translate** (`tags: [alternativas, monedas]` is
   live and correct).
3. **Brand names:** Split · Peanut · Peanut Split · Split by Peanut · Splitwise · **Settle Up** ·
   Tricount · Splid · Spliit · Kittysplit · bunq · WhatsApp · Visa · Apple Pay · Google Pay.
   (`Visa`/`Apple Pay`/`Google Pay` is mono's own card guardrail, carried.)
4. **Cast persona labels and the friend-group names** — decision 4, §6.
5. **Byte-locked competitor quotes** — decision 5, §6.
6. **`split` as Split's own noun** (`crear un split`) — the brand word, lowercase in running prose,
   capitalised when it is the product (stylebook §10.1).

### The `Settle Up` disambiguation — required, ES-specific

`Settle Up` is a competitor **and** `settle up` is the verb this whole product is about. In ES the two
diverge cleanly, so keep them apart:

- The **verb** is always **`saldar`** (§3). Never `settle up`, never `hacer settle up`.
- The **brand** is always **`Settle Up`** — English, two words, title case, untranslated. Never
  `Saldar` where the app is meant.
- **On any page whose slug contains `settle-up`:** a lowercase `settle up` in an `es-419.md` file is a
  hard fail — it is either the untranslated verb (use `saldar`) or a mis-cased brand (use `Settle
Up`). Mechanical, see §10.
- Never build a heading where `saldar` could be read as the brand: _"Cómo saldar con Settle Up"_ is
  legal, _"Saldar es la alternativa"_ is not.

---

## 9. Transcreation, not translation

**The page is re-authored for this reader against a shared skeleton.** Carried from mono, which states
this as per-locale Audience & Perspective sections rather than as a translation policy
(conventions doc §5), and demonstrates it: `content/countries/brazil/en.md` and its `pt-br.md` share
their H2 skeleton and have **completely different H3s** — the EN page is foreigner-in-Brazil, the
pt-br page inverts to Brazilian-abroad and demotes the foreigner segment to last. Word counts differ
by a third (en 2,491 · pt-br 1,758 · es-419 2,537). The generation rule behind it, verbatim
(`generate-content.md` §6): _"**Compose original prose.** Templates are briefs, not
fill-in-the-blanks."_

For Split:

- **Keep:** the query the page targets, the H2 skeleton, every claim and its ID, the concession
  (stylebook §4), the structure required by `type` (stylebook §11.3), the numbers.
- **Re-author:** the opening scene, the examples, the objection the page pre-empts, the order of the
  segments, the FAQ phrasing. A Spanish reader's flat-share is not a British one.
- **Do not re-import a duplication EN removed.** The cluster idea-ownership map from the 31 Jul
  hero pass ships with every transcreation brief (`project.md`, post-hero-pass follow-ups). Stylebook
  §6.17 is page-scoped and locale-scoped: one idea, one appearance, per locale.
- **Anti-AI rules apply in this locale unchanged** — stylebook §6.16 and the §11.1 never-strings,
  including the Spanish ones (`seamos honestos`, `vamos a ser honestos`). Carried: mono applies
  `messaging.md` §15 to every locale. The Spanish conclusion tells (`al final del día`, `en resumen`)
  are ordinary connectives that no regex can separate from the tell — judgement, caught by the cold
  read (stylebook §11.4).
- **Emotional claims sourced from ES need first-party verification before they ship** (stylebook
  §9.4). Unchanged by this file.

---

## 10. The diacritic gate (spec — not built)

**Decision 6c.** Mono's live corpus has files that lost their accents in generation:
`content/pay-with/pix/es-419.md` has **5 accented characters in the whole file** (`instantaneos`,
`codigo`, `camara`, `Como Empezar`), `content/countries/brazil/es-419.md` has 20, against 187 in a
healthy one (conventions doc §8, trap 1). Mono has no rule; Split adds one. Spec only — implement in
`apps/web/scripts/marketing-copy-audit.mjs`, wired into `pnpm test`, when batch 2 lands.

**Scope:** files matching `src/content/**/es-419.md`. Run over `ownProse()` — the existing helper that
strips `<Quote>` blocks — so an English byte-locked quote (§6) never trips the gate or drags the
density down.

**Class A — hard fail. Whole-word, case-insensitive. Every entry is a string that is never a correct
Spanish word**, so the gate cannot fail correct copy:

```
codigo → código        camara → cámara          numero → número
rapido → rápido        facil → fácil            dolar/dolares → dólar/dólares
tambien → también      despues → después        ademas → además
telefono → teléfono    dias → días              ultimo → último
credito → crédito      metodo → método          calculo → cálculo (noun)
economico → económico  automatico → automático  practico → práctico
instantaneo(s) → instantáneo(s)                 division → división
sesion → sesión        aplicacion → aplicación  informacion → información
alguien-shaped: quien → quién ONLY in Class B
```

**Class B — heading-position fail.** The unaccented spelling is a real Spanish word, but at the start
of a heading, a `title:`, or an `<FAQItem question>` it is nearly always the interrogative and nearly
always wrong. Fail when the word is the **first token** of any `#`/`##`/`###`, of `title:`, of
`description:`, or of a `question=` attribute:

```
Como → Cómo    Que → Qué    Cuanto/Cuanta → Cuánto/Cuánta
Donde → Dónde  Quien → Quién  Cual → Cuál  Cuando → Cuándo
```

Mid-sentence these are all legal (`como un local`, `más que eso`) and are never flagged.

**Class C — density advisory, not a fail.** Count accented characters (`áéíóúüñ¿¡` plus their
capitals) in `ownProse()`. Flag any `es-419.md` under **8 per 1,000 characters** for a human look.
This is the check that catches the mono failure mode generically, without a wordlist: the healthy
mono file scores well above it and the broken ones score near zero.

**Class D — the `ñ` check.** `anos` for `años`, `nino` for `niño`, `senal` for `señal`, `pequeno` for
`pequeño`. Hard fail; none is a Spanish word.

The gate is mechanical and dumb by design. It does not check that an accent is _right_, only that a
known-wrong spelling is absent. Accent correctness stays with the cold read (stylebook §11.4).

---

## 11. Not-yet and coming-soon

Split ships nothing country-gated, so mono's country coming-soon block (`localization.es-419.md` §6)
does not transfer. What does transfer is its shape, for the one Split case that needs it — a feature
behind a flag (`NEXT_PUBLIC_SPLIT_V2_ENABLED`, the CSV importer):

- Future tense, `Próximamente:` prefix before the action verb. Never present tense for something
  that is not live.
- Never write step-by-step instructions for a feature that is not live.
- State the absence plainly once: _"Todavía no se puede importar desde Splitwise."_
- Stylebook §7.3 governs which claim strings are legal; nothing here loosens them.

---

## 12. Deliberately not carried from mono

Named so nobody re-derives them later:

| Mono rule                                                      | Why not                                                                                                                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fallback chain `es-419 → en`                                   | Split has no English fallback at all (stylebook §9). An untranslated page 404s.                                                                                              |
| `es-ar` and `es-es` locales, voseo and vosotros register files | Decision 1 — no Argentina- or Spain-specific pages planned. If one is ever written, mono's two files are the spec, unchanged.                                                |
| The `argentina.es-419.md` entity-override layer                | Documented in mono, **zero such files exist** (conventions doc §8, trap 2). Split adopts the context-file layer only.                                                        |
| `generated_from:` provenance blocks                            | Mono generates pages from data entities. Split's pages are hand-written and reviewed per batch; the check-date comment (stylebook §7.1) is the provenance that matters here. |
| `alternates:` frontmatter listing sibling files                | Split's engine derives hreflang from files on disk (`localesForSlug`), which cannot drift. Mono's field is a lint, backfilled on 174 of ~746 files.                          |
| `consent:` gate on user interviews                             | Split quotes no users. Stylebook §6.14 bans social proof outright.                                                                                                           |
| Translation-provenance note (`note: translated from …`)        | Present on 4 mono help pages out of ~746. Not a convention; not adopted.                                                                                                     |
| "Crypto"/"digital dollars" vocabulary bans                     | Split's content never touches the money layer (stylebook §6.13). Nothing to rename.                                                                                          |
| Card copy guardrails, waitlist and closed-beta strings         | Peanut Card is not a Split surface.                                                                                                                                          |
