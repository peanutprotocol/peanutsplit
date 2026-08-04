import type { ReactNode } from 'react'

interface RouteStateProps {
    eyebrow: string
    title: string
    body: string
    children?: ReactNode
    role?: 'alert' | 'status'
    testId: string
}

/** One restrained page-level fallback for public and app routes. Boundaries
 *  pass catalog copy only, never error objects, request paths or credentials. */
export function RouteState({ eyebrow, title, body, children, role, testId }: RouteStateProps) {
    return (
        <main className="grid min-h-dvh place-items-center bg-grey-3 px-4 py-10" data-testid={testId}>
            <section role={role} className="shadow-2 w-full max-w-md rounded-sm border border-n-1 bg-white p-6 sm:p-8">
                <p className="text-h9 uppercase tracking-wider text-grey-1">{eyebrow}</p>
                <h1 className="mt-2 text-h5">{title}</h1>
                <p className="mt-3 text-sm leading-6 text-grey-1">{body}</p>
                {children && <div className="mt-5 flex flex-wrap items-center gap-4">{children}</div>}
            </section>
        </main>
    )
}
