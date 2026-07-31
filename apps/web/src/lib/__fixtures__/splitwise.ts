/**
 * Splitwise export fixtures, built to the documented group-export format.
 *
 * These are the specification as far as this codebase is concerned — there is no Splitwise API to
 * test against, so a fixture that lies about the format is a bug that ships. Each one was written
 * from the shape Splitwise's export produces (header row, one signed net column per member, a
 * trailing "Total balance" row) and each keeps its member columns summing to zero per row, which
 * is the property the whole derivation rests on.
 *
 * Shared by the parser unit tests and the import-route tests so the round-trip proof — parse the
 * file, create the room, compare Split's balances against the file's own "Total balance" row — is
 * running against the same bytes on both sides.
 */

/** Three people, one currency, plain equal splits, with the balance row Splitwise appends. */
export const SIMPLE_GROUP = `Date,Description,Category,Cost,Currency,Ana,Bruno,Carla
2026-01-02,Dinner,Dining out,60.00,EUR,40.00,-20.00,-20.00
2026-01-03,Taxi,Transportation,30.00,EUR,-10.00,20.00,-10.00
2026-01-04,Groceries,Groceries,45.00,EUR,-15.00,-15.00,30.00
Total balance,,,0.00,EUR,15.00,-15.00,0.00
`

/** The same group, but the trip crossed a border. Splitwise keeps each expense in the currency it
 *  was paid in and has no balance row that could reconcile them. */
export const MULTI_CURRENCY = `Date,Description,Category,Cost,Currency,Ana,Bruno
2026-02-01,Hotel,Hotel,200.00,EUR,100.00,-100.00
2026-02-02,Lunch,Dining out,40.00,EUR,-20.00,20.00
2026-02-03,Ski pass,Entertainment,120.00,CHF,60.00,-60.00
`

/** A row two people fronted together. Splitwise exports only the nets, so who paid what is
 *  unrecoverable — the importer has to split the row and say that it did. */
export const MULTI_PAYER = `Date,Description,Category,Cost,Currency,Ana,Bruno,Carla
2026-03-01,Villa deposit,Housing,900.00,EUR,300.00,300.00,-600.00
Total balance,,,0.00,EUR,300.00,300.00,-600.00
`

/** Commas and quotes inside fields, which is the whole reason a CSV needs a real parser. */
export const QUOTED_FIELDS = `Date,Description,Category,Cost,Currency,Ana,Bruno
2026-04-01,"Dinner, drinks and a taxi",Dining out,"50.00",EUR,25.00,-25.00
2026-04-02,"She said ""it's on me""",Dining out,20.00,EUR,-10.00,10.00
Total balance,,,0.00,EUR,15.00,-15.00
`

/** European decimals with dot grouping — an export opened and re-saved in a localised spreadsheet. */
export const LOCALISED_DECIMALS = `Date,Description,Category,Cost,Currency,Ana,Bruno
2026-05-01,Flights,Travel,"1.234,56",EUR,"617,28","-617,28"
2026-05-02,Coffee,Dining out,"4,50",EUR,"-2,25","2,25"
Total balance,,,0.00,EUR,615.03,-615.03
`

/** Settle-ups. Splitwise records a payment as a row in the same table, category "Payment". */
export const WITH_PAYMENTS = `Date,Description,Category,Cost,Currency,Ana,Bruno
2026-06-01,Dinner,Dining out,80.00,EUR,40.00,-40.00
2026-06-02,Payment,Payment,40.00,EUR,-40.00,40.00
Total balance,,,0.00,EUR,0.00,0.00
`

/** Preamble rows, blank lines, a row that does not sum to zero, a currency Split does not carry,
 *  and a zero-cost row. Everything survivable should survive.
 *
 *  KPW is a real ISO 4217 code that the rate feed does not carry, so nothing can price it. It is
 *  what "a currency Split does not carry" means now that the catalog is 162 codes wide. */
