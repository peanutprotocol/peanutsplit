# Split — Brazilian Portuguese (`pt-br`) localization context

**A rulebook, not an essay.** Paste it into every PT transcreation brief with
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
| Code — filename, frontmatter, briefs | `pt-br`                                                                                                    | carried — `content/_system/guidelines/locales.md` §1: _"Locale codes are lowercase BCP 47 with hyphens in all filenames and frontmatter"_ |
| hreflang value in HTML               | `pt-BR`                                                                                                    | carried — same §1: _"hreflang values in HTML use standard BCP 47 casing"_                                                                 |
| URL prefix                           | `/pt-br/` + the **English** slug                                                                           | carried — `locales.md` §5: _"All path segments stay in English across all locales"_                                                       |
| Canonical                            | self, `/pt-br/{english-slug}` — never cross-canonical to EN                                                | carried — `seo.md` §9.1                                                                                                                   |
| Fallback                             | **none.** An untranslated page does not exist: it 404s, it leaves the sitemap, hreflang never points at it | Split — stylebook §9; mono falls back pt-br → en, Split does not                                                                          |
| `pt-PT`                              | not in scope, ever                                                                                         | carried — mono ships one Portuguese                                                                                                       |

The engine already lowercases the URL prefix and keeps BCP 47 casing in the hreflang value, which is
exactly mono's rule (`apps/web/src/i18n/paths.ts`). The content **filename** moves from `pt-BR.md` to
`pt-br.md` to match mono's lowercase-filename convention — an engine task, see `project.md`.

---

## 1. Audience & perspective

The reader is **a Brazilian in a group that owes each other money** — the churrasco, the trip to
Fernando de Noronha, the flat share, the twelve people on the rented van. Not a cross-border payments
user; Split moves no money and this locale never implies it does (stylebook §6.13).

- **Perspective:** the person who paid for most of it and now has to bring it up. Stylebook §1.2 is
  the frame: write to the role, not the group, second person singular.
- **Emphasise:** the group on WhatsApp, the _rateio_ nobody wants to run, the _cota_ per person, the
  spreadsheet somebody keeps forgetting to update.
- **De-emphasise:** explaining what Pix is. Carried from mono `localization.pt-br.md` §4: _"PIX is
  universal — over 150 million users. Don't explain what PIX is"_. In Split's case Pix is the
  **settlement leg and never the product** (stylebook §9.3): the ledger is what we sell, and we never
  compete on settlement in BR.
