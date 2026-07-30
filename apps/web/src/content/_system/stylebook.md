# Peanut Split — content stylebook

**A rulebook, not an essay.** Read it end to end before drafting, translating or editing any Split
page. Where a rule fights your instinct, the rule wins; where it fights a Konrad ruling in
[`project.md`](project.md), `project.md` wins. Rule IDs are stable — cite them in checklists and
reviews. Why each rule exists: [`idea-maze.md`](idea-maze.md). Evidence:
[`research/audiences.md`](research/audiences.md), [`research/brand-cast.md`](research/brand-cast.md).
Pages: [`../seo-backlog.md`](../seo-backlog.md). **Only legal FAQ source:**
[`../intent-queries-2026-07-30.md`](../intent-queries-2026-07-30.md).

---

## §1 North star

**§1.1 Aim at the awkwardness of asking, not at the arithmetic.** Nobody struggles to divide by
three; 46% of UK adults owed money are too embarrassed to ask, and the average wait is over two
months. The promise is _you never have to send that message_, not _accurate splits_.
→ Right: "Nobody has to send the message that starts with 'sorry to be annoying'."
→ Wrong: "Split calculates each person's share precisely."

**§1.2 Write to the role, not the group.** One person paid or organised; that person is the search
query. Second person singular, always. Never "you guys" / "vosotros" / "a galera de vocês".

**§1.3 Be the neutral arbiter.** Readers ask out loud for an "unbiased tool" whose number nobody can
argue with. Our authority is that we state the figure and show the derivation.

**§1.4 Never name a culprit.** Show balances, never blame. Never suggest posting a balance in the
group chat so someone sees it.

**§1.5 Plain is the win condition; plain is not cold.** Warmth comes from concrete detail — the taxi,
the villa deposit, the churrasqueiro at the fire for four hours — never from adjectives.

**§1.6 Concede on every page.** Structural requirement, not a disclaimer. See §4.

---

## §2 Two registers

Frontmatter `type:` picks the register. No third register, no blending inside one page.

| `type`       | Register             | Where                                                         |
| ------------ | -------------------- | ------------------------------------------------------------- |
| `capture`    | Default              | The 15 intent-capture pages                                   |
| `comparison` | Default              | `{competitor}-alternative`, `x-vs-y`, `splitwise-daily-limit` |
| `guide`      | Default, travel-warm | `/blog/*`                                                     |
| `editorial`  | Editorial            | The 5 fairness essays                                         |

**§2.1 Default.** Short declaratives that end early. One clause where one clause works. The answer
arrives in the first two sentences — no throat-clearing, no scene-setting. Sentence-case headings.
Live models: "Splitwise works." "The link is the room." "An empty room is not settled, it is empty."
→ Right: "The free limit is four expenses a day." → Wrong: "If you've ever hit a wall while adding
expenses, you're not alone."

**§2.2 Editorial.** Essayistic and sophisticated: long sentences allowed when they carry one thought,
an argument may develop across paragraphs. Not literary — no metaphor stacking, no rhetorical
questions, no first-person-plural philosophising. Opens on the reader's problem, never on the
product. Live model: _"Splitting expenses ends badly even when it ends correctly."_ Additionally:
name the tradeoff of every method presented, decline to have an opinion about the reader's
relationship or household, mention Split at most twice.

**§2.3 The caps register is off-limits to content.** `PASS IT`, `ZERO GROUP MATH.` are landing and
room-surface copy. Content never uses display caps, caps micro-labels, or a landing headline as H1/H2.
**§2.4 No drift mid-page** — a capture page does not become an essay in section 4.

---

## §3 Voice

Konrad's direction — _super friendly, easy, honest, a bit quirky, fun and social, never cringe
tryhard_ — as six rules.

