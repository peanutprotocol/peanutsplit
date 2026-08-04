'use client'

import { createParser, parseAsString, useQueryStates } from 'nuqs'

/**
 * Every drawer in the room is a URL param, so mid-flow states are shareable and
 * the back button closes the sheet instead of leaving the room.
 *
 * `?add=1` · `?expense=<id>` · `?settle=1` · `?share=1` · `?balance=<memberId>` · `?shared=1`
 * · `?settings=1` · `?rooms=1` · `?character=<memberId>`
 *
 * The header sheets arrived late: they used to live in `useState`, so on Android
 * the back gesture left the room instead of closing the sheet.
 */
const parseAsFlag = createParser<boolean>({
    parse: (value) => (value === '1' || value === 'true' ? true : null),
    serialize: () => '1',
}).withDefault(false)

export const roomSearchParams = {
    add: parseAsFlag,
    expense: parseAsString.withDefault(''),
    settle: parseAsFlag,
    share: parseAsFlag,
    /** Member id — whose balance derivation is open. */
    balance: parseAsString.withDefault(''),
    /** A photo the OS share sheet parked for this room. Cleared the moment it is picked up. */
    shared: parseAsFlag,
    settings: parseAsFlag,
    /** The focused recent-room switcher opened by the room title. */
    rooms: parseAsFlag,
    /** Member id — whose character sheet is open. */
    character: parseAsString.withDefault(''),
}

export function useRoomParams() {
    return useQueryStates(roomSearchParams, { history: 'push' })
}
