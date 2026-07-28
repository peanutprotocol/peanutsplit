'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { roomProps, track } from '@/lib/analytics'
import type { RoomStateWithMember } from '@/lib/api-types'
import { useErrorMessage } from '@/lib/error-messages'
import { writeIdentity } from '@/lib/identity'
import { useCreateRoom, useCurrencies } from '@/lib/queries'
import { rememberRoom } from '@/lib/recent-rooms'
import { useFeedback } from '@/lib/use-settings'
import { CurrencySelect } from './CurrencySelect'
import { EmojiPicker, ROOM_EMOJIS, randomRoomEmoji } from './EmojiPicker'
import { LinkMoment } from './LinkMoment'

const DEFAULT_CURRENCY = 'EUR'

/**
 * One screen, three fields, no account. The moment it succeeds the screen turns
 * into the link hand-off — creating a room and getting the link are the same
 * gesture, not two steps.
 */
export function CreateRoomForm() {
    const t = useTranslations('room.create')
    const errorMessage = useErrorMessage()
    const router = useRouter()
    const { data: currencies } = useCurrencies()
    const createRoom = useCreateRoom()

    const feedback = useFeedback()

    const [name, setName] = useState('')
    // Server-rendered with the peanut, then rolled on mount. Seeding the state
    // with `Math.random()` renders a different emoji on each side of hydration,
    // which React flags and then refuses to patch up.
    const [emoji, setEmoji] = useState<string>(ROOM_EMOJIS[0])
    const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
    const [creatorName, setCreatorName] = useState('')
    const [created, setCreated] = useState<RoomStateWithMember | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => setEmoji(randomRoomEmoji()), [])

    const canSubmit = useMemo(
        () => name.trim().length > 0 && creatorName.trim().length > 0 && !createRoom.isPending,
        [name, creatorName, createRoom.isPending]
    )

    const submit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!canSubmit) return
        setError(null)
        try {
            const state = await createRoom.mutateAsync({
                name: name.trim(),
                emoji,
                currency,
                creatorName: creatorName.trim(),
            })
            // The token is returned exactly once — store it before anything else
            // can throw, or this device permanently loses its attribution.
            writeIdentity(state.room.slug, {
                memberId: state.memberId,
                token: state.memberToken,
                name: creatorName.trim(),
            })
            rememberRoom({ slug: state.room.slug, name: state.room.name, emoji: state.room.emoji ?? undefined })
            track('room_created', roomProps(state.room.slug, { currency: state.room.currency }))
            // A room came into being — the cork, not the pencil.
            feedback('pop')
            setCreated(state)
        } catch (err) {
            setError(errorMessage(err, t('failed')))
        }
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
                <label className="flex flex-col gap-2">
                    <span className="text-h8 uppercase tracking-wide text-grey-1">{t('name')}</span>
                    <BaseInput
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t('namePlaceholder')}
                        maxLength={80}
                        autoFocus
                        data-testid="room-name"
                    />
                </label>

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

                <label className="flex flex-col gap-2">
                    <span className="text-h8 uppercase tracking-wide text-grey-1">{t('currency')}</span>
                    <CurrencySelect
                        value={currency}
                        onChange={setCurrency}
                        currencies={currencies}
                        aria-label={t('currencyLabel')}
                        data-testid="room-currency"
                    />
                    <span className="text-sm text-grey-1">{t('currencyHint')}</span>
                </label>

                <label className="flex flex-col gap-2">
                    <span className="text-h8 uppercase tracking-wide text-grey-1">{t('creatorName')}</span>
                    <BaseInput
                        value={creatorName}
                        onChange={(event) => setCreatorName(event.target.value)}
                        placeholder={t('creatorNamePlaceholder')}
                        maxLength={80}
                        data-testid="creator-name"
                    />
                </label>

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
                    loading={createRoom.isPending}
                    className="justify-center text-h6"
                    data-testid="create-room"
                >
                    {t('submit')}
                </Button>
            </motion.div>
        </form>
    )
}
