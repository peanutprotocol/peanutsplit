import { apiUrl } from '../platform'

/**
 * Debug-build check that the API answers this origin's CORS request (ARCHITECTURE 14.3). The
 * emulator and simulator smokes print the line; it reads `blocked` until the server-prep PR is
 * live on production. NativeShell calls it only when NEXT_PUBLIC_SPLIT_CORS_SELFTEST is '1', which
 * only the native.yml export job sets, so release builds never contain the call.
 *
 * Any response proves the browser let the app read it, so the status is reported but does not
 * decide the verdict. A CORS refusal surfaces as a rejected fetch.
 */
export function runCorsSelfTest(): void {
    void fetch(apiUrl('/api/currencies'), { cache: 'no-store' }).then(
        (response) => console.info(`SPLIT_CORS ok (HTTP ${response.status})`),
        (error: unknown) =>
            console.info(`SPLIT_CORS blocked (${error instanceof Error ? error.message : 'fetch failed'})`)
    )
}
