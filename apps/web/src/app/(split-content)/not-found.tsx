export default function SplitContentNotFound() {
    return (
        <main className="grid min-h-dvh place-items-center bg-background px-5 py-10 text-n-1">
            <section className="w-full max-w-md rounded-sm border border-n-1 bg-white p-6">
                <h1 className="text-h5">This Split guide could not be found</h1>
                <p className="mt-3 text-sm leading-6 text-grey-1">
                    The link may be incomplete or the guide may have moved.
                </p>
                <a className="mt-5 inline-block underline underline-offset-2" href="https://peanut.me">
                    Back to Peanut
                </a>
            </section>
        </main>
    )
}
