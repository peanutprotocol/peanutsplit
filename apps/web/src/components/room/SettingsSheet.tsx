'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { PushOptIn } from '@/components/pwa/PushOptIn'
import { DoodlePicker } from '@/components/room/DoodlePicker'
import { PeopleSection } from '@/components/room/PeopleSection'
import { RoomEmblem } from '@/components/room/RoomEmblem'
import { RoomExport } from '@/components/room/RoomExport'
import { RoomSwitcher } from '@/components/room/RoomSwitcher'
import { ThemePicker } from '@/components/room/ThemePicker'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import { SettingRow } from '@/components/ui/SettingRow'
import type { DoodleName } from '@/components/ui/doodles'
import { roomProps, track } from '@/lib/analytics'
import type { ApiMember, ApiRoom, RoomState } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { copyText } from '@/lib/clipboard'
import { useErrorMessage } from '@/lib/error-messages'
import type { MemberIdentity } from '@/lib/identity'
import { useSetEmblem, useSetRoomName, useSetTheme } from '@/lib/queries'
import { emblemChoice, roomEmblemDoodle } from '@/lib/room-emblem'
import { themeFor } from '@/lib/themes'
import { TOAST_MS } from '@/lib/toasts'
import { useFeedback } from '@/lib/use-settings'
import { DeviceSheet } from './DeviceSheet'

interface SettingsSheetProps {
    open: boolean
    onClose: () => void
    room: ApiRoom
    members: ApiMember[]
    /** Full room state, for the surface that needs the ledger (CSV/JSON export). */
    state: RoomState
    identity: MemberIdentity | null
    me: ApiMember | null
    onShare: () => void
    onForgetIdentity: () => void
    onOpenCharacter: (memberId: string) => void
}

/**
 * One room-first sheet.
 *
 * The old drawer was three container grammars deep and explained its own scope
 * in 255 words. Here the ROOM CARD is the scope signal: it wears the room's own
 * colour, and everything inside it is shared with the room. That is what pays
 * for deleting every "everyone in this room sees this" sentence — the card says
 * it, in the same paint the header is wearing behind the sheet.
 *
 * Above the card sit the other rooms on this device; below it, the one row that
 * really is per device. Nothing about the room needs a second level.
 */
