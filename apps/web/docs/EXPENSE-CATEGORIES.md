# Expense subjects and categories

## Status and integration boundary

The catalog, matcher, art and static review are ready. Expense-card integration remains deferred until the in-flight card work lands. This branch does not change `ExpenseList`, persisted expenses, APIs, database schema or analytics.

The visual direction is locked: **A · Bare hero**. A 44px subject doodle replaces the payer character. The card does not gain a category caption; payer information remains in text.

Canonical sources:

- `src/lib/expense-category-catalog.json` — 13 categories, 340 subjects and 2,000 unique terms
- `src/lib/expense-category.ts` — validation, exact matching and typo recovery
- `design/doodles/expense-subjects.tsv` — the 300-subject expansion and its 1,000 added terms
- `design/doodles/parts/14-expense-subjects.json` — imported clean geometry for 300 new doodles
- `design/doodles/import_lucide_expense_subjects.py` — deterministic vector importer
- `docs/expense-category-picker.html` — locked Bare hero review, classifier and doodle wall

## Why subjects and categories are separate

Forty categories made each drawing meaningful, but made the taxonomy too granular. The revised model has two levels:

- A **subject** answers “what was paid for?” and owns the doodle. Examples: SIM card, ticket, parking meter, sandwich and blood test.
- A **category** is a broad grouping for filtering and reporting. Examples: Tech & connectivity, Transport and Health & wellness.

There are 340 subjects inside 13 categories. The 40 original subjects retain their 1,000 terms. Three hundred new subjects add exactly 1,000 unique terms and 300 new drawings.

## Broad category set

| Stable ID               | Label               | Subjects | Boundary                                                  |
| ----------------------- | ------------------- | -------: | --------------------------------------------------------- |
| `food-drink`            | Food & drink        |       33 | Meals, ingredients, groceries and drinks                  |
| `transport`             | Transport           |       32 | Moving people or goods, including fuel and fares          |
| `travel-stays`          | Travel & stays      |       30 | Accommodation, holidays and destination activities        |
| `home-bills`            | Home & bills        |       27 | Housing, utilities, appliances and household upkeep       |
| `shopping`              | Shopping            |       26 | Retail goods without a stronger purpose                   |
| `entertainment-leisure` | Fun & leisure       |       28 | Tickets, media, events, hobbies and games                 |
| `health-wellness`       | Health & wellness   |       29 | Medical care, pharmacy, fitness and pet care              |
| `family-education`      | Family & education  |       27 | Childcare, school and learning                            |
| `work-services`         | Work & services     |       25 | Professional, trade, delivery and administrative services |
| `tech-connectivity`     | Tech & connectivity |       26 | Devices, connectivity, hosting and phone service          |
| `money-admin`           | Money & admin       |       29 | Cash, fees, transfers, documents and financial products   |
| `gifts-giving`          | Gifts & giving      |       27 | Gifts, donations, community support and causes            |
| `other`                 | Other               |        1 | Unknown or genuinely miscellaneous expenses               |

## Matching behavior

Matching remains local and deterministic:

1. Normalize case, accents, punctuation and whitespace.
2. Prefer a complete exact term.
3. Otherwise match whole phrases or words. More words win, then the longer term, then the first occurrence.
4. Only when no exact boundary match exists, compare equal-length word windows using `fastest-levenshtein`.
5. Permit one edit for 4–5 characters, two for 6–9, three for 10–15 and four above 15, with a maximum 25% edit ratio.
6. Do not typo-match terms shorter than four characters. Reject equally strong matches owned by different subjects.
7. Fall back to Other when no clear match exists.

This recovers `piza`, `restuarant`, `tiket`, `accomodation` and `pharamcy`. Short values such as `sim` must be exact, preventing guesses among many similar three-letter terms.

Specific phrases still beat generic words: `gas bill` is Home & bills while `gas` is Transport. `train ticket` keeps the existing Public transit subject; bare `ticket` uses the new Ticket subject. `sim` now resolves directly to SIM card.

## Doodle expansion

The repository now ships 454 native doodles. Three hundred are new purchase subjects, giving every added subject its own drawing; existing subjects retain their reviewed art.

The new drawings begin with clean 24×24 Lucide outlines from `lucide-static@1.28.0`. The importer scales and centers them in Peanut Split’s 32×32 box, then the existing seeded roughener redraws them in the native doodle hand. The result is deterministic, stroke-only and background-free. Lucide’s ISC/MIT notice is preserved in `design/doodles/LUCIDE-LICENSE.txt`.

Regeneration:

```sh
node design/doodles/build-expense-catalog.mjs
python3 design/doodles/import_lucide_expense_subjects.py --lucide-dir /path/to/lucide-static/icons
python3 design/doodles/build.py --write
```

The import source is not a runtime dependency. Only Peanut Split’s roughened path data ships to the app.

## Locked card treatment

Bare hero remains the closest semantic replacement for the current avatar:

- 44px subject drawing in the existing art position
- no colored background embedded in the SVG
- no category caption competing with the expense description
- no change to payer copy, amount, settlement impact or card interaction

Re-check spacing, loading and tap targets against the landed card component before integration. The category/subject matcher can be wired independently of persistence; a future manual override can store a stable subject ID without changing this inferred default.
