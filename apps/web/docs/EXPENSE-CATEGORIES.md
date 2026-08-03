# Expense category catalog

## Status and integration boundary

The taxonomy, matcher and doodles are ready for review. Expense-card integration is deliberately deferred while the card work in progress lands. This work does not change `ExpenseList`, persisted expenses, APIs, database schema or analytics.

The category is derived from the expense description at display time. The IDs below are stable enough to support a saved user override later, but this first pass does not add one.

Canonical sources:

- `src/lib/expense-category-catalog.json` — 40 categories and 1,000 terms
- `src/lib/expense-category.ts` — validation, normalization and deterministic matching
- `design/doodles/parts/13-expense-categories.json` — seven new source drawings
- `src/components/ui/doodles.ts` — generated doodle paths
- `docs/expense-category-picker.html` — card-treatment and category picker

## Product choices

### Card treatment

The picker keeps three implementation options open until the card branch lands:

1. **A · Bare hero — recommended.** Replace the payer’s 36px character disc with a 44px category doodle. It is the clearest direct swap and adds no secondary label to the row.
2. **B · Named rail.** Use the same doodle with a small category caption. This is the most explicit treatment, but it competes with the expense description.
3. **C · Inline mark.** Put a quieter 26px doodle beside the description. It preserves density, but makes the new semantic cue less prominent.

The recommendation is intentionally a mock decision, not an implementation commitment. Re-check spacing, tap targets and loading behavior against the landed card component before wiring it in.

### Classification behavior

- Normalize case, accents and punctuation, including Spanish and Brazilian Portuguese diacritics.
- Match whole words and phrases, never arbitrary substrings. `gas` does not match `gastronomy`.
- Prefer an exact description, then the phrase with the most words, then the longer term. This makes `gas bill` resolve to Utilities instead of Fuel.
- Use the first occurrence only as a final tie-breaker. The catalog order is the last deterministic tie-breaker.
- Fall back to Other when nothing matches. There is no network call and no probabilistic result.
- Treat descriptions as one primary purpose. Mixed receipts are not split into multiple categories.

Every category has exactly 25 unique terms, for 1,000 normalized terms in total. The list mixes English, Spanish and Brazilian Portuguese. Labels are developer-facing English for now; user-facing labels should go through the existing message catalog when card integration happens.

## Category set

