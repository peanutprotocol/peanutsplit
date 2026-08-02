/**
 * Shapes emitted by Split Pro itself as of 2026-08-02.
 *
 * The account download serializes the return value of `user.downloadData` with
 * BigInts changed to strings. BalanceView emits both directions of every pair,
 * hence the mirrored rows below. There are deliberately no expenses in this
 * export: Split Pro's account download does not include them.
 */
export const SPLITPRO_ACCOUNT_EXPORT = JSON.stringify(
    {
        friends: {
            2: {
                id: 2,
                email: 'bruno@example.com',
                name: 'Bruno',
                balances: [
                    { currency: 'EUR', amount: '1500' },
                    { currency: 'GBP', amount: '-700' },
                ],
            },
            3: {
                id: 3,
                email: 'carla@example.com',
                name: 'Carla',
                balances: [{ currency: 'EUR', amount: '-500' }],
            },
        },
        groups: [
            {
                id: 10,
                publicId: 'summer-trip',
                name: 'Summer trip',
                userId: 2,
                defaultCurrency: 'EUR',
                updatedAt: '2026-07-20T12:00:00.000Z',
                groupUsers: [
                    { groupId: 10, userId: 1 },
                    { groupId: 10, userId: 2 },
                    { groupId: 10, userId: 3 },
                ],
                groupBalances: [
                    {
                        userId: 1,
                        friendId: 2,
                        groupId: 10,
                        currency: 'EUR',
                        amount: '1500',
                        updatedAt: '2026-07-20T12:00:00.000Z',
                    },
                    {
                        userId: 2,
                        friendId: 1,
                        groupId: 10,
                        currency: 'EUR',
                        amount: '-1500',
                        updatedAt: '2026-07-20T12:00:00.000Z',
                    },
                    {
                        userId: 1,
                        friendId: 3,
                        groupId: 10,
                        currency: 'EUR',
                        amount: '-500',
                        updatedAt: '2026-07-20T12:00:00.000Z',
                    },
                    {
                        userId: 3,
                        friendId: 1,
                        groupId: 10,
                        currency: 'EUR',
                        amount: '500',
                        updatedAt: '2026-07-20T12:00:00.000Z',
                    },
                    {
                        userId: 2,
                        friendId: 3,
                        groupId: 10,
                        currency: 'EUR',
                        amount: '200',
                        updatedAt: '2026-07-20T12:00:00.000Z',
                    },
                    {
                        userId: 3,
                        friendId: 2,
                        groupId: 10,
                        currency: 'EUR',
                        amount: '-200',
                        updatedAt: '2026-07-20T12:00:00.000Z',
                    },
                ],
            },
            {
                id: 11,
                publicId: 'flat',
                name: 'The flat',
                userId: 1,
                defaultCurrency: 'GBP',
                updatedAt: '2026-07-21T12:00:00.000Z',
                groupUsers: [
                    { groupId: 11, userId: 1 },
                    { groupId: 11, userId: 2 },
                ],
                groupBalances: [
                    {
                        userId: 1,
                        friendId: 2,
                        groupId: 11,
                        currency: 'GBP',
                        amount: '-700',
                        updatedAt: '2026-07-21T12:00:00.000Z',
                    },
                    {
                        userId: 2,
                        friendId: 1,
                        groupId: 11,
                        currency: 'GBP',
                        amount: '700',
                        updatedAt: '2026-07-21T12:00:00.000Z',
                    },
                ],
            },
        ],
    },
    null,
    2
)

/** The separate export on a friend's balance page. */
export const SPLITPRO_FRIEND_CSV = `Paid By,Name,Category,Amount,Split Type,Expense Date,Currency,You Lent,You Owe,Settlement
You,Dinner,Food,60.00,EQUAL,2026-07-01 18:30:00,EUR,20.00,0,0
Natalia,Taxi,Transport,30.00,EXACT,2026-07-02 22:15:00,EUR,0,10.00,0
You,Settle up,General,10.00,SETTLEMENT,2026-07-03 09:00:00,EUR,0,0,10.00
`
