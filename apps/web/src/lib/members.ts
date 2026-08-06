/**
 * One room has two useful member views:
 *
 * - the active roster, which is the only source for new activity; and
 * - the ledger directory, which keeps every identity needed to explain history.
 *
 * Keep that split here so a caller has to name which view it wants. `removedAt`
 * is optional only for old cached RoomState payloads; absence means active.
 */
export interface MembershipState {
    removedAt?: string | Date | null
}

export const isActiveMember = <T extends MembershipState>(member: T): boolean => member.removedAt == null

export const isFormerMember = <T extends MembershipState>(member: T): boolean => !isActiveMember(member)

export const activeMembers = <T extends MembershipState>(members: readonly T[]): T[] => members.filter(isActiveMember)

export const formerMembers = <T extends MembershipState>(members: readonly T[]): T[] => members.filter(isFormerMember)

/** All-member lookup for history, balances, settlements and reactions. */
export const ledgerMember = <T extends { id: string }>(members: readonly T[], memberId: string): T | undefined =>
    members.find((member) => member.id === memberId)

/** Active-only lookup for any new write or identity claim. */
export const activeMember = <T extends { id: string } & MembershipState>(
    members: readonly T[],
    memberId: string
): T | undefined => members.find((member) => member.id === memberId && isActiveMember(member))

/** Selector roster for a form already in progress: all active people plus only
 * the Former rows the current draft still references. Removing/changing that
 * reference makes the Former row disappear, so it cannot be newly re-added. */
export const activityRoleMembers = <T extends { id: string } & MembershipState>(
    members: readonly T[],
    referencedIds: ReadonlySet<string>
): T[] => members.filter((member) => isActiveMember(member) || referencedIds.has(member.id))

/** Active roster plus a Former identity only while a reopened balance is
 * non-zero. Zero Former rows live in the collapsed People directory instead. */
export const balanceMembers = <T extends { id: string } & MembershipState>(
    members: readonly T[],
    balances: Readonly<Record<string, string>>
): T[] => members.filter((member) => isActiveMember(member) || BigInt(balances[member.id] ?? '0') !== 0n)