| #    | Rule                                                                                                                    | Right                                                                                                        | Wrong                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| §3.1 | Friendly = concrete and unhurried, not chatty                                                                           | "Somebody adds the taxi on the way home and it is on everyone else's screen before they are out of the car." | "Hey! Ready to make splitting bills fun again?"                                 |
| §3.2 | Easy = the reader can stop at any paragraph and still have the answer. Front-load. Mid-trip pages are short by rule     | "The free limit is four expenses a day. Split has no cap."                                                   | A 200-word preamble before the number                                           |
| §3.3 | Honest = named limits in our own words, before anyone asks                                                              | see §4                                                                                                       | "No product is perfect, but…"                                                   |
| §3.4 | Quirky lives in the cast names and in dry understatement, never in the prose voice                                      | "Enjoy the rare feeling." / "Nobody kept score. That was our job."                                           | "Splitting bills has never been this delightful"                                |
| §3.5 | One joke per page, and it must name the job. Body copy only — never in a title, H1, meta, CTA, table cell or FAQ answer | "You stop being the group's accounts-receivable department."                                                 | "Money drama? Not on our watch. 💸" / any mockery of the person who hasn't paid |
| §3.6 | No setups, no reveals, no transitions                                                                                   | "Split has no cap and no counter."                                                                           | "And that is where Split comes in."                                             |

Ceiling for humour, recorded verbatim to calibrate against: _"the best man has no chasing up of funds
like a mediocre mafiosa boss."_ Funny **and** it describes the task. Decorative jokes fail that test.

---

## §4 The concession pattern

**§4.1 Exactly one concession section per page, specific enough to act on.** Approved titles:

| Locale | Comparison pages                         | Other types                                     |
| ------ | ---------------------------------------- | ----------------------------------------------- |
| en     | "When {Competitor} is the better tool"   | "What Split is not good at" · "The honest bit"  |
| es     | "Cuándo {Competidor} es la mejor opción" | "En qué Split no es bueno" · "La parte honesta" |
| pt-BR  | "Quando o {Competidor} é a melhor opção" | "No que o Split não é bom" · "A parte honesta"  |

**§4.2 Concession pool** — draw from these; anything new must trace to product truth (§7.3): no
account means no login, no password recovery and no history that follows you to a new phone, and the
link is the key, so if the group loses it the room is gone · Split does not check with a bank and
cannot, because settling up is a tap that records what two people already did · twelve currencies,
not every currency · up to twenty people · recording a settle-up needs a connection, on purpose ·
Split is smaller and does less than {Competitor}, deliberately.

**§4.3 Concede before the CTA, never after** — the concession earns the CTA; reversing reads as a
retraction. **§4.4 Never concede something false to sound humble.**

---

## §5 Cast usage

The content cast is the **16 doodle personas** (`apps/web/src/lib/avatars.ts`) plus the **11
`LANDING_CAST` roles** (`components/marketing/LandingPersona.tsx`). Nothing else. Cypher-welcome
scenes are banned (third-party IP, no licence trail). The Peanut mascot `.webp` set is a different
visual family — never on the same page as a doodle.

- **§5.1 Characters never speak.** No dialogue, no attributed quotes, no character narrating. (Bea's
  "who paid for dinner?" on the landing page is a _person_ in a chat mock, not the Party Bee talking.
  Do not extend it.)
- **§5.2 No character asserts a product claim.** A drawing next to a number reads as its source.
- **§5.3 No third-person cast narration about the reader.** Second person, always.
- **§5.4 Density:** `capture` 1 (inside `<Steps>` only) · `comparison` 1 (never in the table, never in
  the concession) · `guide` 2 (one per major section) · `editorial` 0 by default. Never in an H1,
  never in a claims or comparison table, never two in one section.
- **§5.5 Three families where the cast is ABSENT — no exceptions.** (1) **Couples splitting by
  income** — by-income calculator surface, ability-to-pay essay, `dividir gastos en pareja según
ingresos`: a doodle on a page about one partner being in fuel poverty is the documented cutesy
  failure. (2) **Rent and utilities fairness** — rent split by room size, uneven utilities,
  `/es/dividir-alquiler-habitaciones-diferentes`: this segment wants an arbiter and least wants
  personality, and the page gets quoted at a flatmate. (3) **Splitwise migration pages** —
  `/splitwise-alternative`, `/splitwise-daily-limit`, `/es/alternativa-splitwise`,
  `/pt/alternativa-splitwise`: the reader just lost trust in a product, so charm reads as sales.
