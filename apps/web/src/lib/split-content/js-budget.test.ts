import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * A static TypeScript import-graph walk (fun-engine.md S2, Invariant #3: "article pages that
 * declare no island ship zero extra client JS"). This is a NEW mechanism, not a reuse of
 * content.test.ts's `<FAQItem question="...">` / `<Steps>` idiom (content.test.ts:346,620) —
 * that suite regexes MDX BODY TEXT for rendered component usage; this walks TS IMPORT
 * DECLARATIONS, using the TypeScript compiler API the way error-messages.test.ts already does
 * (`ts.createSourceFile` + `ts.forEachChild`).
 *
 * Reality check on the plan this test was speced from: `/[page]` resolves a slug against BOTH the
 * content tree AND the `/tools` calculator registry (`getTool()` in `[page]/page.tsx`). The
 * calculator is a pre-existing, deliberately interactive island — ToolPage's own comment reads
 * "apart from the calculator itself... the only thing that needs the client is the arithmetic" —
 * and no part of this stage's engine. Walking into it would make this test a no-op gate over a
 * surface that was never meant to be JS-free, so traversal stops at `src/components/tools/**` and
 * `src/tools/**` (see EXCLUDED_PREFIXES). CONTENT_JS_BUDGET is therefore not the clean 0→1 the
 * original plan text assumed; it is 2, for a real, pre-existing, undocumented reason found while
 * building this test — see the constant's own comment.
 */

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')

/**
 * Every physical route file that can render a content page: the 3 `/blog/[slug]` locale routes,
 * the 3 `/[page]` locale routes (alternatives + capture — `/[page]` ALSO serves `/tools`, see
 * EXCLUDED_PREFIXES), and the 3 `(split-content)` `/guides/[slug]` locale routes. All 9 are
 * distinct files on disk, never shared across locales.
 */
const ENTRY_FILES = [
    'src/app/(product-shell)/(marketing)/blog/[slug]/page.tsx',
    'src/app/(product-shell)/(marketing)/es-419/blog/[slug]/page.tsx',
    'src/app/(product-shell)/(marketing)/pt-br/blog/[slug]/page.tsx',
    'src/app/(product-shell)/(marketing)/[page]/page.tsx',
    'src/app/(product-shell)/(marketing)/es-419/[page]/page.tsx',
    'src/app/(product-shell)/(marketing)/pt-br/[page]/page.tsx',
    'src/app/(split-content)/guides/[slug]/page.tsx',
    'src/app/(split-content)/es-419/guides/[slug]/page.tsx',
    'src/app/(split-content)/pt-br/guides/[slug]/page.tsx',
].map((relative) => path.join(ROOT, relative))

/** See the header comment: `/tools` shares the `/[page]` route by URL shape only. */
const EXCLUDED_PREFIXES = [path.join(SRC, 'components/tools'), path.join(SRC, 'tools')]

/**
 * The budget as it actually stands, not as a clean slate would prefer:
 *  - `components/ui/LocaleSwitcher.tsx` — reachable via `SiteFooter`, which `ArticleLayout`
 *    imports unconditionally for every blog/alternatives/capture route. Every content call site
 *    passes `showLocaleSwitcher={false}` (an indexed page states its language in its own URL), but
 *    that is a runtime prop, not an import boundary — the static import predates this stage.
 *  - `components/marketing/ContentAnalytics.tsx` — this stage's own pageview/scroll-depth island,
 *    reachable from both `ArticleLayout` and `GuideLayout`.
 * `<Script>` (`mdxComponents` in `components.tsx`) loads its `'use client'` chain —
 * `mdx/ScriptEnhancer.tsx` → `Island.tsx` → `lib/use-motion.ts`/`lib/use-settings.ts` — via
 * `next/dynamic` (see `Script.tsx`), which is a dynamic `import()` and so invisible to this walk
 * on purpose (see `runtimeSpecifiers`'s docstring); none of the four count here. A count above 2
 * is a real regression; a count below it means one of the two above was removed.
 */
const CONTENT_JS_BUDGET = 2

function isExcluded(file: string): boolean {
    return EXCLUDED_PREFIXES.some((prefix) => file === prefix || file.startsWith(`${prefix}${path.sep}`))
}

/** Relative/`@/` specifiers only — a bare package specifier resolves into node_modules, which is
 *  not this test's concern and is left untouched. */
function resolveImport(fromFile: string, specifier: string): string | null {
    let base: string
    if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier)
    else if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2))
    else return null

    for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
    ]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
    }
    return null
}

/** True when the file's first statement is the `'use client'` directive prologue — the exact
 *  position Next.js itself requires for the directive to take effect. */
function hasUseClientDirective(sourceFile: ts.SourceFile): boolean {
    const [first] = sourceFile.statements
    return (
        !!first &&
        ts.isExpressionStatement(first) &&
        ts.isStringLiteral(first.expression) &&
        first.expression.text === 'use client'
    )
}

/**
 * Every runtime module specifier a file imports or re-exports. `import type { X } from '…'` is
 * skipped entirely — it is erased before the bundle exists, so a file reached only through one
 * never ships. A dynamic `import(...)` is never visited at all: this only walks
 * `ImportDeclaration`/`ExportDeclaration` nodes, so a lazy chunk can never leak into this graph.
 */
function runtimeSpecifiers(sourceFile: ts.SourceFile): string[] {
    const specifiers: string[] = []
    const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node)) {
            if (!node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
                specifiers.push(node.moduleSpecifier.text)
            }
        } else if (ts.isExportDeclaration(node)) {
            if (!node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                specifiers.push(node.moduleSpecifier.text)
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return specifiers
}

function parse(file: string): ts.SourceFile {
    return ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
}

/** Breadth-first over the whole entry set at once: one shared graph, one shared budget — a file
 *  reachable from any of the 9 routes counts once, not per route. */
function walkContentRoutes(): { reachable: Set<string>; useClientFiles: Set<string> } {
    const reachable = new Set<string>()
    const useClientFiles = new Set<string>()
    const queue = [...ENTRY_FILES]

    while (queue.length > 0) {
        const file = queue.shift()!
        if (reachable.has(file)) continue
        reachable.add(file)
        if (isExcluded(file)) continue

        const sourceFile = parse(file)
        if (hasUseClientDirective(sourceFile)) useClientFiles.add(file)
        for (const specifier of runtimeSpecifiers(sourceFile)) {
            const resolved = resolveImport(file, specifier)
            if (resolved && !reachable.has(resolved)) queue.push(resolved)
        }
    }
    return { reachable, useClientFiles }
}

describe('content route JS budget', () => {
    it('has all 9 entry files on disk', () => {
        for (const file of ENTRY_FILES) expect(fs.existsSync(file), file).toBe(true)
    })

    it(`reaches exactly ${CONTENT_JS_BUDGET} 'use client' module(s) across all 9 content routes`, () => {
        const { useClientFiles } = walkContentRoutes()
        const relative = [...useClientFiles].map((file) => path.relative(ROOT, file)).sort()
        expect(relative, relative.join(', ')).toEqual(
            ['src/components/marketing/ContentAnalytics.tsx', 'src/components/ui/LocaleSwitcher.tsx'].sort()
        )
        expect(relative.length).toBe(CONTENT_JS_BUDGET)
    })

    it("never reaches a 'use client' file under src/components/split-content/**", () => {
        const { useClientFiles } = walkContentRoutes()
        const splitContentDir = path.join(SRC, 'components/split-content')
        const offenders = [...useClientFiles].filter((file) => file.startsWith(`${splitContentDir}${path.sep}`))
        expect(offenders).toEqual([])
    })
})
