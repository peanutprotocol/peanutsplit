'use client'

import { useRef, useState } from 'react'
import { normalizePersonName } from '@/lib/person-name'

/** Keep every name local until the room can be created with its whole roster. */
export function useRoomPeopleDraft(creatorName: string) {
    const [memberNames, setMemberNames] = useState([''])
    const [invalidMemberIndex, setInvalidMemberIndex] = useState<number | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const focusPerson = (index: number) => {
        requestAnimationFrame(() => {
            const input = containerRef.current?.querySelector<HTMLInputElement>(`[data-person-index="${index}"]`)
            input?.focus({ preventScroll: true })
            input?.closest('[data-person-row]')?.scrollIntoView({ block: 'nearest' })
        })
    }

    const changeMembers = (names: string[]) => {
        setMemberNames(names)
        setInvalidMemberIndex(null)
    }

    const addPerson = () => {
        const emptyIndex = memberNames.findIndex((name) => !normalizePersonName(name))
        if (emptyIndex >= 0) return focusPerson(emptyIndex)
        changeMembers([...memberNames, ''])
        focusPerson(memberNames.length)
    }

    const validatePeople = () => {
        const seen = new Set([normalizePersonName(creatorName).toLowerCase()])
        for (const [index, value] of memberNames.entries()) {
            const name = normalizePersonName(value).toLowerCase()
            if (!name) continue
            if (seen.has(name)) {
                setInvalidMemberIndex(index)
                focusPerson(index)
                return false
            }
            seen.add(name)
        }
        setInvalidMemberIndex(null)
        return true
    }

    return { memberNames, invalidMemberIndex, containerRef, changeMembers, addPerson, focusPerson, validatePeople }
}