- **Tone** — carried verbatim, mono `localization.pt-br.md` §1: _"Conversational but not slangy.
  Maintain a consistent register throughout each page. Avoid mixing formal constructions ('necessidade
  de') with casual ones ('rapidinho') in the same piece"_.
- **Reading level matters** (stylebook §9.3): short sentences, common words. Only 12% of Brazilians
  aged 16–64 have reading proficiency. This is the locale where stylebook §3.2 ("one clause per
  sentence, and stop early") is not a style preference.
- **For a page about somewhere else** (a trip to Argentina, a flat in Lisbon): frame as a Brazilian
  going abroad. Carried from mono `localization.pt-br.md` §1: _"For pages about other countries (e.g.,
  Argentina): frame as a Brazilian going abroad"_.

---

## 2. Language rules

### Pronoun form — **você**, locked

Carried verbatim from mono `localization.pt-br.md` §2:

> - Use **você** (formal-ish second person): "você pode", "você tem", "você envia"
> - Use **vocês** for plural: "vocês podem", "vocês têm"
> - **Never** use "tu" conjugations (unless matching very specific regional dialects — default to "você")
> - Imperatives are the same as third-person present: "envie", "pague", "verifique"

### Verb conjugation — the verbs Split actually uses

| Infinitive          | você present | você imperative | vocês present |
| ------------------- | ------------ | --------------- | ------------- |
| dividir             | divide       | divida          | dividem       |
| rachar              | racha        | rache           | racham        |
| pagar               | paga         | pague           | pagam         |
| lançar (an expense) | lança        | lance           | lançam        |
| abrir (the link)    | abre         | abra            | abrem         |
| compartilhar        | compartilha  | compartilhe     | compartilham  |
| acertar             | acerta       | acerte          | acertam       |
| poder               | pode         | —               | podem         |
| ter                 | tem          | —               | têm           |

### Grammar notes

Carried from mono `localization.pt-br.md` §2:

- Brazilian Portuguese drops subject pronouns freely — _"Pode mandar o link"_ is natural.
- Gerund is standard: _"lançando as despesas"_, never Portugal's _"a lançar"_.
- Contractions: "no", "na", "do", "da", "pelo", "pela".
- **Never European Portuguese vocabulary or syntax** — carried, mono §5: no `telemóvel`, no
  `autocarro`, no `a enviar`.

---

## 3. Vocabulary

Three-column table, mono's shape (`localization.{locale}.md` §3). **Rows 1–8 are carried from mono
verbatim**; the rest are Split terms with no mono equivalent.

| English                     | pt-br                                      | Avoid                                                                |
| --------------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| the app                     | o app / o aplicativo                       | **a plataforma** (banned in every locale, `messaging.md` §14.2)      |
| phone                       | celular                                    | telemóvel (Portugal)                                                 |
| money                       | dinheiro                                   | grana (too slangy for copy)                                          |
| send money                  | enviar dinheiro                            | transferir fundos                                                    |
| instantly                   | instantaneamente / na hora                 | —                                                                    |
| sign up                     | cadastrar-se / criar conta                 | —                                                                    |
| try (in a CTA)              | **experimente**                            | tente                                                                |
| computer                    | computador                                 | —                                                                    |
| a website                   | um site                                    | **o app** — Split is not an app and says so (stylebook §10)          |
| room                        | **a sala**                                 | o grupo, a conta, o evento                                           |
| link                        | **o link**                                 | o enlace, a ligação (both Portugal)                                  |
| the link is the key         | **o link é a chave**                       | seu token, seu acesso                                                |
| expense                     | **a despesa**                              | o gasto (secondary; keep one word per page)                          |
| add an expense              | **lançar uma despesa**                     | inserir, cadastrar uma despesa                                       |
| balance                     | **o saldo**                                | o balanço (an accounting statement)                                  |
| all square                  | **quites** ("ficar quites", "tudo quites") | zerado, empatado                                                     |
| settle up (verb)            | **acertar**                                | **passar a régua** (banned, stylebook §9.3), quitar (formal)         |
| settled                     | acertado / acertadas                       | liquidado                                                            |
| who owes who                | **quem deve a quem**                       | quem deve o quê                                                      |
| free forever                | **grátis para sempre**                     | gratuito, sem custo, versão grátis                                   |
| twelve currencies           | doze moedas                                | multimoeda, qualquer moeda (stylebook §6.7)                          |
| converted at the day's rate | pela taxa do dia                           | taxa ao vivo / em tempo real (stylebook §6.6)                        |
| the split (the operation)   | **o rateio**                               | a divisão (vague), o acerto                                          |
| each person's share         | **a cota**                                 | a parte, a fatia                                                     |
| flatmate                    | colega de apartamento / colega de apê      | companheiro de casa                                                  |
| group chat                  | o grupo (do WhatsApp)                      | o chat                                                               |
| email                       | **e-mail**                                 | email (mono prefers `e-mail` 47:31, and so does the live Split page) |

**`dividir` / `rachar` / `rateio` / `acertar` are strategy, not taste.** Stylebook §9.3 is binding and
is not restated here. In one line: `dividir` owns titles, H1s and slugs; `rachar` is body and
headline warmth; `rateio` + `cota` are the churrasco/festa/viagem register; `acertar` is the verb and
**`acerto de contas` is banned in any title, H1 or slug**; bare `racha` is banned as a standalone
token.

---

## 4. Anti-patterns

Mono's table shape (`localization.pt-br.md` §7), Split's rows. Stylebook §9.3's bans are binding and
sit alongside these.

| Avoid                                            | Use instead                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| transferir fundos                                | enviar dinheiro                                                              |
| a plataforma                                     | o app / o site                                                               |
| passar a régua                                   | acertar as contas                                                            |
| acerto de contas (in a title, H1 or slug)        | rateio, acerto, "quem deve a quem"                                           |
| bare `racha`                                     | rachar a conta                                                               |
| pular o cadastro, furar a fila, burlar           | there is nothing to skip — say what exists (§6)                              |
| sem CPF                                          | not a Split surface; if one ever appears, mono's rule applies unchanged (§6) |
| grana, lacrou, arrasou, and the meme of the week | dinheiro; stylebook §6.9                                                     |
| telemóvel, autocarro, "a enviar"                 | celular, ônibus, "enviando"                                                  |
| necessidade de + noun, mixed with rapidinho      | one register per page (§1)                                                   |

---

## 5. Numbers, currency, dates

- **Numbers** — carried verbatim, mono `localization.pt-br.md` §5: *"use period for thousands
  separator, comma for decimal (e.g., 150.000.000 usuários, R$ 50,00) — Brazilian convention"*. So:
  `1.000.000`, `R$ 50,00`, `12,5 %`.
- **Currency** — carried: `R$` for BRL, `USD` or `dólares` spelled out for dollars. Split adds: a
  worked example needs a currency the whole page shares. Name it once; never mix `R$` and `$` on one
  page without saying which is which.
- **Dates** — mono has no stated rule (conventions doc §6, "no convention found"). Observed and
  adopted: long form, lowercase month, `de` — `fevereiro de 2026`. A stylebook §7.6 check date renders
  idiomatically in prose (`a partir de 2026`), and as an ISO date in the file's check-date comment,
  which is code, not prose.

---

## 6. Trust and framing — the positive-framing rule, adapted

Mono's highest-value pt-br rule, verbatim (`localization.pt-br.md` §6, from a paid native-speaker
audit — `HUMAN-AUDITS.md:100`):

