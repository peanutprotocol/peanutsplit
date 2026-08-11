import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Design system — Peanut Split',
    description: 'The code-derived Peanut Split design system and implementation audit.',
    robots: { index: false, follow: false },
}

export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
    return children
}
