import { RoomView } from '@/components/Split/RoomView'

export const metadata = {
	title: 'Split room · Peanut',
}

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params
	return <RoomView slug={slug} />
}