- **§5.6 Editorial exception:** of the five fairness clusters, only _ambiguous social contract_
  (stag / hen / despedida) may carry one character, and not in the opening or closing 200 words.
- **§5.7 Travel content reuses the shipped rooms, not inventions:** **Lisbon weekend** (4 friends,
  EUR, 8 expenses), **Flat 4B** (3 flatmates, GBP), **Tuesday ramen** (6 friends, USD, one card),
  **Remote retreat** (6 people, 3 currencies). Friend group: **Bea, Jules, Mo, Ana** and _you_. No
  fifth room or sixth friend without a coordinator decision.
- **§5.8 Reserved:** `konrad` (astronaut-avocado) and `hugo` (disco-octopus) are real people —
  founder contexts only. `you` (pocket-robot) is a UI device, never editorial prose.
- **§5.9 The room-emblem device is free and locale-proof:** "name the room 'Ski trip' and it is
  already a pair of skis" is a true product detail. Prefer it over a persona when the page needs one
  visual beat and the moment is not light.
- **§5.10 PROVISIONAL — ES and PT-BR pages print no character name.** The 16 labels are English
  string literals in `avatars.ts`, absent from the i18n catalogs, and no translation ruling exists.
  Until one does, localised pages may use cast _art_, the room-emblem device and the shipped
  localised room names, but not "Vampire Penguin" or any persona label.

---

## §6 Hard bans

| #     | Ban                                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §6.1  | **No celebration register.** No confetti copy, no "woohoo", no "you did it". **Zero exclamation marks in content pages, all locales.**                                                                                                                   | HN: _"I want something that doesn't treat me like a child clapping at Saturday morning cartoons"_; Split's live editorial has none                                      |
| §6.2  | **Zero emoji** in titles, meta descriptions, H1–H3, table cells, CTAs, FAQ questions. 😂 banned everywhere                                                                                                                                               | HN on Chime: _"tons of emojis… completely childish"_; fine for pizza, not for money. 😂 dates the page                                                                  |
| §6.3  | **No gamification.** No streaks, levels, points, badges, achievements, progress bars, "reward", "unlock"                                                                                                                                                 | HN: _"Gamification of stuff you're forced to do is patronizing"_                                                                                                        |
| §6.4  | **No marketing adjectives:** seamless, effortless, robust, powerful, world-class, cutting-edge, game-changing, revolutionary, empower, unlock, elevate, supercharge, truly, incredibly. Split also bans **just** and **simply**                          | mono STE rules + Split's live copy                                                                                                                                      |
| §6.5  | **No competitor prices, any locale, including inside a quotation.** Keep the _fact_ of a paid tier without a number                                                                                                                                      | Splitwise publishes none; ES review says "4€ al mes", a rival blog "3-4 euros" — both second-hand. Splid "$3.99" and Kittysplit "€3" violate the pages' own no-rot rule |
| §6.6  | **No live/real-time FX claims.** Ceiling: "converted at the day's rate"                                                                                                                                                                                  | `fx.ts` is live → cache → static fallback; the rate freezes onto each expense at creation                                                                               |
| §6.7  | **No unbounded or superlative claims:** unlimited, any currency, multi-currency, all currencies, 150+, unguessable, fewest/minimum transfers, optimal, any size group                                                                                    | twelve currencies; twenty people; greedy netting                                                                                                                        |
| §6.8  | **No permanence promises.** Never "never lose your data", "safe forever", "a permanent record". The optional email is _access from any device_, never a backup guarantee                                                                                 | device loss is the documented churn driver for accountless apps                                                                                                         |
| §6.9  | **No slang with a shelf life, any locale.** No gen-alpha lexicon                                                                                                                                                                                         | _"vergonha alheia amanhã"_; the failure has a BR name, _tiozão_. Burned already: _lacrou_, _arrasou_                                                                    |
| §6.10 | **No "split bills, not friendships"**                                                                                                                                                                                                                    | taken twice — Splid's hero and PartyTab's                                                                                                                               |
| §6.11 | **No triumphalism, no editorialising about a competitor.** "Greedy" is their word, not ours — let quotes carry the anger, keep our sentences flat                                                                                                        | this audience _liked_ Splitwise; mocking it mocks their taste                                                                                                           |
| §6.12 | **No privacy or anti-surveillance framing.** Accountless is a _friction_ story                                                                                                                                                                           | a bearer link is a weak privacy claim we would have to defend                                                                                                           |
| §6.13 | **No settlement claim beyond recording.** We never move money, never verify a payment, never imply the Peanut path is safer than cash. Rails named per locale or not at all — Bizum only Spain-scoped, Pix only BR, never "Venmo me" on a shared EN page | frozen money surface; `copy.ts` docstring                                                                                                                               |
| §6.14 | **No social proof we do not have.** No star ratings, user counts or testimonials                                                                                                                                                                         | _"Split has no users yet, so there is nobody to quote but us."_                                                                                                         |
| §6.15 | **No invented FAQ.** Every question comes from `intent-queries-2026-07-30.md` or a real support intent                                                                                                                                                   | invented FAQs are where fabricated claims enter                                                                                                                         |