> Brazil has high internet fraud rates. Copy that sounds non-native or suggests circumventing local
> requirements triggers immediate distrust — and tab closes.
>
> - **Always frame access positively.** "Use Pix com seu passaporte" > "Use Pix sem CPF."
> - **Avoid circumvention language.** Never say "acesse sem documentos," "elimina essa barreira," or
>   "sem CPF necessário."

**The principle carries. The specific ban does not, and the difference is the whole rule.** Mono bans
`sem CPF` in every heading because CPF is a **government requirement** and describing a way round one
reads as illegal. Split has no such surface: **there is no cadastro to bypass.** A room is a link,
nobody registers anything, and no rule is being got round. The distrust mechanism mono guards against
does not fire here — so banning `sem cadastro` in headings would cost the head term and buy nothing.

### 6.1 The `sem cadastro` rule (decision — the nuance, written out)

The backlog's PT head term was `dividir conta sem cadastro`. Under decision 2 the slug is English
(`/pt-br/split-bill-no-signup`), so the term has to be earned in the copy. The rule:

1. **The query is the query.** `sem cadastro` appears in `title`, in `description`, in the FAQ
   question as a person types it, and in body prose. Never suppress it. A page that answers
   _"dá para dividir a conta sem cadastro?"_ and refuses to say the words is dishonest about what it
   answers and invisible for the query it was written for.
2. **The H1 leads with what the reader gets, never with the absence.** Mechanical test: the **first
   token** of the H1 is not `Sem`. → Legal: _"Divida a conta sem cadastro"_ (leads with the action),
   _"Só um link, e todo mundo lança o que pagou"_ (leads with what exists). → Not legal:
   _"Sem cadastro para dividir a conta"_.
3. **Same test for every `##` and `###`, and for `description:`.** The absence may appear in them, but
   never as the opening words.
