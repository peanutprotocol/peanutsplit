'use client'

import { useMemo } from 'react'
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

export function SettleUpDrawer({ open, onOpenChange, room, currencyMap }: Props) {
	const settle = useRecordSettlement(room.slug)
	const startPeanutPayment = useCreateSettleIntent(room.slug)
	const byId = Object.fromEntries(room.members.map((m) => [m.id, m]))

	// Which pair already has a payment in flight. Comes from the room snapshot,
	// so it holds across devices and survives the paying tab being closed.
	const pendingFor = (fromMemberId: string, toMemberId: string) =>
		room.pendingSettleIntents.find((i) => i.fromMemberId === fromMemberId && i.toMemberId === toMemberId)

	// Until the currency list loads, formatMoney assumes two decimals — a JPY
	// room would render its amount 100x off. Fine on a label, not on a button
	// that sends someone to pay that figure.
	const canPay = Object.keys(currencyMap).length > 0

	const payWithPeanut = async (t: SplitTransfer) => {
		// The number the whole project is judged on starts here.
		track('settle_with_peanut_clicked', { source: attribution() })
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
		} catch {
			tab?.close()
		}
	}

	// One key per suggested transfer, regenerated whenever the suggestions
	// change. Re-firing the same button sends the same key so the server drops
	// the duplicate, while a genuine later payment of the same amount between
	// the same two people gets a fresh key and is recorded.
	const settleKeys = useMemo(() => room.suggestedTransfers.map(() => crypto.randomUUID()), [room.suggestedTransfers])

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
							{room.suggestedTransfers.map((t, i) => {
								const from = byId[t.fromMemberId]
								const to = byId[t.toMemberId]
								if (!from || !to) return null
								const pending = pendingFor(t.fromMemberId, t.toMemberId)
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
													loading={startPeanutPayment.isPending}
													onClick={() => payWithPeanut(t)}
												>
													Settle {amount} with Peanut
												</Button>
												<Button
													variant="stroke"
													size="medium"
													className="w-full"
													loading={settle.isPending}
													onClick={() => {
														track('settle_marked_manually', { source: attribution() })
														settle.mutate({
															fromMemberId: t.fromMemberId,
															toMemberId: t.toMemberId,
															amountMinor: t.amountMinor,
															method: 'MANUAL',
															idempotencyKey: settleKeys[i],
														})
													}}
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
