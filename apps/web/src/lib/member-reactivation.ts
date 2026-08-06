import type { ApiMember } from './api-types'
import { isFormerMember } from './members'
import { normalizePersonName } from './person-name'

const keyOf = (name: string) => normalizePersonName(name).toLocaleLowerCase()

/** Local Former detection uses `formerOnly`. After a stale roster loses a race
 * with server removal, the MEMBER_REACTIVATION_REQUIRED response may use the
 * same still-active-looking row to open the confirmation instead. */
export const reactivationCandidateForName = (
    members: readonly ApiMember[],
    name: string,
    formerOnly = true
): ApiMember | null => {
    const key = keyOf(name)
    return members.find((member) => (!formerOnly || isFormerMember(member)) && keyOf(member.name) === key) ?? null
}
