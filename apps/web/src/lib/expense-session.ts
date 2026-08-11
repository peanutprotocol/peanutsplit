/**
 * A JoinGate can temporarily own the screen after a member token rotates. A
 * draft that was already open stays logically open (so its reset-on-open effect
 * does not erase money fields), while a fresh visit waits for both room and
 * identity loading before it can start. Otherwise `needsJoin` is temporarily
 * false and the draft can consume a shared receipt before JoinGate takes over.
 */
export const expenseSessionCanStart = (roomAndIdentityReady: boolean, needsJoin: boolean): boolean =>
    roomAndIdentityReady && !needsJoin

export const expenseSessionShouldOpen = (
    requested: boolean,
    roomAndIdentityReady: boolean,
    needsJoin: boolean,
    started: boolean
): boolean => requested && (started || expenseSessionCanStart(roomAndIdentityReady, needsJoin))