4. **Circumvention verbs are banned in every surface, headings and body alike:** `pular o cadastro`,
   `furar a fila`, `burlar`, `driblar`, `sem precisar se identificar`, `sem documentos`, `elimina essa
barreira`. Mono's list, applied. There is nothing to skip, so nothing describes skipping it.
5. **`sem CPF` stays banned outright** — it is mono's rule and Split has no CPF surface to justify an
   exception. If one is ever built, mono's §6 applies unchanged.
6. **Honesty clamp.** `sem cadastro` describes the absence of a form. It never implies privacy,
   anonymity or that nothing is recorded — stylebook §6.12: accountless is a **friction** story, and a
   bearer link is a privacy claim we would have to defend. Nor does it imply permanence: the link is
   the key, and a group that loses it loses the room (stylebook §7.3).

**This is already what the EN page does**, which is the check that the rule is honest rather than
convenient. `capture/split-bill-no-signup/en.md`: H1 _"Split a bill when nobody wants to sign up"_
leads with the action and frames the absence as the **group's reluctance**, not as a bypass; the
opening line is _"'Another app? Another signup?' they say. There is neither."_ — the absence answers a
question the reader asked, which is mono's reframe pattern in English.

### 6.2 Where mono's reframe pattern is worth copying literally

Mono's compliant example (`content/countries/brazil/pt-br.md:56`) puts the negative once in body text
and reframes in the same breath. The Split shape:

> **Só um link.** Normalmente é aqui que alguém trava, porque o app pede cadastro e metade do grupo
> desiste. No Split, quem abre o link digita um nome e começa a lançar despesas.

Negative once, positive around it, nothing described as a way round anything.

---

## 7. Cast, example names and competitor quotes

**Decision 4 — cast and example names are locale-invariant. Never translated, never swapped for local
names.** Mono's cleanest precedent, from conventions doc §4: names put in the **data layer** are
inherited unchanged by every locale (`content/_system/data/blog-posts/rewards-v2-savings-calculator.md`
names _María_/_Diego_ once and all five locales keep them), and a real person's name is never
translated (`content/stories/cat/{en,es-419,pt-br}.md` are byte-identical on `*Cat, Buenos Aires*`).
Mono's prose layer is incoherent by contrast — `Alice`/`Bob` kept, `Alice convida Bruno`
half-translated, `Ana`/`Carlos` invented, all in the same corpus. Split takes the data-layer
precedent and drops the prose-layer mess.

For Split that means:

- The 16 doodle personas keep their `avatars.ts` labels in every locale. **This RESOLVES stylebook
  §5.10**, which was provisional and forbade persona labels on localised pages. They are now allowed,
  unchanged and untranslated, under the same §5.4 density caps and §5.5 absence families as EN.
- The friend group is **Bea, Jules, Mo, Ana** in every locale (stylebook §5.7). Not Beatriz, not Mo
  becoming Murilo.
- **Room names are the one exception, and they are not free translation.** The four shipped rooms have
  shipped localised names in `apps/web/src/i18n/messages/pt-BR.json`: **Fim de semana em Lisboa**,
  **Apê 4B**, **Lámen de terça**, **Retiro remoto**. Use those strings exactly. Never invent a fifth
  room or a new translation of one of these (stylebook §5.7).
- Nationality adjectives and role labels translate; names do not. Carried from mono
  (`stories/cat/pt-br.md`: `Cat é irlandesa`).

**Decision 5 — a byte-locked competitor quote never translates.** A verbatim quote inside
`<Quote source=…>` stays in the language of the page it was taken from, in every locale. The
surrounding in-locale prose carries the characterisation and, where the reader needs it, a short gloss
in our own words — never a translation presented as the quote. Translating a quote breaks the
byte-lock the whole claims discipline rests on (stylebook §7.1): the quote is the evidence.

This is already the shipped convention, stated in the live PT page's own header comment
(`alternatives/tricount-alternative/pt-BR.md`):

