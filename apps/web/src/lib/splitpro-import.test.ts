import { describe, expect, it } from 'vitest'
import { importRoomSchema } from '@/server/validation'
import { SplitwiseParseError, type SplitwiseImport } from '@/lib/splitwise-csv'
import { parseImportFile } from '@/lib/splitpro-import'
import { SPLITPRO_ACCOUNT_EXPORT, SPLITPRO_FRIEND_CSV } from '@/lib/__fixtures__/splitpro'

function balances(result: SplitwiseImport): Record<string, string> {
    const net = new Map(result.members.map((member) => [member, 0n]))
    for (const expense of result.expenses) {
        net.set(expense.paidBy, (net.get(expense.paidBy) ?? 0n) + BigInt(expense.costMinor))
        for (const share of expense.shares) {
            net.set(share.member, (net.get(share.member) ?? 0n) - BigInt(share.amountMinor))
        }
    }
    return Object.fromEntries([...net].map(([member, amount]) => [member, amount.toString()]))
}

const acceptedByServer = (result: SplitwiseImport) =>
    importRoomSchema.safeParse({
        roomName: 'Imported room',
        currency: result.suggestedCurrency,
        creatorName: result.members[0],
        members: result.members,
        expenses: result.expenses,
    }).success

describe('Split Pro account JSON', () => {
    const file = parseImportFile(SPLITPRO_ACCOUNT_EXPORT, 'splitpro_data.json')

    it('detects the account backup and exposes every importable group', () => {
        expect(file.source).toBe('splitpro')
        expect(file.choices.map((choice) => choice.roomName)).toEqual(['Summer trip', 'The flat'])
        expect(file.skipped).toEqual([])
    })

    it('infers the current user and keeps the roster names available in the backup', () => {
        expect(file.choices[0].parsed.members).toEqual(['You', 'Bruno', 'Carla'])
    })

    it('imports each mirrored balance pair exactly once', () => {
        const summer = file.choices[0].parsed
        expect(summer.expenses).toHaveLength(3)
        expect(balances(summer)).toEqual({ You: '1000', Bruno: '-1300', Carla: '300' })
    })

    it('uses balance-forward rows and says why expense history is absent', () => {
        const summer = file.choices[0].parsed
        expect(summer.expenses.every((expense) => expense.description.startsWith('Balance brought forward'))).toBe(true)
        expect(summer.warnings.map((warning) => warning.code)).toContain('SPLITPRO_BALANCES_ONLY')
    })

    it('preserves each group currency and produces payloads the server accepts', () => {
        expect(file.choices.map((choice) => choice.parsed.suggestedCurrency)).toEqual(['EUR', 'GBP'])
        expect(file.choices.every((choice) => acceptedByServer(choice.parsed))).toBe(true)
    })

    it('keeps usable groups and reports a settled group that contains no balance to import', () => {
        const decoded = JSON.parse(SPLITPRO_ACCOUNT_EXPORT)
        decoded.groups.push({
            id: 12,
            name: 'Already settled',
            groupUsers: [
                { groupId: 12, userId: 1 },
                { groupId: 12, userId: 2 },
            ],
            groupBalances: [],
        })
        const parsed = parseImportFile(JSON.stringify(decoded), 'splitpro_data.json')

        expect(parsed.choices).toHaveLength(2)
        expect(parsed.skipped).toEqual([{ roomName: 'Already settled', reason: 'NO_EXPENSES' }])
    })

    it('separates balances outside groups without importing group balances twice', () => {
        const decoded = JSON.parse(SPLITPRO_ACCOUNT_EXPORT)
        decoded.friends['2'].balances.push({ currency: 'EUR', amount: '300' })
        const parsed = parseImportFile(JSON.stringify(decoded), 'splitpro_data.json')

        expect(parsed.choices.map((choice) => choice.roomName)).toEqual([
            'Summer trip',
            'The flat',
            'SplitPro balances',
        ])
        expect(balances(parsed.choices[2].parsed)).toEqual({ You: '300', Bruno: '-300' })
    })

    it('imports a backup containing only direct friend balances', () => {
        const direct = JSON.stringify({
            friends: {
                2: { id: 2, name: 'Bruno', balances: [{ currency: 'EUR', amount: '-425' }] },
            },
            groups: [],
        })
        const parsed = parseImportFile(direct, 'splitpro_data.json').choices[0].parsed

        expect(parsed.members).toEqual(['You', 'Bruno'])
        expect(balances(parsed)).toEqual({ You: '-425', Bruno: '425' })
        expect(parsed.expenses[0].date).toBe('1970-01-01')
        expect(acceptedByServer(parsed)).toBe(true)
    })

    it('gives malformed JSON its own actionable error code', () => {
        expect(() => parseImportFile('{"friends":', 'splitpro_data.json')).toThrowError(
            expect.objectContaining<Partial<SplitwiseParseError>>({ code: 'MALFORMED_JSON' })
        )
    })
})