### §6.16 Anti-AI-tell table

| Pattern                                                  | Kill                                                                 | Fix                              |
| -------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------- |
| "Not just X, it's Y" / "It's not about X, it's about Y"  | "The cap isn't just annoying, it's expensive."                       | Pick one claim, state it         |
| "Whether you're X or Y"                                  | "Whether you're on a trip or splitting rent…"                        | Address this page's one audience |
| "Imagine" / "Picture this"                               | "Imagine arriving in Lisbon…"                                        | Start with the fact              |
| Setup → reveal                                           | "And that's where Split comes in."                                   | Introduce it plainly             |
| Section transition                                       | "Now that we've covered the cap, let's look at…"                     | Delete the sentence              |
| Meta-commentary on the page                              | "This page is not going to argue." / "The useful thing here is not…" | Delete. Do the thing             |
| Stacked hedges                                           | "It may in some cases arguably be worth…"                            | One hedge, or none               |
| Tricolon abuse                                           | three three-part lists on one page                                   | Once per page maximum            |
| Restated proof point                                     | the four-a-day cap in hero, table and FAQ                            | State a number once, prominently |
| Em-dash spray                                            | —                                                                    | Maximum 3 per page               |
| "In today's world" / "look no further" / "let's dive in" | —                                                                    | Delete                           |

---

## §7 Claims discipline

**§7.1 Competitor facts are verbatim quotes, never characterisations.** Each one must be (a) from a
page the drafter actually opened, (b) wrapped in `<Quote source="domain.com">`, (c) covered by a
check-date comment at the top of the file. Tables that quote a competitor carry a footnote naming the
source and the month.

```mdx
{/_ Every claim about Tricount on this page is a verbatim quote from tricount.com/en, checked
against the page source on 2026-07-28. Don't add a claim you have not opened the page for,
and don't add one that needs updating when they change a price. _/}
```

**§7.2 First-party beats rankings blogs, and beating them is the wedge.** Splitwise's free cap is
**four expenses a day** (their own help centre). Ranking blogs say three. Correcting the internet on
the reader's behalf is the trust-builder for the migration audience.

**§7.3 Product truths — use these strings, do not paraphrase upward.**

| Truth         | Safe                                                                                                                                                                                                       | Unsafe                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Currencies    | "twelve currencies, converted at the day's rate"; "indicative, not your bank's rate"                                                                                                                       | multi-currency, any currency, 150+, live rate, real-time                       |
| Group size    | "up to twenty people"                                                                                                                                                                                      | unlimited, any size group                                                      |
| Netting       | "two or three transfers instead of twenty"; "a short payment plan"                                                                                                                                         | fewest/minimum transfers, optimal                                              |
| Offline       | "expenses typed with no signal wait on your phone and go when it comes back"; "recording a settle-up waits for a connection on purpose — a payment written down twice is worse than one written down late" | "works offline" as a category claim; anything implying settle-up works offline |
| Price         | "free forever, with nothing to upgrade to"                                                                                                                                                                 | "free" alone, "free tier", "no cost today"                                     |
| Why free      | "Peanut makes it to introduce people to Peanut, which is how Split gets paid for"                                                                                                                          | any promise of a repo, open source or a licence                                |
| Settling      | "two people settle however they settle, and one of them taps to record it"; "Split does not check with a bank and cannot"                                                                                  | "we settle it for you", "verified payments", "instant settlement"              |
| Account       | "the link is the key — if the group loses it, the room is gone"                                                                                                                                            | "your data is safe", "secure account"                                          |
| Splitwise cap | "the free limit is four expenses a day"                                                                                                                                                                    | "three a day"; any Pro price                                                   |