> _"As citações ficam em inglês de propósito: elas são a prova."_

Keep that sentence in the header comment of every PT page that quotes a competitor.

---

## 8. Pinned strings

**Decision 6b — one string per locale per recurring CTA, pinned here.** Mono never did this and paid
for it: three different renderings of one CTA shipped live (conventions doc §8, trap 3).

### CTAs — the pins are the live shipped strings, so nothing on prod has to move

| #   | Surface                                                                             | EN (shipped)                                             | pt-br (pinned)                                           |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| C1  | `<Hero cta>` and `<CTA text>` — the button, on every page                           | `Start a split`                                          | **`Criar um split`**                                     |
| C2  | `<Hero ctaHint>`, and `<CTA body>` where the body is the hint (10 + 3 shipped uses) | `Takes ten seconds. No email, no password, no download.` | **`Dez segundos. Sem e-mail, sem senha, sem download.`** |

C1 keeps `split` as the untranslated brand noun (§9), which is why it beats the stylebook's old
`Começar uma divisão` — that string was written in the stylebook and never used on a page.
**§9 of the stylebook is updated to match.**

### Recurring cross-link labels — new pins, no live string exists yet

Not CTAs, but the same one-string-per-locale rule, because they repeat across pages:

| #   | EN (shipped)                               | pt-br (pinned)                             |
| --- | ------------------------------------------ | ------------------------------------------ |
| L1  | `How Split compares to Splitwise` (4 uses) | **`Como o Split se compara ao Splitwise`** |
| L2  | `How Split compares to Tricount` (2 uses)  | **`Como o Split se compara ao Tricount`**  |
| L3  | `The calculators` (2 uses)                 | **`As calculadoras`**                      |

Everything else — `<CTA title>`, `<CTA body>` when it is page-specific, `<Steps>` titles, section
headings — is **page-scoped and must not be pinned**. Stylebook §6.17 makes concrete artefacts
page-scoped; a shared `<CTA title>` is exactly the boilerplate that rule kills.

---

## 9. Do not translate

Carried verbatim from mono (`localization.pt-br.md` §5, repeated in `generate-content.md` §7):

> Keep entity slugs, URL paths, and schema field names in English

Split's full list:

1. **Slugs and URL paths.** `/pt-br/split-bill-no-signup`, never `/pt/dividir-conta-sem-cadastro`.
   The PT query is targeted through `title`, `H1` and body (§6.1).
2. **Frontmatter keys and machine values:** `type`, `intent`, `claims`, `competitorClaims`, `cast`,
   `date`, `canonical`. Claim IDs and cast keys are identifiers, not words. **`tags` is the
   exception — facet labels are reader-facing and do translate** (`tags: [alternativas, moedas]` is
   live and correct).
