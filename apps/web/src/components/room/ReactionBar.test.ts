import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./ReactionBar.tsx', import.meta.url), 'utf8')

describe('the Telegram-style reaction pills', () => {
    it('receives the roster and exposes a controlled picker contract', () => {
        expect(source).toContain('members: ApiMember[]')
        expect(source).toContain('disabled?: boolean')
        expect(source).toContain('pickerOpen?: boolean')
        expect(source).toContain('onPickerOpenChange?: (open: boolean) => void')
        expect(source).toContain('onPickerOpenChange?.(open)')
    })

    it('blocks stale-state writes and closes either picker mode when disabled', () => {
        expect(source).toContain('const canReact = !disabled && !needsToken')
        expect(source).toContain('if (!canReact || !meId || !token) return')
        expect(source).toContain('setUncontrolledPickerOpen(false)')
        expect(source).toContain('if (controlledPickerOpen) onPickerOpenChange?.(false)')
    })

    it('renders the avatar and palette of every named reactor, never a count', () => {
        const pillTestId = source.indexOf('data-testid="reaction-pill"')
        const pillStart = source.lastIndexOf('<motion.button', pillTestId)
        const pillEnd = source.indexOf('</motion.button>', pillTestId)
        const pill = source.slice(pillStart, pillEnd)

        expect(pillStart).toBeGreaterThan(-1)
        expect(pillEnd).toBeGreaterThan(pillTestId)
        expect(source).toContain('const memberById = new Map(members.map')
        expect(source).toContain('if (reaction.emoji !== group.emoji || seen.has(reaction.memberId)) return []')
        expect(pill).toContain('<MemberAvatar')
        expect(pill).toContain('avatar={member.avatar}')
        expect(pill).toContain('palette={member.avatarPalette}')
        expect(pill).not.toContain('group.count')
    })

    it('names the toggle action and the people behind it for assistive technology', () => {
        expect(source).toContain("const reactorNames = group.reactors.map(reactorName).join(', ')")
        expect(source).toContain("member.removedAt == null ? member.name : t('formerName', { name: member.name })")
        expect(source).toContain("? t('remove', { emoji: reactionName })")
        expect(source).toContain(": t('pick', { emoji: reactionName })")
        expect(source).toContain('aria-label={`${toggleName}: ${reactorNames}')
    })

    it('aligns the compact social detail to the lower-right of its expense row', () => {
        expect(source).toContain("'relative flex w-full flex-wrap items-center justify-end gap-1.5'")
    })

    it('overlays the open picker without adding height to the expense row', () => {
        const pickerStart = source.indexOf('data-testid="reaction-strip"')
        const pickerEnd = source.indexOf('</motion.div>', pickerStart)
        const picker = source.slice(pickerStart, pickerEnd)

        expect(source).toContain("groups.length > 0 && 'pt-1.5'")
        expect(source).not.toContain("(groups.length > 0 || pickerOpen) && 'pt-1.5'")
        expect(picker).toContain('absolute right-0 top-full z-30 mt-1.5')
    })
})

describe('the reaction picker trigger', () => {
    it('is out of normal visual flow, reveals on focus, and uses doodle art', () => {
        const triggerStart = source.indexOf('data-testid="reaction-add"')
        const triggerEnd = source.indexOf('</button>', triggerStart)
        const trigger = source.slice(triggerStart, triggerEnd)

        expect(triggerStart).toBeGreaterThan(-1)
        expect(triggerEnd).toBeGreaterThan(triggerStart)
        expect(trigger).toContain("'sr-only focus:not-sr-only focus:absolute")
        expect(trigger).not.toContain('focus:relative')
        expect(trigger).toContain('<Doodle name="reactionlaugh"')
        expect(trigger).not.toMatch(/\p{Extended_Pictographic}/u)
    })

    it('closes before toggling the current member reaction', () => {
        const reactStart = source.indexOf('const react =')
        const reactEnd = source.indexOf('\n    return (', reactStart)
        const react = source.slice(reactStart, reactEnd)

        expect(react).toContain('setPickerOpen(false)')
        expect(react).toContain('removeReaction.mutate')
        expect(react).toContain('addReaction.mutate')
    })

    it('exposes the picker as a labelled toolbar that Escape closes', () => {
        expect(source).toContain('role="toolbar"')
        expect(source).toContain("aria-label={t('add')}")
        expect(source).toContain("if (event.key === 'Escape')")
        expect(source).toContain('setPickerOpen(false)')
        expect(source).toContain('triggerRef.current?.focus()')
    })
})