export const MESSY_GROUP = `My group export
,,,,,,

Date,Description,Category,Cost,Currency,Ana,Bruno

2026-07-01,Dinner,Dining out,50.00,EUR,25.00,-25.00
2026-07-02,Broken,Dining out,50.00,EUR,25.00,-20.00
2026-07-03,Unpriceable,Dining out,500.00,KPW,250.00,-250.00
2026-07-04,Nothing,Dining out,0.00,EUR,0.00,0.00
2026-07-05,Lunch,Dining out,30.00,EUR,-15.00,15.00

Total balance,,,0.00,EUR,10.00,-10.00
`

/** Not a Splitwise export at all. */
export const GARBAGE = `%PDF-1.4
1 0 obj
<< /Type /Catalog >>
`

/** Bank-statement CSV: real columns, real commas, no member columns and no currency column. */
export const WRONG_CSV = `Transaction Date,Details,Amount,Balance
2026-01-02,COFFEE SHOP,-3.40,1200.10
2026-01-03,SALARY,2000.00,3200.10
`

/**
 * `count` rows of an arbitrary-sized group, so the caps and the share maths can be tested at
 * sizes nobody wants to write out by hand.
 *
 * The shares are worked out in whole cents with the remainder handed to the first people — the
 * same rule Split uses — because a fixture built from `(10 / n).toFixed(2)` does not sum to zero
 * for n = 3, and a generator that emits invalid files tests the warning path by accident.
 */
export function generateGroup(count: number, members = ['Ana', 'Bruno']): string {
    const header = `Date,Description,Category,Cost,Currency,${members.join(',')}`
    const cost = 1000
    const base = Math.floor(cost / members.length)
    const remainder = cost % members.length
    const shares = members.map((_, i) => base + (i < remainder ? 1 : 0))
    const cents = (value: number) => (value / 100).toFixed(2)

    const rows = Array.from({ length: count }, (_, i) => {
        const day = String((i % 28) + 1).padStart(2, '0')
        // The first member fronts every one, so their net is the total minus their own share.
        const nets = shares.map((share, m) => (m === 0 ? cost - share : -share))
        return `2026-01-${day},Expense ${i + 1},Dining out,${cents(cost)},EUR,${nets.map(cents).join(',')}`
    })
    return [header, ...rows, ''].join('\n')
}

/**
 * A group with more history than a room can hold, and a "Total balance" row that
 * states what the whole file adds up to.
 *
 * The point of this one is the proof it makes possible: parse it, let the parser
 * drop everything past the ceiling and replace it with an opening balance, and
 * the fold of what SURVIVED must still equal this row to the cent
 * (`reconcileTotalBalance` returning an empty array). If the opening-balance
 * construction is wrong in any way, that comparison is where it shows.
 *
 * By default costs divide evenly by the roster so no row carries a rounding
 * residue — the question there is whether the carried-forward arithmetic is
 * exact, and a residue would make a failure ambiguous between the two. Pass
 * `costMinor` for the opposite case: a cost the roster cannot divide, so every
 * single row leaves a residue, which is what the room-currency bound has to hold
 * up against. Dates advance one day per row, so "the most recent N" has exactly
 * one meaning, and the payer rotates so every member ends up genuinely up or
 * down rather than all square.
 */
export function generateLongHistory(
    count: number,
    members = ['Ana', 'Bruno', 'Carla', 'Dan'],
    costMinor?: number
): string {
    const header = `Date,Description,Category,Cost,Currency,${members.join(',')}`
    const cents = (value: number) => (value / 100).toFixed(2)
    // 12.00 per head by default, whatever the roster size — no remainder, ever.
    const cost = costMinor ?? 1200 * members.length
    // Splitwise's own division: the first few members carry the extra cent.
    const base = Math.floor(cost / members.length)
    const remainder = cost % members.length
    const shares = members.map((_, i) => base + (i < remainder ? 1 : 0))

    const totals = members.map(() => 0)
    const rows = Array.from({ length: count }, (_, i) => {
        const payer = i % members.length
        const nets = members.map((_, m) => (m === payer ? cost - shares[m] : -shares[m]))
        nets.forEach((net, m) => (totals[m] += net))
        const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
        return `${day},Expense ${i + 1},Dining out,${cents(cost)},EUR,${nets.map(cents).join(',')}`
    })

    return [header, ...rows, `Total balance,,,0.00,EUR,${totals.map(cents).join(',')}`, ''].join('\n')
}