export function SettingsSheet({
    open,
    onClose,
    room,
    members,
    state,
    identity,
    me,
    onShare,
    onForgetIdentity,
    onOpenCharacter,
}: SettingsSheetProps) {
    const t = useTranslations('room.header')
    const tTheme = useTranslations('room.theme')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const setRoomName = useSetRoomName(room.slug)
    const setTheme = useSetTheme(room.slug)
    const setEmblem = useSetEmblem(room.slug)
    const [draft, setDraft] = useState(room.name)
    const [deviceOpen, setDeviceOpen] = useState(false)
    const [switchOpen, setSwitchOpen] = useState(false)
    const [pickerOpen, setPickerOpen] = useState(false)
    const pickerRef = useRef<HTMLDetailsElement>(null)

    /** A `<details>` has no light-dismiss of its own, so the grid would sit over the
     *  card — including over the name field beside it — until it was toggled again.
     *  Same fix, same reason, as the create form. */
    useEffect(() => {
        if (!pickerOpen) return
        const onPointerDown = (event: PointerEvent) => {
            if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [pickerOpen])

    // The rename is optimistic, so the room's name is authoritative the instant
    // it commits — and a rename arriving from another device belongs in the
    // field too, as long as it is not being typed in.
    useEffect(() => setDraft(room.name), [room.name])

    const dirty = draft.trim() !== room.name

    /**
     * A live field: the room is renamed on blur and on Enter, with no Save
     * button standing over the rarest decision in the sheet.
     *
     * An empty name restores the previous one rather than failing, and fires the
     * tick so the revert is something you feel happen — a field that silently
     * refills itself reads as data loss.
     */
    const commitName = () => {
        const name = draft.trim()
        if (!name) {
            setDraft(room.name)
            feedback('tick')
            return
        }
        if (name === room.name) {
            setDraft(name)
            return
        }
        setRoomName.mutate(name, {
            onSuccess: () => feedback('pop'),
            onError: (error) => {
                setDraft(room.name)
                feedback('error', { haptic: 'error' })
                toast.error(errorMessage(error, t('nameFailed')), { duration: TOAST_MS.actionable })
            },
        })
    }

    /**
     * The name the drawing follows while nothing is pinned. The draft rather than
     * the committed name, so the tile turns into a pair of skis while somebody is
     * still writing "Ski trip" — the same live guess the create form makes, which
     * is the whole reason these two controls are one row.
     */
    const nameForDoodle = draft.trim() || room.name

    /**
     * The drawing the tile is showing, which is what the picker has to highlight.
     * A room made before the drawings still stores an emoji character, and a room
     * that never picked one follows its name; `roomEmblemDoodle` is the one place
     * both of those readings happen.
     */
    const shownEmblem = roomEmblemDoodle(room.emoji, nameForDoodle)

    /**
     * Committed on the tap, like the theme: the picker closes, the tile is already
     * the new drawing, and a failure puts the old one back with a toast.
     *
     * `emblemChoice` owns the two decisions — tapping what is already on screen
     * writes nothing, and tapping the drawing the NAME gives releases the pin
     * instead of freezing it. Blur has already committed any rename by the time a
     * tile can be tapped, so the draft and the stored name agree here.
     */
    const chooseEmblem = (next: DoodleName) => {
        setPickerOpen(false)
        const choice = emblemChoice(next, room.emoji, nameForDoodle)
        if (!choice) return
        feedback('tick')
        setEmblem.mutate(choice.emblem, {
            onError: (error) => {
                feedback('error')
                toast.error(errorMessage(error, t('drawingFailed')), { duration: TOAST_MS.actionable })
            },
        })
    }

    const chooseTheme = (theme: string | null) => {
        if (theme === (room.theme ?? null)) return
        feedback('tick')
        track('theme_changed', roomProps(room.slug, { theme: theme ?? 'classic' }))
        setTheme.mutate(theme, {
            onError: (error) => {
                feedback('error')
                toast.error(errorMessage(error, tTheme('failed')), { duration: TOAST_MS.actionable })
            },
        })
    }

    const copyLink = async () => {
        const copied = await copyText(`${window.location.origin}/r/${room.slug}`)
        if (copied) toast.success(t('linkCopied'), { duration: TOAST_MS.default })
        else toast.error(t('copyFailed'), { duration: TOAST_MS.actionable })
    }

    const switchPerson = () => {
        setSwitchOpen(false)
        onClose()
        onForgetIdentity()
    }

    return (
        <>
            <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
                <DrawerContent className={drawerContentClass} data-testid="settings-sheet">
                    <DrawerHeader className={cn(drawerHeaderClass, 'flex flex-row items-end justify-between')}>
                        <DrawerTitle className="text-h5">{t('title')}</DrawerTitle>
                        <CloseButton onClick={onClose} label={t('close')} data-testid="close-room-settings" />
                    </DrawerHeader>
                    <DrawerBody>
                        <RoomSwitcher currentSlug={room.slug} />

                        <section
                            data-testid="room-card"
                            // The card wears the room's own field colour. This is the
                            // "everyone sees this" boundary, drawn instead of written.
                            style={{ backgroundColor: themeFor(room.theme).field }}
                            className="shadow-4 flex flex-col gap-3 rounded-lg border-2 border-n-1 p-3"
                        >
                            {/* Name and drawing are one control, because the drawing
                            follows the name: `emblem ?? roomDoodleFor(name)`. */}
                            <div className="flex items-stretch gap-2">
                                {/* A details/summary rather than a popover library — the same
                                    control the create form uses, so the drawing is picked the
                                    same way whether the room is a minute old or a month old. */}
                                <details
                                    ref={pickerRef}
                                    open={pickerOpen}
                                    onToggle={(event) => setPickerOpen((event.target as HTMLDetailsElement).open)}
                                    className="relative shrink-0"
                                >
                                    <summary
                                        aria-label={t('drawing')}
                                        data-testid="room-drawing"
                                        className="flex h-full cursor-pointer list-none items-center justify-center rounded-sm border border-n-1 bg-white px-3 [&::-webkit-details-marker]:hidden"
                                    >
                                        <RoomEmblem value={room.emoji} name={nameForDoodle} size={24} />
                                    </summary>
                                    <div className="shadow-4 absolute left-0 z-20 mt-2 w-64 rounded-sm border border-n-1 bg-white p-3">
                                        <DoodlePicker value={shownEmblem} onChange={chooseEmblem} />
                                    </div>
                                </details>
                                <BaseInput
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    onBlur={commitName}
                                    onKeyDown={(event) => {
                                        if (event.key !== 'Enter') return
                                        event.preventDefault()
                                        event.currentTarget.blur()
                                    }}
                                    maxLength={80}
                                    aria-label={t('roomName')}
                                    className="flex-1"
                                    data-testid="room-display-name"
                                />
                            </div>
                            {dirty && <p className="text-sm text-n-1">{t('linkStaysTheSame')}</p>}

                            <ThemePicker value={room.theme} onChange={chooseTheme} disabled={setTheme.isPending} />

                            <PeopleSection slug={room.slug} members={members} onOpenCharacter={onOpenCharacter} />

                            <PushOptIn
                                slug={room.slug}
                                roomName={room.name}
                                identity={identity}
                                onSwitchPerson={() => setSwitchOpen(true)}
                            />

                            {identity && (
                                <SettingRow
                                    label={t('you')}
                                    value={me?.name ?? identity.name}
                                    onClick={() => setSwitchOpen(true)}
                                    testId="you-row"
                                />
                            )}

                            <SettingRow
                                label={t('link')}
                                value={`/r/${room.slug}`}
                                onClick={() => void copyLink()}
                                testId="link-row"
                                trailing={
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose()
                                            onShare()
                                        }}
                                        aria-label={t('shareRoomLink')}
                                        data-testid="share-room-link"
                                        className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white transition-transform active:translate-y-[2px]"
                                    >
                                        <Icon name="share" size={18} />
                                    </button>
                                }
                            />

                            <RoomExport state={state} />
                        </section>

                        <SettingRow label={t('device')} onClick={() => setDeviceOpen(true)} testId="device-row" />

                        {/* The one surviving statement of the link-is-the-credential
                        fact. It used to appear four times. Say it once, here. */}
                        <p className="text-center text-sm text-grey-1">{t('privacyNote')}</p>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>

            <DeviceSheet open={deviceOpen} onClose={() => setDeviceOpen(false)} />

            <Drawer open={switchOpen} onOpenChange={setSwitchOpen}>
                <DrawerContent className={drawerContentClass} data-testid="switch-person-sheet">
                    <DrawerHeader className={drawerHeaderClass}>
                        <DrawerTitle className="text-h5">{t('switchPersonTitle')}</DrawerTitle>
                    </DrawerHeader>
                    <DrawerBody>
                        <p className="text-sm text-grey-1">
                            {t('switchPersonBody', { name: me?.name ?? identity?.name ?? '' })}
                        </p>
                        <DrawerActions>
                            <Button
                                variant="primary"
                                shadowSize="4"
                                className="justify-center"
                                onClick={switchPerson}
                                data-testid="switch-person-confirm"
                            >
                                {t('switchPerson')}
                            </Button>
                            <Button
                                variant="stroke"
                                className="justify-center"
                                onClick={() => setSwitchOpen(false)}
                                data-testid="switch-person-cancel"
                            >
                                {t('cancel')}
                            </Button>
                        </DrawerActions>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </>
    )
}
