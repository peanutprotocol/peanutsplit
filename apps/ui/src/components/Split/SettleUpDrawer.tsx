'use client'

import { useMemo, useState } from 'react'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { MemberAvatar } from './MemberAvatar'
import { useRecordSettlement, useCreateSettleIntent } from '@/hooks/query/split'
import { formatMoney, type CurrencyMap } from '@/utils/split-format'
import type { RoomState, SplitTransfer } from '@/services/split.types'
import { track, attribution } from '@/services/analytics'

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	room: RoomState
	currencyMap: CurrencyMap
}

/** Small, fast, non-cryptographic hash — this only needs to distinguish the
 *  handful of transfers in one room, not resist anything. */
function fnv1a(input: string): string {
	let h = 2166136261
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	return (h >>> 0).toString(36)
}

export function SettleUpDrawer({ open, onOpenChange, room, currencyMap }: Props) {
	const settle = useRecordSettlement(room.slug)
	const startPeanutPayment = useCreateSettleIntent(room.slug)
	const byId = Object.fromEntries(room.members.map((m) => [m.id, m]))

	// Which transfer already has a payment in flight. From the room snapshot, so
	// it holds across devices and survives the paying tab being closed.
	//
	// Matched on the amount too, not just the pair: anyone with the room link
	// can open an intent, and matching loosely would let a one-cent handoff
	// blank out the real settle button for two other people.
	const pendingFor = (t: SplitTransfer) =>
		room.pendingSettleIntents.find(
			(i) => i.fromMemberId === t.fromMemberId && i.toMemberId === t.toMemberId && i.amountMinor === t.amountMinor
		)

	// Until the currency list loads, formatMoney assumes two decimals — a JPY
	// room would render its amount 100x off. Fine on a label, not on a button
	// that sends someone to pay that figure.
	const canPay = Object.keys(currencyMap).length > 0

	const [error, setError] = useState<string | null>(null)
	// Which row is mid-action. The mutation's own isPending is shared across
	// every row, so using it would spin all the buttons at once.
	const [busyKey, setBusyKey] = useState<string | null>(null)
	const rowKey = (t: SplitTransfer) => `${t.fromMemberId}:${t.toMemberId}:${t.amountMinor}`

	const payWithPeanut = async (t: SplitTransfer) => {
		// The number the whole project is judged on starts here.
		track('settle_with_peanut_clicked', { source: attribution() })
		setError(null)
		setBusyKey(rowKey(t))
		// The tab is opened synchronously, before the await: browsers only allow
		// a popup while a click is still being handled, so opening it after the
		// request returns gets blocked.
		const tab = window.open('', '_blank')
		try {
			const { payUrl } = await startPeanutPayment.mutateAsync({
				fromMemberId: t.fromMemberId,
				toMemberId: t.toMemberId,
				amountMinor: t.amountMinor,
			})
			if (tab) tab.location.href = payUrl
			else window.location.href = payUrl // popup blocked — go in this tab instead
		} catch (err) {
			// Without this the user saw a blank tab flash open and shut, and no
			// explanation at all.
			tab?.close()
			setError(err instanceof Error ? err.message : 'Could not start that payment. Try again.')
		} finally {
			setBusyKey(null)
		}
	}

	const markManually = (t: SplitTransfer) => {
		track('settle_marked_manually', { source: attribution() })
		setError(null)
		setBusyKey(rowKey(t))
		settle.mutate(
			{
				fromMemberId: t.fromMemberId,
				toMemberId: t.toMemberId,
				amountMinor: t.amountMinor,
				method: 'MANUAL',
				idempotencyKey: settleKeyFor(t),
			},
			{
				onError: (err) => setError(err instanceof Error ? err.message : 'Could not record that. Try again.'),
				onSettled: () => setBusyKey(null),
			}
		)
	}

	// One nonce per time the drawer is opened, and the key is derived from it
	// plus the transfer's own content.
	//
	// Keying off array position instead would depend on room.suggestedTransfers
	// keeping its object identity across the 8-second poll — if the query's
	// structural sharing ever stopped preserving it, the keys would silently
	// regenerate on every tick and the double-tap guard would quietly become
	// decorative. Content plus a session nonce doesn't rely on that: the key is
	// stable for as long as the drawer is open, and a genuine later payment of
	// the same amount to the same person gets a new nonce and is recorded.
	const sessionNonce = useMemo(() => (open ? crypto.randomUUID() : ''), [open])
	// Hashed, not concatenated: two member UUIDs plus a nonce is well over the
	// column's 64 characters, and truncating would make two transfers from the
	// same person collide — silently swallowing one of the two payments.
	const settleKeyFor = (t: SplitTransfer) =>
		`${sessionNonce}:${fnv1a(`${t.fromMemberId}|${t.toMemberId}|${t.amountMinor}`)}`

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle className="text-xl font-extrabold text-n-1">Settle up</DrawerTitle>
				</DrawerHeader>

				<div className="flex flex-col gap-3 px-4 pb-6">
					{room.suggestedTransfers.length === 0 ? (
						<div className="py-8 text-center text-lg font-semibold text-n-1">You’re all settled up 🥜</div>
					) : (
						<>
							<p className="text-sm text-grey-1">
								The fewest payments to square everyone up — so some of these may be to someone you
								didn&apos;t spend with directly. Pay with Peanut and it confirms itself; pay any other
								way and mark it here.
							</p>
							{error && (
								<div
									role="alert"
									className="rounded-sm border border-n-1 bg-white p-3 text-sm font-semibold text-red"
								>
									{error}
								</div>
							)}
							{room.suggestedTransfers.map((t, i) => {
								const from = byId[t.fromMemberId]
								const to = byId[t.toMemberId]
								if (!from || !to) return null
								const pending = pendingFor(t)
								const amount = formatMoney(t.amountMinor, room.baseCurrency, currencyMap)
								return (
									<div
										key={i}
										className="flex flex-col gap-3 rounded-sm border border-n-1 bg-white p-4"
									>
										<div className="flex items-center gap-2">
											{/* names truncate; the amount stays pinned + fully visible (never clipped) */}
											<div className="flex min-w-0 flex-1 items-center gap-1.5">
												<MemberAvatar
													name={from.displayName}
													colorSeed={from.colorSeed}
													size={30}
												/>
												<span className="min-w-0 truncate font-semibold text-n-1">
													{from.displayName}
												</span>
												<span className="shrink-0 text-grey-1">pays</span>
												<MemberAvatar
													name={to.displayName}
													colorSeed={to.colorSeed}
													size={30}
												/>
												<span className="min-w-0 truncate font-semibold text-n-1">
													{to.displayName}
												</span>
											</div>
											<span className="shrink-0 whitespace-nowrap text-lg font-extrabold text-n-1">
												{formatMoney(t.amountMinor, room.baseCurrency, currencyMap)}
											</span>
										</div>
										{pending ? (
											<div className="rounded-sm border border-dashed border-n-1 bg-primary-3 p-3 text-center text-sm font-semibold text-n-1">
												Waiting for Peanut to confirm this payment…
												<span className="mt-1 block font-normal text-grey-1">
													It lands here on its own. Don&apos;t pay twice.
												</span>
											</div>
										) : (
											<>
												<Button
													variant="purple"
													shadowSize="4"
													className="w-full"
													disabled={!canPay}
													loading={busyKey === rowKey(t) && startPeanutPayment.isPending}
													onClick={() => payWithPeanut(t)}
												>
													Settle {amount} with Peanut
												</Button>
												<Button
													variant="stroke"
													size="medium"
													className="w-full"
													loading={busyKey === rowKey(t) && settle.isPending}
													onClick={() => markManually(t)}
												>
													I paid another way
												</Button>
											</>
										)}
									</div>
								)
							})}
						</>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	)
}
