import type { Metadata, Viewport } from 'next'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
	title: 'Peanut Split — split expenses with a link',
	description: 'Share a link, split the bill, settle up. No accounts, no sign-up, any currency.',
}

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body className="min-h-dvh">
				<Providers>{children}</Providers>
			</body>
		</html>
	)
}
