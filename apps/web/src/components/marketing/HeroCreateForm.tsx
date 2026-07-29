'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { CurrencySelect } from '@/components/room/CurrencySelect'
import { DoodlePicker } from '@/components/room/DoodlePicker'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Doodle } from '@/components/ui/Doodle'
import type { DoodleName } from '@/components/ui/doodles'
import { trackLanding } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import { landingVariant, type LandingVariant } from '@/lib/flags'
import { useCurrencies } from '@/lib/queries'
import { roomDoodleFor } from '@/lib/room-doodle'
import { slugStem } from '@/lib/slugify'
import { readCurrencyChoice, rememberCurrencyChoice, useCurrencyHints } from '@/lib/use-currency-hint'
import { useCreateRoomFlow } from '@/lib/use-create-room'
import { useFeedback } from '@/lib/use-settings'
import { LinkExplainer } from './LinkExplainer'

/** The server-rendered seed only; the real default is the device's top hint (effect below). */
const DEFAULT_CURRENCY = 'EUR'

export interface HeroCreateFormProps {
    /** Controlled by the Pass-the-Link stage so the illustrative URL follows the real draft. */
    roomName?: string
    onRoomNameChange?: (name: string) => void
    /** Settles the decorative story before it can compete with a real interaction. */
    onInteraction?: () => void
    variant?: 'compact' | 'pass-link'
    analyticsVariant?: LandingVariant
}

/**
 * The landing hero's action is this real form. Pressing the button creates the room and opens
 * it; the live URL stem is the product demonstration, not a decorative mockup beside it.
 *
 * NO LABELS ABOVE FIELDS. "What are you splitting?" over an empty box is a caption on a thing
 * that could say it itself — two lines where one does, and on a 390px screen those stacked
 * captions are the difference between the button being above the fold and below it. The
 * question moved into the placeholder (`Ski trip…`), and stayed on the input as `aria-label`,
 * so nothing was lost for a screen reader.
 *
 * The URL preview is the point of the whole layout — proof that this works arrives inside the
 * keystrokes you were already making, rather than as a claim you have to take on faith. It is
 * also deliberately only half live. `slugStem` is the same function the server uses, so the
 * readable part is exact; the six-character tail is minted server-side with crypto randomness
 * because the slug is the room's credential, so it shows as dots until the room exists.
 * Inventing a tail here would be a promise the next screen breaks.
 *
 * The `(?)` beside it replaced an underlined "How the link works" — one drawn mark instead of a
 * third line of text, sitting on the thing it explains rather than under it.
 */
