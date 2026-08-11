'use client'

export default function SplitContentError({ reset }: { error: Error; reset: () => void }) {
    return (
        <main className="grid min-h-dvh place-items-center bg-background px-5 py-10 text-n-1">
            <section className="w-full max-w-md rounded-sm border border-n-1 bg-white p-6">
                <h1 className="text-h5">This guide could not be loaded</h1>
                <p className="mt-3 text-sm leading-6 text-grey-1">Please try the page again.</p>
                <button className="mt-5 underline underline-offset-2" type="button" onClick={reset}>
                    Try again
                </button>
            </section>
        </main>
    )
}