| Group          | Stable ID          | Label                 | Doodle        | Boundary                                                   |
| -------------- | ------------------ | --------------------- | ------------- | ---------------------------------------------------------- |
| Food & drink   | `pizza`            | Pizza                 | pizza         | High-signal pizza terms; separate from general meals       |
| Food & drink   | `restaurants`      | Restaurants           | restaurant    | General meals out, restaurants, burgers and barbecue       |
| Food & drink   | `asian-food`       | Asian food            | noodles       | Noodles and broad East/Southeast Asian dishes              |
| Food & drink   | `sushi`            | Sushi                 | sushi         | Sushi-specific dishes and venues                           |
| Food & drink   | `groceries`        | Groceries             | cart          | Food shops and ingredients for home                        |
| Food & drink   | `coffee-breakfast` | Coffee & breakfast    | coffee        | Cafés, coffee and breakfast food                           |
| Food & drink   | `desserts-snacks`  | Desserts & snacks     | cake          | Sweet food and between-meal snacks                         |
| Food & drink   | `drinks-nightlife` | Drinks & nightlife    | wine          | Alcohol, bars and nightlife tabs                           |
| Getting around | `fuel`             | Fuel                  | fuel          | Petrol, diesel, charging and motor oil                     |
| Getting around | `taxi-rides`       | Taxi & rides          | taxi          | Taxis, ride-hailing and private transfers                  |
| Getting around | `public-transit`   | Public transit        | train         | Rail, bus and local mass transit                           |
| Getting around | `flights`          | Flights               | plane         | Airfare plus airport and baggage fees                      |
| Getting around | `parking-tolls`    | Parking & tolls       | parking       | Parking, road tolls and congestion charges                 |
| Getting around | `car-hire`         | Car hire & road trips | van           | Vehicle rental and campervan trips                         |
| Getting around | `boats-ferries`    | Boats & ferries       | boat          | Ferries, boats, cruises and sailing                        |
| Trips & stays  | `accommodation`    | Accommodation         | hotel         | Short stays in hotels, hostels and rentals                 |
| Trips & stays  | `rent-home`        | Rent & home           | house         | Primary housing rent, deposits and building fees           |
| Trips & stays  | `holidays-trips`   | Holidays & trips      | suitcase      | General trip costs without a stronger purpose              |
| Trips & stays  | `beach-water`      | Beach & water         | island        | Beaches, swimming, diving and water activities             |
| Trips & stays  | `outdoors-camping` | Outdoors & camping    | tent          | Campsites, hiking and outdoor access                       |
| Trips & stays  | `snow-sports`      | Snow sports           | ski           | Skiing, snowboarding, passes and equipment                 |
| Everyday life  | `shopping`         | Shopping              | market        | General retail and online purchases                        |
| Everyday life  | `gifts`            | Gifts                 | gift          | Presents and occasion-specific gifts                       |
| Everyday life  | `entertainment`    | Entertainment         | cinema        | Cinema, theatre, games and attractions                     |
| Everyday life  | `music-events`     | Music & events        | guitar        | Concerts, festivals, gigs and event tickets                |
| Everyday life  | `parties`          | Parties               | party         | Hosted parties and celebration supplies                    |
| Everyday life  | `sports-fitness`   | Sports & fitness      | football      | Gyms, sports, classes and equipment                        |
| Everyday life  | `pets`             | Pets                  | dog           | Pet food, supplies, vets and care                          |
| Everyday life  | `phone-internet`   | Phone & internet      | phone         | Mobile, broadband, Wi-Fi and data plans                    |
| Everyday life  | `utilities`        | Utilities             | lightbulb     | Electricity, water, household gas and waste                |
| Care & family  | `health`           | Health                | pulse         | Clinicians, treatment and medical care                     |
| Care & family  | `pharmacy`         | Pharmacy              | pill          | Medicines, prescriptions and pharmacy goods                |
| Care & family  | `education`        | Education             | book          | Schools, courses, tuition and learning materials           |
| Care & family  | `childcare`        | Childcare             | teddy         | Daycare, babysitting and child-specific care               |
| Money & admin  | `cash`             | Cash                  | cash          | Withdrawals and cash-only expenses                         |
| Money & admin  | `banking-fees`     | Banking & fees        | bank          | Bank, card and currency conversion fees                    |
| Money & admin  | `bills-receipts`   | Bills & receipts      | iconreceipt   | Generic invoices and shared bills with no stronger purpose |
| Money & admin  | `transfers`        | Transfers             | swap          | Moving or repaying money rather than buying something      |
| Money & admin  | `charity`          | Charity & causes      | iconhandcoins | Donations, fundraisers and community causes                |
| Money & admin  | `other`            | Other                 | question      | Unknown or genuinely miscellaneous expenses                |

## Deliberate overlaps

| Ambiguity                           | Decision                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Pizza vs Restaurants                | Pizza gets its own high-recognition category; other prepared meals use Restaurants.                                    |
| Sushi vs Asian food                 | Sushi stays visually distinctive; ramen, pho, noodles and similar dishes use Asian food.                               |
| `gas` vs `gas bill`                 | The longer phrase wins, so household gas is Utilities and vehicle gas is Fuel.                                         |
| Airport shuttle vs airport transfer | Shuttle is grouped with Flights; private transfer is Taxi & rides.                                                     |
| Accommodation vs Rent & home        | Short travel stays use Accommodation; primary housing costs use Rent & home.                                           |
| Health vs Pharmacy                  | Care delivery uses Health; medicine and pharmacy purchases use Pharmacy.                                               |
| Bills vs Banking vs Transfers       | Bills describe a document/payment, Banking covers fees, and Transfers cover moving money. A more specific phrase wins. |
| Shopping vs Gifts                   | Gift intent wins when stated; otherwise a retail purchase remains Shopping.                                            |

## Doodle choices

All category art is a transparent, path-only 32×32 drawing using the existing roughened doodle generator. No fill rectangle or background color is embedded in the assets.

Thirty-three categories reuse a semantically close drawing from the current set. Seven needed a purpose-built drawing:

| Doodle       | Used for        | Shape choice                           |
| ------------ | --------------- | -------------------------------------- |
| `restaurant` | Restaurants     | Plate framed by a fork and knife       |
| `fuel`       | Fuel            | Petrol pump with a loose hose          |
| `parking`    | Parking & tolls | Tall parking P on one ground stroke    |
| `lightbulb`  | Utilities       | Bare bulb with three restrained rays   |
| `pill`       | Pharmacy        | Single diagonal capsule and seam       |
| `book`       | Education       | Open book with two falling page groups |
| `teddy`      | Childcare       | Small round-eared teddy toy            |

The drawings avoid faces, people and payer identity. Their job is to communicate what the expense was for at a glance.