**§7.4 The trust answer goes on the page, in plain words, at the top of the concession section.**
Wherever the Splitwise-migration audience lands, state the never-monetise commitment and why it is
credible (§7.3, _why free_). Two open-source competitors published that promise because the audience
asks out loud. Do not bury it in a footer; do not answer with an open-source promise we cannot keep.

**§7.5 Every product number cites a `claims:` ID; every competitor fact a `competitorClaims:` ID.** A
claim with no ID does not ship. **§7.6 Check dates are visible** — tables say the month, file
comments say the date.

---

## §8 Fairness pages and tools

- **§8.1 Pre-empt the communal-space rebuttal, in the reader's own words.** Verbatim from the corpus:
  _"So is everyone going to also split how many times they use the loo / put the lights on / spend
  time in the kitchen?"_ A usage-weighted tool that ignores this reads as absurd to the exact reader
  it is for. Pattern: name the objection, agree with its limit, give the boundary you do recommend.
  → Right: "There is a point where this stops being worth it. A bigger bedroom is a one-off decision;
  the loo roll is a running argument. Most households land on splitting what one person clearly
  consumes and leaving the shared stuff shared." → Wrong: "Our calculator makes sure everyone pays
  exactly their fair share of every cost."
- **§8.2 Name the cost of the method** — _"do you want all this upheaval and bad feeling for what's
  probably no more than £20 a month each?"_ State when it is not worth running.
- **§8.3 Show the derivation.** Every number comes with its working.
- **§8.4 Present the method, not a verdict.** Never write "punished for earning more" in our own
  voice — it provokes fury when used. Never imply a usage-weighted split is _obviously_ correct.
- **§8.5 Give them a paste-able sentence** for the group chat, as copy, not as advice.

---

## §9 Locale rules

Three locales: `en`, `es`, `pt-BR`. **An untranslated page does not exist** — it 404s, it is out of
the sitemap, hreflang never points at it. No English fallback, ever. Localise the slug, the example
names, the currency and the settlement rail — not just the sentences.

Content CTA label: `en` **Start a split** · `es` **Empezar a dividir** · `pt-BR` **Começar uma
divisão**. EN CTA hint: "Takes ten seconds. No email, no password, no download."

**§9.1 EN — British English, between UK warmth and US calm.** maths (never math), help centre,
organise, licence (noun), recognise. Sit closer to The Knot's calm admin than StagWeb's banter;
British warmth yes, lad-banter no. **No "lads"** — it excludes the larger, hen-side half of the
occasion audience. Neutral money nouns only: no quid, skint, bucks, "Venmo me". Utility-shaped humour
survives; decorative humour does not.

**§9.2 ES — one URL, pan-Hispanic, singular _tú_.**

- Singular _**tú**_ throughout (locked). **Never** vosotros / estáis / habéis / vuestro / vuestra —
  Tricount's own ES App Store copy is _vosotros_, unusable across both hemispheres.
- **Do not lift ES strings from the product UI into content.** Shipped ES product copy is
  Rioplatense _voseo_ ("vos", "poné", "tocá", "sos", "pagás"); content is _tú_.
- **Keyword spine: "dividir gastos" / "compartir gastos"** — every neutral source uses it.
- **Idioms only inside country-scoped blocks:** `bote común` Spain, `vaquita` AR, `coperacha` MX.
  **Never bare `bote`** — it means jail in Mexico, Guatemala and Honduras. Unscoped, name the
  variants together rather than picking one.
- **Avoid (binding):** pasta, plata, guita, lana · `a escote`, `a pachas` · `piso`, `compañero de
piso` (say _departamento_, _roomie_) · chaval, tío, vale, guay · `coger`. **Bizum is Spain-only**,
  never unscoped.
