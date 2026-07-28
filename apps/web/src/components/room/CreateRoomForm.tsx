'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import { readCurrencyChoice, rememberCurrencyChoice, useCurrencyHints } from '@/lib/use-currency-hint'
import { currencyDisplayName } from '@/lib/money'
import { useCurrencies } from '@/lib/queries'
import { useCreateRoomFlow } from '@/lib/use-create-room'
import { useFeedback } from '@/lib/use-settings'
import { CurrencySelect } from './CurrencySelect'
import { CurrencyTag } from './CurrencyTag'
import { EmojiPicker, ROOM_EMOJIS, randomRoomEmoji } from './EmojiPicker'
import { LinkMoment } from './LinkMoment'

/** The server-rendered seed only. The real default is the device's top hint, which cannot be
 *  known until after mount — see the effect below. */
const DEFAULT_CURRENCY = 'EUR'

/**
 * One screen, three fields, no account. The moment it succeeds the screen turns
 * into the link hand-off — creating a room and getting the link are the same
 * gesture, not two steps.
 */
export function CreateRoomForm() {
    const t = useTranslations('room.create')
    const tCurrency = useTranslations('room.currency')
    const locale = useLocale()
    const router = useRouter()
    const { data: currencies } = useCurrencies()
    const { submit: createRoom, created, error, pending } = useCreateRoomFlow(t('failed'))
    const hints = useCurrencyHints()

    const feedback = useFeedback()

    const [name, setName] = useState('')
    // Server-rendered with the peanut, then rolled on mount. Seeding the state
    // with `Math.random()` renders a different emoji on each side of hydration,
    // which React flags and then refuses to patch up.
    const [emoji, setEmoji] = useState<string>(ROOM_EMOJIS[0])
    const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
    // A guess is only ever allowed to fill an empty field. The moment someone picks a currency
    // themselves, the inference is done talking — a hint that overwrites a deliberate choice is
    // not smart, it is broken.
    const [currencyChosen, setCurrencyChosen] = useState(false)
    const [creatorName, setCreatorName] = useState('')

    useEffect(() => setEmoji(randomRoomEmoji()), [])

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

    const canSubmit = useMemo(
        () => name.trim().length > 0 && creatorName.trim().length > 0 && !pending,
        [name, creatorName, pending]
    )

    const submit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!canSubmit) return
        await createRoom({ name, emoji, currency, creatorName })
    }

    if (created) {
        return (
            <div className="flex min-h-dvh flex-col justify-center px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-10">
                <LinkMoment
                    slug={created.room.slug}
                    roomName={created.room.name}
                    emoji={created.room.emoji}
                    title={t('readyTitle')}
                    subtitle={t('readySubtitle')}
                    footer={
                        <Button
                            variant="stroke"
                            className="justify-center"
                            onClick={() => router.push(`/r/${created.room.slug}`)}
                            data-testid="go-to-room"
                        >
                            {t('goToRoom')}
                        </Button>
                    }
                />
            </div>
        )
    }

    return (
        <form
            onSubmit={submit}
            className="flex min-h-dvh flex-col gap-8 px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-6"
        >
            <div className="flex items-center gap-3">
                <Link
                    href="/"
                    aria-label={t('back')}
                    className="flex size-11 items-center justify-center rounded-sm border border-n-1 bg-white transition-transform active:translate-y-[2px]"
                >
                    <Icon name="arrow-left" size={20} />
                </Link>
                <h1 className="text-h5">{t('title')}</h1>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="my-auto flex flex-col gap-6"
            >
                {/* The question lives in the placeholder, not in a caption above the box. A
                    label that only restates what the empty field already asks costs a line of
                    vertical space per field, and four of those is what used to push the submit
                    button off a 390px screen. It survives as `aria-label`, so a screen reader
                    hears the same question a sighted user reads inside the box. */}
                <BaseInput
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('namePlaceholder')}
                    aria-label={t('name')}
                    maxLength={80}
                    autoFocus
                    data-testid="room-name"
                />

                <div className="flex flex-col gap-2">
                    <span className="text-h8 uppercase tracking-wide text-grey-1">{t('emoji')}</span>
                    <EmojiPicker
                        value={emoji}
                        onChange={(next) => {
                            setEmoji(next)
                            feedback('tick')
                        }}
                    />
                </div>

                {/* A div rather than a label, like the emoji block: the suggestion chips are
                    interactive content, and burying buttons inside a label is asking for a click
                    to be forwarded to the select instead. The select carries its own aria-label. */}
                <div className="flex flex-col gap-2">
                    <span className="text-h8 uppercase tracking-wide text-grey-1">{t('currency')}</span>
                    {/* The guess, offered rather than applied silently. One tap is cheaper than
                        opening the picker, and seeing the alternatives is how you notice the top
                        one is wrong for this particular trip. */}
                    {hints.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-h9 uppercase tracking-wide text-grey-1">
                                {tCurrency('suggested')}
                            </span>
                            {hints.map((hint) => (
                                <button
                                    key={hint.currency}
                                    type="button"
                                    onClick={() => chooseCurrency(hint.currency)}
                                    aria-pressed={currency === hint.currency}
                                    aria-label={tCurrency('useSuggestion', {
                                        name: currencyDisplayName(hint.currency, locale, currencies),
                                    })}
                                    data-testid="currency-suggestion"
                                    data-currency={hint.currency}
                                    className={cn(
                                        'flex min-h-11 items-center rounded-sm border border-n-1 px-3 py-2 transition-all duration-100',
                                        currency === hint.currency
                                            ? 'shadow-4 bg-primary-1'
                                            : 'bg-white active:translate-x-[2px] active:translate-y-[2px]'
                                    )}
                                >
                                    <CurrencyTag code={hint.currency} catalog={currencies} />
                                </button>
                            ))}
                        </div>
                    )}
                    <CurrencySelect
                        value={currency}
                        onChange={chooseCurrency}
                        currencies={currencies}
                        suggested={hints.map((hint) => hint.currency)}
                        aria-label={t('currencyLabel')}
                        data-testid="room-currency"
                    />
                    <span className="text-sm text-grey-1">{t('currencyHint')}</span>
                </div>

                <BaseInput
                    value={creatorName}
                    onChange={(event) => setCreatorName(event.target.value)}
                    placeholder={t('creatorNamePlaceholder')}
                    aria-label={t('creatorName')}
                    maxLength={80}
                    data-testid="creator-name"
                />

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