export function HeroCreateForm({
    roomName,
    onRoomNameChange,
    onInteraction,
    variant = 'compact',
    analyticsVariant = landingVariant(),
}: HeroCreateFormProps = {}) {
    const t = useTranslations('marketing.hero')
    const tCreate = useTranslations('room.create')
    const router = useRouter()
    const feedback = useFeedback()
    const { data: currencies } = useCurrencies()
    const hints = useCurrencyHints()
    const { submit, error, pending } = useCreateRoomFlow(tCreate('failed'))

    const [localName, setLocalName] = useState('')
    const [creatorName, setCreatorName] = useState('')
    const [validationField, setValidationField] = useState<'room' | 'creator' | null>(null)
    // null means "follow the name". The emblem used to be rolled at random after mount, which
    // needed an effect purely to dodge a hydration mismatch — a random value renders differently
    // on each side of it. Reading the name instead is both deterministic and better: it is right
    // far more often than one-in-sixteen.
    const [emblem, setEmblem] = useState<DoodleName | null>(null)
    const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
    const [currencyChosen, setCurrencyChosen] = useState(false)
    const [pickerOpen, setPickerOpen] = useState(false)
    const [explainerOpen, setExplainerOpen] = useState(false)
    const name = roomName ?? localName
    const startedRef = useRef(false)
    const exposedRef = useRef(false)

    useEffect(() => {
        if (exposedRef.current) return
        exposedRef.current = true
        trackLanding('landing_hero_exposed', analyticsVariant)
    }, [analyticsVariant])

    const registerInteraction = () => {
        onInteraction?.()
        if (startedRef.current) return
        startedRef.current = true
        trackLanding('landing_form_started', analyticsVariant)
    }

    const changeName = (next: string) => {
        if (roomName === undefined) setLocalName(next)
        onRoomNameChange?.(next)
        if (validationField === 'room') setValidationField(null)
    }

    /** Seeded after mount, not during render: `Intl` and `navigator` do not exist on the server.
     *  A guess may only fill an empty field — once someone picks, the inference stops talking. */
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

    const stem = useMemo(() => (name.trim() ? slugStem(name) : ''), [name])
    /** The guess, until somebody overrules it. Recomputed as you type, so the tile beside the
     *  name field turns into a pair of skis while you are still writing "Ski trip". */
    const shownEmblem = emblem ?? roomDoodleFor(name)

    /**
     * The button is never disabled, which is a deliberate reversal of what `/new` does.
     *
     * This one is the visual anchor of the whole page — it is what the yellow band is built
     * around — and a greyed-out primary action at the top of a landing page reads as a product
     * that is already broken, before anyone has typed a character. So it stays black and alive,
     * and an empty field sends the cursor to itself instead of refusing silently. Nothing can be
     * submitted half-filled either way; the difference is whether the page looks dead while you
     * read it.
     */
    const nameRef = useRef<HTMLInputElement>(null)
    const creatorRef = useRef<HTMLInputElement>(null)

    /** A `<details>` has no light-dismiss of its own, so the drawing grid stayed open over the
     *  form until it was toggled again — including while the person typed into the fields it
     *  was covering. Tapping anywhere outside closes it, which is what every other popover on
     *  the page already does. */
    const pickerRef = useRef<HTMLDetailsElement>(null)
    useEffect(() => {
        if (!pickerOpen) return
        const onPointerDown = (event: PointerEvent) => {
            if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [pickerOpen])

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (pending) return
        trackLanding('landing_creation_attempted', analyticsVariant)
        if (!name.trim()) {
            setValidationField('room')
            return nameRef.current?.focus()
        }
        if (!creatorName.trim()) {
            setValidationField('creator')
            return creatorRef.current?.focus()
        }
        setValidationField(null)
        const state = await submit({ name, emoji: shownEmblem, currency, creatorName })
        if (state) {
            trackLanding('landing_room_created', analyticsVariant)
            router.push(`/r/${state.room.slug}`)
        }
    }

    return (
        <form
            onSubmit={onSubmit}
            onFocusCapture={registerInteraction}
            onPointerDownCapture={registerInteraction}
            onKeyDownCapture={registerInteraction}
            className={cn(
                'shadow-primary-6 flex flex-col gap-3 rounded-sm border border-n-1 bg-white p-4',
                variant === 'compact' ? 'mt-6' : 'pass-link-form'
            )}
        >
            <div className="flex items-stretch gap-2">
                <BaseInput
                    ref={nameRef}
                    value={name}
                    onChange={(event) => changeName(event.target.value)}
                    placeholder={tCreate('namePlaceholder')}
                    aria-label={tCreate('name')}
                    aria-invalid={validationField === 'room' || undefined}
                    aria-describedby={validationField === 'room' ? 'hero-room-required' : undefined}
                    maxLength={80}
                    className="flex-1"
                    data-testid="hero-room-name"
                />

                {/* A details/summary rather than a popover library: one line tall when closed,
                    no JS, and it reuses the same curated picker `/new` uses. */}
                <details
                    ref={pickerRef}
                    open={pickerOpen}
                    onToggle={(event) => setPickerOpen((event.target as HTMLDetailsElement).open)}
                    className="relative"
                >
                    <summary
                        aria-label={tCreate('emoji')}
                        className="flex h-full cursor-pointer list-none items-center justify-center rounded-sm border border-n-1 bg-white px-3 [&::-webkit-details-marker]:hidden"
                    >
                        <Doodle name={shownEmblem} size={24} />
                    </summary>
                    <div className="shadow-4 absolute right-0 z-20 mt-2 w-64 rounded-sm border border-n-1 bg-white p-3">
                        <DoodlePicker
                            value={shownEmblem}
                            onChange={(next) => {
                                setEmblem(next)
                                feedback('tick')
                                setPickerOpen(false)
                            }}
                        />
                    </div>
                </details>
            </div>

            {validationField === 'room' && (
                <p id="hero-room-required" role="alert" className="text-sm font-bold text-error">
                    {t('validation.roomRequired')}
                </p>
            )}

            <div className="flex items-stretch gap-2">
                <BaseInput
                    ref={creatorRef}
                    value={creatorName}
                    onChange={(event) => {
                        setCreatorName(event.target.value)
                        if (validationField === 'creator') setValidationField(null)
                    }}
                    placeholder={tCreate('creatorNamePlaceholder')}
                    aria-label={tCreate('creatorName')}
                    aria-invalid={validationField === 'creator' || undefined}
                    aria-describedby={validationField === 'creator' ? 'hero-creator-required' : undefined}
                    maxLength={80}
                    className="flex-1"
                    data-testid="hero-creator-name"
                />
                <CurrencySelect
                    value={currency}
                    onChange={chooseCurrency}
                    currencies={currencies}
                    suggested={hints.map((hint) => hint.currency)}
                    aria-label={tCreate('currencyLabel')}
                    className="w-32 shrink-0"
                    data-testid="hero-currency"
                />
            </div>

            {validationField === 'creator' && (
                <p id="hero-creator-required" role="alert" className="text-sm font-bold text-error">
                    {t('validation.creatorRequired')}
                </p>
            )}

            {/* The stem is real and the tail is honest about not existing yet. */}
            <p className="flex items-center gap-1.5 font-mono text-xs leading-5 text-n-1">
                <span data-testid="hero-slug-preview">
                    peanutsplit.com/r/
                    <span className={stem ? '' : 'text-grey-1'}>{stem || tCreate('namePlaceholderSlug')}</span>
                    <span className="tracking-widest text-grey-1">-••••••</span>
                </span>
                <button
                    type="button"
                    onClick={() => setExplainerOpen(true)}
                    aria-label={t('linkExplainerTrigger')}
                    className="text-grey-1 transition-colors hover:text-n-1"
                    data-testid="hero-link-explainer"
                >
                    <Doodle name="question" size={17} weight={2.4} />
                </button>
            </p>

            {error && (
                <p role="alert" className="text-sm font-bold text-error">
                    {error}
                </p>
            )}

            {/* Yellow carries the product's primary-action language and stands out cleanly
                against the white composer card and pink landing background. */}
            <Button
                type="submit"
                variant="primary"
                shadowSize="4"
                loading={pending}
                className="justify-center text-h6"
                data-testid="hero-create-room"
            >
                <span>{t('cta')}</span>
                <Doodle name="iconarrowright" size={22} weight={2.2} />
            </Button>

            <LinkExplainer open={explainerOpen} onClose={() => setExplainerOpen(false)} />
        </form>
    )
}

export default HeroCreateForm