describe('Split Pro friend CSV', () => {
    const parsed = parseImportFile(SPLITPRO_FRIEND_CSV, 'expenses_with_Natalia.csv').choices[0].parsed
    const header = SPLITPRO_FRIEND_CSV.split('\n')[0]

    it('detects the pair export and names both people', () => {
        expect(parsed.members).toEqual(['You', 'Natalia'])
        expect(parsed.expenses.map((expense) => expense.description)).toEqual(['Dinner', 'Taxi', 'Settle up'])
    })

    it('reconstructs shares from You Lent and You Owe without changing the balance', () => {
        expect(parsed.expenses[0].shares).toEqual([
            { member: 'You', amountMinor: '4000' },
            { member: 'Natalia', amountMinor: '2000' },
        ])
        expect(parsed.expenses[1].shares).toEqual([
            { member: 'Natalia', amountMinor: '2000' },
            { member: 'You', amountMinor: '1000' },
        ])
        expect(balances(parsed)).toEqual({ You: '2000', Natalia: '-2000' })
    })

    it('makes every row self-balancing and accepted by the import endpoint schema', () => {
        for (const expense of parsed.expenses) {
            expect(expense.shares.reduce((sum, share) => sum + BigInt(share.amountMinor), 0n)).toBe(
                BigInt(expense.costMinor)
            )
        }
        expect(acceptedByServer(parsed)).toBe(true)
    })

    it('explains the missing group attribution and settlement representation', () => {
        const codes = parsed.warnings.map((warning) => warning.code)
        expect(codes).toContain('SPLITPRO_PAIR_HISTORY')
        expect(codes).toContain('PAYMENT_ROWS')
    })

    it('explains when percentage or share weights become fixed final amounts', () => {
        const weighted = `${header}\nYou,Dinner,Food,20.00,PERCENTAGE,2026-08-01 12:00:00,EUR,10.00,0,0\n`
        const imported = parseImportFile(weighted, 'expenses_with_Natalia.csv').choices[0].parsed

        expect(imported.expenses[0].splitMode).toBe('EXACT')
        expect(imported.expenses[0].shares).toEqual([
            { member: 'You', amountMinor: '1000' },
            { member: 'Natalia', amountMinor: '1000' },
        ])
        expect(imported.warnings).toContainEqual({ code: 'SPLITPRO_SPLIT_MODE_FLATTENED' })
    })

    it('preserves explicit exact editing intent even when the final amounts are 50/50', () => {
        const exact = `${header}\nYou,Dinner,Food,20.00,EXACT,2026-08-01 12:00:00,EUR,10.00,0,0\n`
        const imported = parseImportFile(exact, 'expenses_with_Natalia.csv').choices[0].parsed

        expect(imported.expenses[0].splitMode).toBe('EXACT')
    })

    it('derives the friend from consistent Paid By cells even when the file was renamed', () => {
        const renamed = parseImportFile(SPLITPRO_FRIEND_CSV, 'trip.csv').choices[0].parsed
        expect(renamed.members).toEqual(['You', 'Natalia'])
        expect(renamed.expenses.map((expense) => expense.paidBy)).toEqual(['You', 'Natalia', 'You'])
    })

    it('cleans a browser download suffix when the rows contain no friend-paid expense', () => {
        const onlyYou = `${header}\nYou,Dinner,Food,20.00,EQUAL,2026-08-01 12:00:00,EUR,10.00,0,0\n`
        const imported = parseImportFile(onlyYou, 'expenses_with_Natalia Cieśla (5).csv').choices[0].parsed

        expect(imported.members).toEqual(['You', 'Natalia Cieśla'])
    })

    it('drops a payer inconsistent with the inferred pair instead of assigning it to the friend', () => {
        const withThirdPayer = [
            header,
            'You,Dinner,Food,20.00,EQUAL,2026-08-01 12:00:00,EUR,10.00,0,0',
            'Natalia,Taxi,Transport,20.00,EQUAL,2026-08-01 12:00:00,EUR,0,10.00,0',
            'Someone Else,Coffee,Food,10.00,EQUAL,2026-08-01 12:00:00,EUR,0,5.00,0',
            '',
        ].join('\n')
        const imported = parseImportFile(withThirdPayer, 'expenses_with_Natalia.csv').choices[0].parsed

        expect(imported.expenses.map((expense) => expense.description)).toEqual(['Dinner', 'Taxi'])
        expect(imported.warnings).toContainEqual({ code: 'ROW_NO_PAYER', row: 4, detail: 'Someone Else' })
    })

    it('preserves the calendar day from SplitPro timestamps independently of timezone', () => {
        const atMidnight = `${header}\nYou,Rent,Housing,20.00,EQUAL,2026-08-01 00:00:00,EUR,10.00,0,0\n`
        const imported = parseImportFile(atMidnight, 'expenses_with_Natalia.csv').choices[0].parsed

        expect(imported.expenses[0].date).toBe('2026-08-01')
        expect(imported.warnings.map((warning) => warning.code)).not.toContain('ROW_BAD_DATE')
    })

    it('uses a deterministic sentinel for an invalid SplitPro date', () => {
        const badDate = `${header}\nYou,Rent,Housing,20.00,EQUAL,not a date,EUR,10.00,0,0\n`
        const imported = parseImportFile(badDate, 'expenses_with_Natalia.csv').choices[0].parsed

        expect(imported.expenses[0].date).toBe('1970-01-01')
        expect(imported.warnings).toContainEqual({ code: 'ROW_BAD_DATE', row: 2 })
    })

    it('reads grouped zero-decimal amounts without changing their scale', () => {
        const jpy = `${header}\nYou,Dinner,Food,"2,000",EQUAL,2026-08-01 12:00:00,JPY,"1,000",0,0\n`
        const imported = parseImportFile(jpy, 'expenses_with_Natalia.csv').choices[0].parsed

        expect(imported.expenses[0].costMinor).toBe('2000')
        expect(imported.expenses[0].shares).toEqual([
            { member: 'You', amountMinor: '1000' },
            { member: 'Natalia', amountMinor: '1000' },
        ])
    })

    it('surfaces a typed error for an unterminated quoted field', () => {
        expect(() => parseImportFile(`${header}\nYou,"unterminated`, 'expenses_with_Natalia.csv')).toThrowError(
            expect.objectContaining<Partial<SplitwiseParseError>>({ code: 'MALFORMED_CSV' })
        )
    })
})
