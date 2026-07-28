'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { CurrencySelect } from '@/components/room/CurrencySelect'
import { EmojiPicker, ROOM_EMOJIS, randomRoomEmoji } from '@/components/room/EmojiPicker'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { useCurrencies } from '@/lib/queries'
import { slugStem } from '@/lib/slugify'
import { readCurrencyChoice, rememberCurrencyChoice, useCurrencyHints } from '@/lib/use-currency-hint'
import { useCreateRoomFlow } from '@/lib/use-create-room'
import { useFeedback } from '@/lib/use-settings'
import { LinkExplainer } from './LinkExplainer'

/** The server-rendered seed only; the real default is the device's top hint (effect below). */
const DEFAULT_CURRENCY = 'EUR'

/**
 * The landing hero IS the form. There is no pitch above it and no second screen below it:
 * pressing the button creates the room and opens it, which is what lets the button honestly
 * say "Open it".
 *
 * The URL preview is the point of the whole layout — proof that this works arrives inside the
 * keystrokes you were already making, rather than as a claim you have to take on faith. It is
 * also deliberately only half live. `slugStem` is the same function the server uses, so the
 * readable part is exact; the six-character tail is minted server-side with crypto randomness
 * because the slug is the room's credential, so it shows as dots until the room exists.
 * Inventing a tail here would be a promise the next screen breaks.
 */
export function HeroCreateForm() {
    const t = useTranslations('marketing.hero')
    const tCreate = useTranslations('room.create')
    const router = useRouter()
    const feedback = useFeedback()
    const { data: currencies } = useCurrencies()
    const hints = useCurrencyHints()
    const { submit, error, pending } = useCreateRoomFlow(tCreate('failed'))

    const [name, setName] = useState('')
    const [creatorName, setCreatorName] = useState('')
    // Rolled after mount: seeding with Math.random() renders a different emoji on each side of
    // hydration, which React flags and then refuses to patch up.
    const [emoji, setEmoji] = useState<string>(ROOM_EMOJIS[0])
    const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
    const [currencyChosen, setCurrencyChosen] = useState(false)
    const [emojiOpen, setEmojiOpen] = useState(false)
    const [explainerOpen, setExplainerOpen] = useState(false)

    useEffect(() => setEmoji(randomRoomEmoji()), [])

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
    const canSubmit = name.trim().length > 0 && creatorName.trim().length > 0 && !pending

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!canSubmit) return
        const state = await submit({ name, emoji, currency, creatorName })
        if (state) router.push(`/r/${state.room.slug}`)
    }

    return (
        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
            <div className="flex items-stretch gap-2">
                <BaseInput
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={tCreate('namePlaceholder')}
                    aria-label={tCreate('name')}
                    maxLength={80}
                    className="flex-1"
                    data-testid="hero-room-name"
                />

                {/* A details/summary rather than a popover library: one line tall when closed,
                    no JS, and it reuses the same curated picker `/new` uses. */}
                <details
                    open={emojiOpen}
                    onToggle={(event) => setEmojiOpen((event.target as HTMLDetailsElement).open)}
                    className="relative"
                >
                    <summary
                        aria-label={tCreate('emoji')}
                        className="flex h-full cursor-pointer list-none items-center justify-center rounded-sm border border-n-1 bg-white px-3 text-xl [&::-webkit-details-marker]:hidden"
                    >
                        {emoji}
                    </summary>
                    <div className="shadow-4 absolute right-0 z-20 mt-2 w-64 rounded-sm border border-n-1 bg-white p-3">
                        <EmojiPicker
                            value={emoji}
                            onChange={(next) => {
                                setEmoji(next)
                                feedback('tick')
                                setEmojiOpen(false)
                            }}
                        />
                    </div>
                </details>
            </div>

            <div className="flex items-stretch gap-2">
                <BaseInput
                    value={creatorName}
                    onChange={(event) => setCreatorName(event.target.value)}
                    placeholder={tCreate('creatorNamePlaceholder')}
                    aria-label={tCreate('creatorName')}
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

            {/* The stem is real and the tail is honest about not existing yet. */}
            <p className="font-mono text-xs leading-5 text-n-1" data-testid="hero-slug-preview">
                peanutsplit.com/r/
                <span className={stem ? '' : 'text-grey-1'}>{stem || tCreate('namePlaceholderSlug')}</span>
                <span className="tracking-widest text-grey-1">-••••••</span>
            </p>

            <button
                type="button"
                onClick={() => setExplainerOpen(true)}
                className="self-start text-left text-sm text-n-1 underline underline-offset-2"
                data-testid="hero-link-explainer"
            >
                {t('linkExplainerTrigger')}
            </button>

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
                data-testid="hero-create-room"
            >
                {t('cta')}
            </Button>
            <p className="text-center text-sm text-grey-1">{t('ctaHint')}</p>

            <LinkExplainer open={explainerOpen} onClose={() => setExplainerOpen(false)} />
        </form>
    )
}

export default HeroCreateForm
