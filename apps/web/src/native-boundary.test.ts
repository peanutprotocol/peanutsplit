/**
 * Source-level gates for the store app (ARCHITECTURE.md 3.2 in the native-app plan).
 *
 * - Capacitor code must stay behind `src/lib/native/capacitor/**`, reached through the one guarded
 *   dynamic import in `src/lib/native/host.ts`. An import anywhere else can pull the plugin code
 *   into the web bundle.
 * - The app has no `/r/<slug>` route (a static export cannot know the slugs), so in-app navigation
 *   to a room must go through `roomPath()`. A hand-built `/r/` path still works on web and silently
 *   breaks navigation in the app, so the only files allowed to build one are listed below with the
 *   reason they are safe.
 * - `NATIVE_ROUTES` (used by the link mapper) must list exactly the pages the export contains.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NATIVE_ROUTES } from '@/lib/native/links'

const WEB_ROOT = path.resolve(__dirname, '..')
const SRC = path.join(WEB_ROOT, 'src')
const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/
/** Tests build `/r/` URLs as inputs and expectations; they never navigate the app. */
const TEST_FILE = /\.test\.(?:ts|tsx)$/

/** Repo-relative (to apps/web), forward slashes, so messages and the allowlist read the same on every OS. */
const relative = (file: string): string => path.relative(WEB_ROOT, file).split(path.sep).join('/')

const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
        return SOURCE_FILE.test(entry.name) ? [full] : []
    })

/** `file:line  source` for every line that matches, so a failure points at the exact call site. */
const offendingLines = (files: string[], pattern: RegExp): string[] =>
    files.flatMap((file) =>
        readFileSync(file, 'utf8')
            .split('\n')
            .flatMap((line, index) => (pattern.test(line) ? [`${relative(file)}:${index + 1}  ${line.trim()}`] : []))
    )

// Built from parts so this file never matches its own patterns.
const CAPACITOR = '@' + 'capacitor/'
/** Static `import … from`, side-effect `import '…'`, `export … from`, dynamic `import()` and `require()`. */
const CAPACITOR_IMPORT = new RegExp(
    String.raw`(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"\x60]` + CAPACITOR.replace('/', '\\/')
)
const CAPACITOR_HOME = 'src/lib/native/capacitor/'

/** `` `/r/${ `` and `'/r/' +` (either quote style). */
const HAND_BUILT_ROOM_PATH = new RegExp(String.raw`\/r\/\$\{|['"]\/r\/['"]\s*\+`)

/**
 * The exact files that may build a `/r/` path, each for a reason that holds in the app.
 * Add a file here only with that reason; anything else uses `roomPath()` or `productUrl('/r/…')` in
 * one of these files.
 */
const ROOM_PATH_ALLOWLIST = new Set([
    // roomPath itself: the web branch builds the path.
    'src/lib/platform.ts',
    // productUrl('/r/…'): shared links stay canonical web URLs, from the app too.
    'src/components/room/LinkMoment.tsx',
    // productUrl copy and a display string, never navigation.
    'src/components/room/SettingsSheet.tsx',
    // recapPath is web-only (RECAP_AVAILABLE is false in the app); recapImagePath goes through apiUrl.
    'src/lib/recap.ts',
    // The server PNG path, fetched through apiUrl.
    'src/lib/achievements-contract.ts',
    // The PWA share target is not in the app.
    'src/components/pwa/ShareTarget.tsx',
    // Marketing pages are not in the app.
    'src/components/marketing/HeroCreateForm.tsx',
    // The web install handoff; the app never calls it (ARCHITECTURE.md 5.3).
    'src/lib/install-handoff.ts',
    // The server's link-preview image path, fetched through apiUrl for the prewarm, never navigated.
    'src/lib/room-preview.ts',
    // The Smart App Banner's app-argument is the canonical shared web link (web only, iOS Safari).
    'src/lib/store-app.ts',
])

/** Every page in `src/app/(native)`, as the route the export serves it under (trailing slash on). */
const nativePageRoutes = (): string[] => {
    const nativeDir = path.join(SRC, 'app', '(native)')
    return walk(nativeDir)
        .filter((file) => path.basename(file) === 'page.native.tsx')
        .map((file) => {
            const segments = path
                .relative(nativeDir, path.dirname(file))
                .split(path.sep)
                // Route groups such as `(x)` do not appear in the URL.
                .filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment))
            return segments.length === 0 ? '/' : `/${segments.join('/')}/`
        })
}

describe('native boundary', () => {
    it('imports Capacitor only inside src/lib/native/capacitor/**', () => {
        const files = walk(SRC).filter((file) => !relative(file).startsWith(CAPACITOR_HOME))
        expect(files.length).toBeGreaterThan(100)
        const offenders = offendingLines(files, CAPACITOR_IMPORT)
        expect(offenders, `Capacitor imported outside ${CAPACITOR_HOME}:\n${offenders.join('\n')}`).toEqual([])
    })

    it('builds /r/ room paths in components and lib only in the allowlisted files', () => {
        const files = [path.join(SRC, 'components'), path.join(SRC, 'lib')]
            .flatMap(walk)
            .filter((file) => !TEST_FILE.test(file) && !ROOM_PATH_ALLOWLIST.has(relative(file)))
        expect(files.length).toBeGreaterThan(100)
        const offenders = offendingLines(files, HAND_BUILT_ROOM_PATH)
        expect(
            offenders,
            `Hand-built /r/ paths; use roomPath() from src/lib/platform.ts:\n${offenders.join('\n')}`
        ).toEqual([])
    })

    it('keeps every allowlisted file in the tree, so the allowlist cannot go stale', () => {
        const present = new Set(walk(SRC).map(relative))
        expect([...ROOM_PATH_ALLOWLIST].filter((file) => !present.has(file))).toEqual([])
    })

    it('lists exactly the src/app/(native) pages in NATIVE_ROUTES', () => {
        expect([...NATIVE_ROUTES].sort()).toEqual(nativePageRoutes().sort())
    })

    it('recognises the patterns it guards against', () => {
        // Negative controls, so a regex typo cannot turn the gates above into no-ops.
        expect(CAPACITOR_IMPORT.test(`import { App } from '${CAPACITOR}app'`)).toBe(true)
        expect(CAPACITOR_IMPORT.test(`const m = await import("${CAPACITOR}share")`)).toBe(true)
        expect(CAPACITOR_IMPORT.test(`import '${CAPACITOR}core'`)).toBe(true)
        expect(CAPACITOR_IMPORT.test(`export * from '${CAPACITOR}app'`)).toBe(true)
        expect(CAPACITOR_IMPORT.test(`// see the ${CAPACITOR}app docs`)).toBe(false)
        expect(HAND_BUILT_ROOM_PATH.test('router.push(`/r/${slug}`)')).toBe(true)
        expect(HAND_BUILT_ROOM_PATH.test("router.push('/r/' + slug)")).toBe(true)
        expect(HAND_BUILT_ROOM_PATH.test('router.push(roomPath(slug))')).toBe(false)
    })
})