- **Diminutives are not locale-safe:** "un café" is safe, "una cañita" is not (beer in Spain, wine in
  Chile).

**§9.3 PT-BR — the vocabulary map is the strategy.**

- **`dividir` in titles, H1s and slugs; `rachar` in headlines and body.** BR autocomplete sends
  `rachar a conta` to _significado / sinônimo / em inglês_, while `dividir` owns every transactional
  query. `rachar` is dictionary Portuguese (Michaelis sense 5), so it is free warmth at no SEO cost.
- **`rateio` + `cota` are the churrasco / festa / viagem-group register** (`rateio` = the split,
  `cota` = the per-person number). Keep those pages unambiguously social or the accounting sense
  pulls condomínio and corporate traffic that converts at zero.
- **NEVER `acerto de contas` in a title, H1 or slug** — popular sense is revenge; BR autocomplete
  returns _fortnite / filme / chicago pd_. The verb **`acertar`** is fine in body copy.
- **Never bare `racha`** as a standalone noun or token (vulgar slang); "rachar a conta" is fine.
- **Never `passar a régua`** for settling — it means asking the waiter for the bill, and it is
  Rio-marked.
- **`vaquinha` vs `rateio`:** frame as **voluntary/variable vs owed/computed**, keep the pages
  separate, never assert the words are lexically exclusive (Priberam defines _vaquinha_ as money
  collected for a common expense — rateio's territory).
- **Gíria by surface:** `bora`, `rolê`, `galera`, `climão` in blog and body copy; UI, error states,
  form labels and legal stay plain. Never a meme of the week.
- **WhatsApp is the share surface**, not email (64.8% of BR home screens). **Pix is the settlement
  leg; the ledger is the product** — never compete on settlement in BR.
- **Reading level matters:** short sentences, common words. Only 12% of Brazilians aged 16–64 have
  reading proficiency.

**§9.4 Evidence caveat.** ES and PT-BR user-voice evidence is thin (no Reddit, X or unbranded
forums). Any emotional claim sourced from those locales needs first-party verification before it
ships as copy; competitor-page and App Store evidence is fine as-is.

---

## §10 Vocabulary

| Say                                            | Not                                       |
| ---------------------------------------------- | ----------------------------------------- |
| room · link · all square                       | group · invite / invite code · balanced   |
| the link is the key / the link is the room     | your access token                         |
| alter ego, cast, recast                        | avatar, profile                           |
| free forever, with nothing to upgrade to       | free · free tier · freemium               |
| reconciles to the cent                         | 100% accurate                             |
| Start a split                                  | Get started · Try it free · Sign up       |
| a website                                      | the app (Split is not an app and says so) |
| twelve currencies, converted at the day's rate | multi-currency                            |

---

## §11 Mechanically checkable appendix

Every rule that can be a regex must be one. Extend `apps/web/scripts/marketing-copy-audit.mjs`; wire
into `pnpm test`.

### §11.1 Never-strings — fail on any match in `src/content/**` (case-insensitive)

```
seamless | effortless | robust | powerful | world-class | cutting-edge | game-changing
revolutionary | empower | supercharge | truly | incredibly | \bjust\b | \bsimply\b
not just | isn't just | is not just | it's not about | whether you're | whether you are
\bimagine\b | picture this | that's where | that is where | let's dive | in today's world
look no further | now that we've | now that we have covered
real-time | live rate | live exchange rate
\bunlimited\b | any currency | multi-currency | 150\+ | all currencies
fewest transfers | minimum transfers | minimum number of transfers | \boptimal\b
unguessable | any size group | split bills,? not friendships
never lose | safe forever | permanent record | history is safe
streak | level up | achievement | badge | confetti | woohoo
\bgreedy\b | punished for earning more | wanderlust | unforgettable memories
\blads\b | \bquid\b | \bskint\b | venmo me | 😂
```

```
es:     vosotros | estáis | habéis | vuestr[oa] | a escote | a pachas | \bcoger\b
        \bpasta\b | \bplata\b | \bguita\b | \blana\b | \bchaval | \btío\b | \bguay\b
        compañero de piso
        \bbote\b  → legal only as "bote común" inside a Spain-scoped block
pt-BR:  acerto de contas   (title, H1, slug, description — hard fail)
        \bracha\b          (standalone token — hard fail; "rachar" is fine)
        passar a régua | lacrou | arrasou
```

### §11.2 Structural checks

| Check                | Rule                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exclamation marks    | `!` in body and headings = **0**, all locales                                                                                                                                   |
| Emoji                | 0 in `title`, `description`, any `#`/`##`/`###`, any `<FAQItem question>`, any `cta`/`text` prop                                                                                |
| Em-dashes            | `—` ≤ **3** per page                                                                                                                                                            |
| CTA label            | `<CTA text>` and `<Hero cta>` match the §9 locale label exactly                                                                                                                 |
| Competitor price     | on `type: comparison`, no `[$€£]\s?\d` or `R\$\s?\d` outside an allowlisted quote exception                                                                                     |
| Concession           | every page has ≥1 heading from the §4.1 table                                                                                                                                   |
| Cast keys            | every `cast:` entry exists in `avatars.ts` or `LANDING_CAST`                                                                                                                    |
| Cast absence         | `cast:` empty on any slug matching `splitwise-alternative`, `splitwise-daily-limit`, `alternativa-splitwise`, `fair-split`, `rent-split`, `dividir-alquiler`, `pareja`, `casal` |
| Cast density         | `cast:` ≤1 for `capture`/`comparison`, ≤2 for `guide`, 0 for `editorial` except the social-contract essay                                                                       |
| Cast names in locale | no `avatars.ts` persona label appears in an `es.md` or `pt-BR.md` file (§5.10)                                                                                                  |
| Claim IDs            | every `claims:` / `competitorClaims:` ID resolves; `type: comparison` with zero `competitorClaims` fails                                                                        |
| Intent               | `type: capture` requires `intent:`, matching a row in the capture registry                                                                                                      |
| Check-date           | every `type: comparison` file contains `checked against` + an ISO date                                                                                                          |
| Quote wrapper        | every quoted competitor sentence sits inside `<Quote source=…>`                                                                                                                 |
| FAQ source           | every `<FAQItem question>` appears in `intent-queries-2026-07-30.md`                                                                                                            |
| Fairness pre-emption | slug matching `fair-split\|rent-split\|alquiler\|utilities\|habitaciones` contains a communal-space paragraph (grep `loo\|lights\|kitchen\|áreas comunes\|áreas comuns`)        |

### §11.3 Required structure by type

- **`capture`** — 350–600 words · no `<Hero>` · H1 = the query as a person says it · answer inside the
  first two sentences · `<Steps>` ≤3 `<Step>` · one concession paragraph · `<FAQ>` 2–3 · `<CTA>` ·
  `<RelatedPages>` 2–3 · frontmatter `type`, `intent`, `claims`.
- **`comparison`** — H1 names the competitor or the wedge · ≥1 `<Quote source>` · check-date comment ·
  one table with a source footnote naming the month · concession titled per §4.1 · `<CTA>` · `<FAQ>`
  3–4 · `<RelatedPages>` 2–3 · frontmatter `type`, `claims`, `competitorClaims`.
- **`editorial`** — 900–1600 words · no `<Hero>`, no display caps, no table unless it carries the
  argument · opens on the reader's problem · names every method's tradeoff · Split mentioned ≤2× ·
  ends with one link to the matching tool or capture page · `cast: []` · frontmatter `type`, `claims`.
- **`guide`** — travel-warm default register · concrete places and line items · ≤2 cast appearances ·
  one concession paragraph · `<CTA>` · `<RelatedPages>` · frontmatter `type`, `claims`, `cast`.

### §11.4 The audit loop

Every Konrad review and cold-read pass appends dated findings to `_system/AUDITS.md`, and **each
finding must land as a numbered rule in this file** or it recurs. Split has no CI gate and `main` is
prod in five minutes, so this loop plus §11.1–11.3 is the only durable tone control. Fix by removing
the source of a violation, never by adding prose that names the banned thing.
