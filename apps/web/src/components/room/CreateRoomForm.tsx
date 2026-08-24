'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import {
    COMPOSER_CURRENCY_SLOT,
    composerBareInputClassName,
    composerRowClassName,
    composerSurfaceClassName,
} from '@/components/ui/composer-style'
import { Icon } from '@/components/ui/Icon'
import type { RoomPrefill } from '@/lib/room-prefill'
import { readCurrencyChoice, rememberCurrencyChoice, useCurrencyHints } from '@/lib/use-currency-hint'
import { useCurrencies } from '@/lib/queries'
import { roomDoodleFor } from '@/lib/room-doodle'
import { useCreateRoomFlow } from '@/lib/use-create-room'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { CurrencySelect } from './CurrencySelect'
import { DoodlePicker } from './DoodlePicker'
import { RoomEmblem } from './RoomEmblem'

/** The server-rendered seed only. The real default is the device's top hint, which cannot be
 *  known until after mount — see the effect below. */
const DEFAULT_CURRENCY = 'EUR'

/**
 * One screen, three fields, no account.
 *
 * `prefill` is what a link already decided (`room-prefill.ts`), validated on the server. It seeds
 * initial state rather than being held as a second source of truth, so every field stays editable
 * and the form behaves identically once anybody touches it. A prefilled name also moves the
 * autofocus down to the one field a link is never allowed to fill in.
 */
