import Link from 'next/link'
import { Doodle } from '@/components/ui/Doodle'

const links = [
    { href: '/dev-ds', label: 'System' },
    { href: '/dev-ds/audit', label: 'Audit picker' },
] as const

export function DocChrome({ children, page }: { children: React.ReactNode; page: 'system' | 'audit' }) {
    return (
        <main className="min-h-dvh bg-background text-n-1">
            <header className="sticky top-0 z-40 border-b border-n-1 bg-primary-1">
                <div className="mx-auto flex min-h-16 max-w-[90rem] items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
                    <Link href="/dev-ds" className="flex items-center gap-2 font-display text-xl font-extrabold">
                        <Doodle name="peanut" size={30} weight={1.8} />
                        <span>Split / system</span>
                    </Link>
                    <nav aria-label="Design system">
                        <ul className="shadow-2 flex items-center gap-1 rounded-sm border border-n-1 bg-white p-1">
                            {links.map((link) => {
                                const active = page === (link.href.endsWith('audit') ? 'audit' : 'system')
                                return (
                                    <li key={link.href}>
                                        <Link
                                            href={link.href}
                                            aria-current={active ? 'page' : undefined}
                                            className={`flex min-h-11 items-center rounded-sm px-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                                                active ? 'bg-n-1 text-white' : 'hover:bg-primary-3'
                                            }`}
                                        >
                                            {link.label}
                                        </Link>
                                    </li>
                                )
                            })}
                        </ul>
                    </nav>
                </div>
            </header>
            {children}
            <footer className="border-t border-n-1 bg-white">
                <div className="mx-auto flex max-w-[90rem] flex-col gap-2 px-4 py-8 text-sm text-grey-1 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
                    <p>Code-derived on 3 August 2026. Canonical implementation always wins over this description.</p>
                    <p className="font-bold text-n-1">Peanut Split · internal engineering reference</p>
                </div>
            </footer>
        </main>
    )
}

export function Section({
    id,
    eyebrow,
    title,
    intro,
    children,
}: {
    id: string
    eyebrow: string
    title: string
    intro?: string
    children: React.ReactNode
}) {
    return (
        <section id={id} className="scroll-mt-24 border-t border-n-1 py-12 first:border-t-0 sm:py-16">
            <div className="mb-8 max-w-3xl">
                <p className="mb-2 text-h9 uppercase tracking-[0.18em] text-grey-1">{eyebrow}</p>
                <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
                {intro ? <p className="mt-3 text-base leading-7 text-grey-1 sm:text-lg">{intro}</p> : null}
            </div>
            {children}
        </section>
    )
}

export function Specimen({
    title,
    note,
    children,
    className = '',
}: {
    title: string
    note?: string
    children: React.ReactNode
    className?: string
}) {
    return (
        <article className={`shadow-2 overflow-hidden rounded-sm border border-n-1 bg-white ${className}`}>
            <div className="border-b border-n-1 bg-primary-3 px-4 py-3">
                <h3 className="text-h7">{title}</h3>
                {note ? <p className="mt-1 text-sm leading-5 text-grey-1">{note}</p> : null}
            </div>
            <div className="p-4 sm:p-5">{children}</div>
        </article>
    )
}

export function RuleList({ children }: { children: React.ReactNode }) {
    return <ul className="space-y-3 text-sm leading-6 text-grey-1 marker:text-n-1">{children}</ul>
}

export function Rule({ children }: { children: React.ReactNode }) {
    return <li className="ml-5 list-disc pl-1">{children}</li>
}

export function Code({ children }: { children: React.ReactNode }) {
    return <code className="rounded bg-grey-4 px-1.5 py-0.5 font-mono text-[0.8em] text-n-1">{children}</code>
}