3. **Brand names:** Split · Peanut · Peanut Split · Split by Peanut · Splitwise · **Settle Up** ·
   Tricount · Splid · Spliit · Kittysplit · bunq · WhatsApp · Pix · Visa · Apple Pay · Google Pay.
   (`Visa`/`Apple Pay`/`Google Pay` is mono's own card guardrail, carried.)
4. **Cast persona labels and the friend-group names** — decision 4, §7.
5. **Byte-locked competitor quotes** — decision 5, §7.
6. **`split` as Split's own noun** (`criar um split`) — the brand word, lowercase in running prose,
   capitalised when it is the product (stylebook §10.1).

### The `Settle Up` disambiguation — required, PT-specific

`Settle Up` is a competitor **and** `settle up` is the verb this whole product is about. In PT the two
diverge cleanly, so keep them apart:

- The **verb** is always **`acertar`** (§3). Never `settle up`, never `fazer o settle up`.
- The **brand** is always **`Settle Up`** — English, two words, title case, untranslated. Never
  `Acertar` where the app is meant.
- **On any page whose slug contains `settle-up`:** a lowercase `settle up` in a `pt-br.md` file is a
  hard fail — it is either the untranslated verb (use `acertar`) or a mis-cased brand (use `Settle
Up`). Mechanical, see §11.
- The noun trap is worse in PT than in ES: **`acerto de contas` is already banned** in any title, H1 or
  slug (stylebook §9.3 — the popular sense is revenge, and BR autocomplete returns _fortnite / filme /
  chicago pd_). On a Settle Up page that ban and this one bite together: the page is about `Settle Up`,
  the action is `acertar`, and neither is `acerto de contas`.

---

## 10. Transcreation, not translation

**The page is re-authored for this reader against a shared skeleton.** Carried from mono, which states
this as per-locale Audience & Perspective sections rather than as a translation policy (conventions
doc §5), and demonstrates it: `content/countries/brazil/en.md` and its `pt-br.md` share their H2
skeleton and have **completely different H3s** — the EN page is foreigner-in-Brazil, the pt-br page
inverts to Brazilian-abroad and demotes the foreigner segment to last. Word counts differ by a third
(en 2,491 · pt-br 1,758). The generation rule behind it, verbatim (`generate-content.md` §6):
_"**Compose original prose.** Templates are briefs, not fill-in-the-blanks."_

For Split:

- **Keep:** the query the page targets, the H2 skeleton, every claim and its ID, the concession
  (stylebook §4), the structure required by `type` (stylebook §11.3), the numbers.
- **Re-author:** the opening scene, the examples, the objection the page pre-empts, the order of the
  segments, the FAQ phrasing. A churrasco is not a dinner party, and the _rateio_ register is not the
  travel register.
- **Do not re-import a duplication EN removed.** The cluster idea-ownership map from the 31 Jul hero
  pass ships with every transcreation brief (`project.md`, post-hero-pass follow-ups). Stylebook §6.17
  is page-scoped and locale-scoped: one idea, one appearance, per locale.
- **Anti-AI rules apply in this locale unchanged** — stylebook §6.16 and the §11.1 never-strings,
  including the Portuguese ones (`sejamos honestos`, `vamos ser honestos`). Carried: mono applies
  `messaging.md` §15 to every locale. The Portuguese conclusion tells (`no fim das contas`, `resumindo`)
  are ordinary connectives that no regex can separate from the tell — judgement, caught by the cold
  read (stylebook §11.4).
- **WhatsApp is the share surface, not email** (stylebook §9.3, 64.8% of BR home screens). The scene
  where the link gets pasted is a WhatsApp group.
- **Emotional claims sourced from PT-BR need first-party verification before they ship** (stylebook
  §9.4). Unchanged by this file.

---

## 11. The diacritic gate (spec — not built)

**Decision 6c.** Mono's live corpus has files that lost their accents in generation:
`content/pay-with/pix/es-419.md` has **5 accented characters in the whole file**,
`content/countries/brazil/es-419.md` has 20, against 187 in a healthy one (conventions doc §8, trap 1).
Mono has no rule; Split adds one. Spec only — implement in `apps/web/scripts/marketing-copy-audit.mjs`,
wired into `pnpm test`, when batch 2 lands.

**Scope:** files matching `src/content/**/pt-br.md`. Run over `ownProse()` — the existing helper that
strips `<Quote>` blocks — so an English byte-locked quote (§7) never trips the gate or drags the
density down.

**Class A — hard fail. Whole-word, case-insensitive. Every entry is a string that is never a correct
Portuguese word**, so the gate cannot fail correct copy:

```
voce/voces → você/vocês      nao → não            sao → são
entao → então                tambem → também      alem → além
apos → após                  atraves → através    porem → porém
ja → já                      so → só              tres → três
mes/meses-shaped: mes → mês  numero → número      moedas fine
divisao → divisão            transacao → transação  informacao → informação
cartao → cartão              ninguem → ninguém    alguem → alguém
comecar/comeca → começar/começa                   servico → serviço
proximo → próximo            ultimo → último      unico → único
facil → fácil                dificil → difícil    possivel → possível
rapido → rápido              automatico → automático
aplicativo fine              codigo → código      duvida → dúvida
saldo fine                   ate → até            la → lá
```

**Class B — heading-position fail.** Portuguese `Como` carries no accent, so ES's interrogative list
does not transfer. PT's equivalent trap is the first token of a `#`/`##`/`###`, a `title:`, a
`description:` or a `question=` attribute being `Voce`, `Nao`, `Quanto` (fine) — in practice Class A
already covers it. Keep the class as the place to add a row when the cold read finds one.

**Class C — density advisory, not a fail.** Count accented characters (`áàâãéêíóôõúüç` plus their
capitals) in `ownProse()`. Flag any `pt-br.md` under **12 per 1,000 characters** for a human look. The
threshold is higher than Spanish's because Portuguese is more heavily accented. This is the check that
catches the mono failure mode generically, without a wordlist.

**Class D — the cedilla and tilde checks.** `preco` for `preço`, `comecar` for `começar`, `nao` for
`não`, `sao` for `são`, `opcao` for `opção`. Hard fail; none is a Portuguese word. Folded into Class A
above and named separately because it is the most common machine-translation loss.

The gate is mechanical and dumb by design. It does not check that an accent is _right_, only that a
known-wrong spelling is absent. Accent correctness stays with the cold read (stylebook §11.4).

---

## 12. Not-yet and coming-soon

Split ships nothing country-gated, so mono's country coming-soon block (`localization.pt-br.md` §8)
does not transfer. What does transfer is its shape, for the one Split case that needs it — a feature
behind a flag (`NEXT_PUBLIC_SPLIT_V2_ENABLED`, the CSV importer):

- Future tense, `Em breve:` prefix before the action verb. Never present tense for something that is
  not live.
- Never write step-by-step instructions for a feature that is not live.
- State the absence plainly once: _"Ainda não dá para importar do Splitwise."_
- Stylebook §7.3 governs which claim strings are legal; nothing here loosens them.

---

## 13. Deliberately not carried from mono

Named so nobody re-derives them later:

| Mono rule                                                             | Why not                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fallback chain `pt-br → en`                                           | Split has no English fallback at all (stylebook §9). An untranslated page 404s.                                                                                                                                |
| The `sem CPF` heading ban, as a ban                                   | The **principle** is carried in full (§6). The specific ban has no Split surface — no CPF, no government requirement, nothing being circumvented. If a CPF surface is ever built, mono's §6 applies unchanged. |
| The Pix/Banco Central trust-signal rule                               | Split never touches the money layer (stylebook §6.13), so there is no regulator to cite as legitimacy. Pix is named as the settlement leg only.                                                                |
| The `argentina.pt-br.md` entity-override layer                        | Documented in mono, **zero such files exist** (conventions doc §8, trap 2). Split adopts the context-file layer only.                                                                                          |
| `generated_from:` provenance blocks                                   | Mono generates pages from data entities. Split's pages are hand-written and reviewed per batch; the check-date comment (stylebook §7.1) is the provenance that matters here.                                   |
| `alternates:` frontmatter listing sibling files                       | Split's engine derives hreflang from files on disk (`localesForSlug`), which cannot drift. Mono's field is a lint, backfilled on 174 of ~746 files.                                                            |
| `consent:` gate on user interviews                                    | Split quotes no users. Stylebook §6.14 bans social proof outright.                                                                                                                                             |
| Translation-provenance note (`note: translated from …`)               | Present on 4 mono help pages out of ~746. Not a convention; not adopted.                                                                                                                                       |
| "Crypto"/"digital dollars" vocabulary bans, `recompensas` for Rewards | Split's content never touches the money or rewards layer. Nothing to rename.                                                                                                                                   |
| Card copy guardrails, waitlist and closed-beta strings                | Peanut Card is not a Split surface.                                                                                                                                                                            |