export function CreateRoomForm({ prefill = {} }: { prefill?: RoomPrefill }) {
    const t = useTranslations('room.create')
    const router = useRouter()
    const { data: currencies } = useCurrencies()
    const { submit: createRoom, error, pending } = useCreateRoomFlow(t('failed'))
    const hints = useCurrencyHints()

    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()

    const [name, setName] = useState(prefill.name ?? '')
    // null means "follow the name". The emblem used to be rolled at random after mount, which
    // needed an effect purely to dodge a hydration
    // mismatch; reading the name is deterministic and right far more often.
    const [emblem, setEmblem] = useState<string | null>(prefill.emblem ?? null)
    const [currency, setCurrency] = useState(prefill.currency ?? DEFAULT_CURRENCY)
    // A guess is only ever allowed to fill an empty field. The moment someone picks a currency
    // themselves, the inference is done talking — a hint that overwrites a deliberate choice is
    // not smart, it is broken.
    // A currency in the link is a choice somebody already made, so the device hint below must not
    // overwrite it — the same rule that protects a currency picked here by hand.
    const [currencyChosen, setCurrencyChosen] = useState(prefill.currency !== undefined)
    const [creatorName, setCreatorName] = useState('')
    const [drawingOpen, setDrawingOpen] = useState(false)
    const drawingSummaryRef = useRef<HTMLButtonElement>(null)

    /** Seeded after mount, not during render: `Intl` and `navigator` do not exist on the server,
     *  and a currency that differs across hydration is a mismatch React will not patch up. */
    useEffect(() => {
        if (currencyChosen) return
        const remembered = readCurrencyChoice()
        const next = remembered ?? hints[0]?.currency
        if (next && currencies.some((info) => info.code === next)) setCurrency(next)
    }, [hints, currencies, currencyChosen])

    const chooseCurrency = (code: string) => {
        setCurrency(code)
        setCurrencyChosen(true)
        rememberCurrencyChoice(code)
        feedback('tick')
    }

    const closeDrawing = () => {
        setDrawingOpen(false)
        window.requestAnimationFrame(() => drawingSummaryRef.current?.focus())
    }

    /** The guess, until somebody overrules it with the grid below. */
    const shownEmblem = emblem ?? roomDoodleFor(name)

    const canSubmit = useMemo(
        () => name.trim().length > 0 && creatorName.trim().length > 0 && !pending,
        [name, creatorName, pending]
    )

    const submit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!canSubmit) return
        const state = await createRoom({ name, emoji: shownEmblem, currency, creatorName, template: prefill.template })
        if (state) router.push(`/r/${state.room.slug}?roster=1`)
    }

    return (
        <form onSubmit={submit} className="flex min-h-dvh flex-col pb-[max(2.5rem,env(safe-area-inset-bottom))]">
            <div className="flex items-end justify-between gap-3 px-4 pb-2 pt-6">
                <h1 className="text-h5">{t('title')}</h1>
                <CloseButton href="/app" label={t('back')} data-testid="close-create-room" />
            </div>

            <motion.div
                initial={motionAllowed ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={motionAllowed ? { type: 'spring', stiffness: 300, damping: 30 } : { duration: 0 }}
                data-motion-surface
                className="flex flex-col gap-3 px-4 pb-6 pt-2"
            >
                {/* Same receipt-like object as add expense: the primary value and
                    currency share the first line, supporting information lives
                    beneath it, and optional detail expands outside the card. */}
                <div data-testid="room-composer" className={composerSurfaceClassName()}>
                    <div className="flex min-w-0 items-center gap-2 px-3 py-2">
                        <label className="min-w-0 flex-1">
                            <span className="sr-only">{t('name')}</span>
                            <input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder={t('namePlaceholder')}
                                aria-label={t('name')}
                                maxLength={80}
                                autoFocus={prefill.name === undefined}
                                data-testid="room-name"
                                className={composerBareInputClassName('h-16 px-1 text-h5 font-extrabold')}
                            />
                        </label>
                        <div className={COMPOSER_CURRENCY_SLOT}>
                            <CurrencySelect
                                value={currency}
                                onChange={chooseCurrency}
                                currencies={currencies}
                                suggested={hints.map((hint) => hint.currency)}
                                variant="sm"
                                aria-label={t('currencyLabel')}
                                data-testid="room-currency"
                            />
                        </div>
                    </div>

                    <label className={composerRowClassName('block')}>
                        <span className="sr-only">{t('creatorName')}</span>
                        <input
                            value={creatorName}
                            onChange={(event) => setCreatorName(event.target.value)}
                            placeholder={t('creatorNamePlaceholder')}
                            aria-label={t('creatorName')}
                            maxLength={80}
                            autoFocus={prefill.name !== undefined}
                            data-testid="creator-name"
                            data-focus-contained
                            className={composerBareInputClassName('h-14 px-4 text-base font-bold md:text-sm')}
                        />
                    </label>

                    <button
                        ref={drawingSummaryRef}
                        type="button"
                        onClick={() => setDrawingOpen((current) => !current)}
                        aria-expanded={drawingOpen}
                        aria-controls={drawingOpen ? 'room-drawing-editor' : undefined}
                        aria-label={t('emojiGroup')}
                        data-testid="room-drawing-summary"
                        data-focus-contained
                        className={composerRowClassName(
                            'flex min-h-14 w-full items-center gap-3 rounded-b-lg px-4 text-left'
                        )}
                    >
                        <RoomEmblem value={shownEmblem} name={name} size={30} />
                        <span className="min-w-0 flex-1">
                            <span className="block text-h8">{t('emojiGroup')}</span>
                            <span className="block truncate text-xs text-grey-1">{t('emoji')}</span>
                        </span>
                        <Icon
                            name="chevron-down"
                            size={22}
                            className={drawingOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
                        />
                    </button>
                </div>

                {/* An invented ticker has no rate, so this room converts nothing. Said here, at the
                    pick, rather than as a warning later: it is a property of the choice. */}
                <p className="px-1 text-xs text-grey-1" data-testid="room-currency-hint">
                    {currencies.some((info) => info.code === currency)
                        ? t('currencyHint')
                        : t('currencyCustomHint', { code: currency })}
                </p>

                <AnimatePresence initial={false}>
                    {drawingOpen && (
                        <motion.section
                            id="room-drawing-editor"
                            data-testid="room-drawing-editor"
                            aria-label={t('emojiGroup')}
                            initial={motionAllowed ? { opacity: 0, height: 0 } : false}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={motionAllowed ? { opacity: 0, height: 0 } : undefined}
                            transition={motionAllowed ? { duration: 0.18, ease: 'easeOut' } : { duration: 0 }}
                            data-motion-surface
                            data-motion-collapse
                            onKeyDown={(event) => {
                                if (event.key !== 'Escape') return
                                event.preventDefault()
                                event.stopPropagation()
                                closeDrawing()
                            }}
                            className={composerSurfaceClassName()}
                        >
                            <div className="flex items-center justify-between gap-3 border-b border-dashed border-grey-1 px-3 py-2">
                                <h2 className="text-h8">{t('emoji')}</h2>
                                <button
                                    type="button"
                                    onClick={closeDrawing}
                                    aria-label={t('collapseDrawing')}
                                    data-testid="collapse-room-drawing"
                                    className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-transparent transition-transform hover:-translate-y-0.5 active:translate-y-[1px]"
                                >
                                    <Icon name="chevron-up" size={24} />
                                </button>
                            </div>
                            <div className="p-3">
                                <DoodlePicker
                                    value={shownEmblem}
                                    onChange={(next) => {
                                        setEmblem(next)
                                        closeDrawing()
                                        feedback('tick')
                                    }}
                                    onKeyboardChange={(next) => {
                                        setEmblem(next)
                                        feedback('tick')
                                    }}
                                />
                            </div>
                        </motion.section>
                    )}
                </AnimatePresence>

                {error && (
                    <p role="alert" className="text-sm font-bold text-error">
                        {error}
                    </p>
                )}

                <Button
                    type="submit"
                    variant="primary"
                    shadowSize="4"
                    disabled={!canSubmit}
                    loading={pending}
                    className="justify-center text-h6"
                    data-testid="create-room"
                >
                    {t('submit')}
                </Button>
            </motion.div>
        </form>
    )
}
