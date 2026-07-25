import { redirect } from 'next/navigation'

// split.peanut.me serves rooms only — the marketing site lives on
// peanutsplit.com, so the bare origin goes straight to room creation.
export default function Home() {
	redirect('/room')
}
