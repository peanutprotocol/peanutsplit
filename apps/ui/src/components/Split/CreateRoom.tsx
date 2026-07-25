'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { BaseInput } from '@/components/ui/BaseInput'
import { useCreateRoom, useCurrenciesQuery } from '@/hooks/query/split'
import { getRecentRooms, type RecentRoom } from '@/utils/split-identity'

export function CreateRoom() {
	const router = useRouter()
	const currenciesQ = useCurrenciesQuery()
	const createRoom = useCreateRoom()
	const [title, setTitle] = useState('')
	const [currency, setCurrency] = useState('USD')
	const [recent, setRecent] = useState<RecentRoom[]>([])

	useEffect(() => setRecent(getRecentRooms()), [])

	const create = async () => {
		if (createRoom.isPending) return
		const state = await createRoom.mutateAsync({ title: title.trim() || undefined, baseCurrency: currency })
		router.push(`/room/${state.slug}`)
	}

	const currencies = currenciesQ.data ?? []

	return (
		<div className="min-h-screen bg-peanut-repeat-normal">
			<div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 bg-white/90 p-6">
				<div className="text-center">
					<div className="text-3xl font-extrabold text-n-1">Split a trip 🥜</div>
					<div className="mt-1 text-grey-1">Make a room, share the link, split as you go. No signup.</div>
				</div>

				<div className="flex flex-col gap-3 rounded-sm border border-n-1 bg-white p-5 shadow-[4px_4px_0_0_#000]">
					<label className="flex flex-col gap-1">
						<span className="text-sm font-semibold text-grey-1">What are you splitting?</span>
						<BaseInput
							placeholder="Sailing trip"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							onKeyDown={(e) => e.key === 'Enter' && create()}
							maxLength={255}
							autoFocus
						/>
					</label>
					<label className="flex flex-col gap-1">
						<span className="text-sm font-semibold text-grey-1">Main currency</span>
						<select
							className="input h-12 px-3"
							value={currency}
							onChange={(e) => setCurrency(e.target.value)}
						>
							{currencies.map((c) => (
								<option key={c.code} value={c.code}>
									{c.code} — {c.name}
								</option>
							))}
						</select>
					</label>
					{createRoom.isError && (
						<div className="text-sm text-red">Couldn’t create the room — try again.</div>
					)}
					<Button
						variant="purple"
						shadowSize="4"
						className="w-full"
						loading={createRoom.isPending}
						onClick={create}
					>
						Create room
					</Button>
				</div>

				{recent.length > 0 && (
					<div className="flex flex-col gap-2">
						<div className="text-sm font-semibold text-grey-1">Your recent rooms</div>
						{recent.map((r) => (
							<button
								key={r.slug}
								onClick={() => router.push(`/room/${r.slug}`)}
								className="rounded-sm border border-n-1 bg-white px-4 py-3 text-left font-semibold text-n-1 hover:bg-primary-3/40"
							>
								{r.title || 'Untitled room'}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
