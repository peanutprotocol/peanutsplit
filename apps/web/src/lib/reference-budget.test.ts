import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = path.resolve(process.cwd(), 'src')
const ignoredDirectories = new Set(['_system', '__fixtures__', 'dev-ds'])

function filesBelow(directory: string, extensions: ReadonlySet<string>): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name)
        if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : filesBelow(full, extensions)
        if (!extensions.has(path.extname(entry.name)) || /\.test\.[^.]+$/u.test(entry.name)) return []
        const local = path.relative(root, full).replaceAll('\\', '/')
        return local.startsWith('server/test/') ? [] : [full]
    })
}

function typescriptTextNodes(file: string): Array<{ kind: 'jsx' | 'string'; text: string; line: number }> {
    const source = fs.readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        path.extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
    const values: Array<{ kind: 'jsx' | 'string'; text: string; line: number }> = []
    const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
            values.push({
                kind: ts.isJsxText(node) ? 'jsx' : 'string',
                text: node.text,
                line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
            })
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return values
}

function decodeTwice(value: string): string {
    let decoded = value
    for (let index = 0; index < 2; index += 1) {
        try {
            const next = decodeURIComponent(decoded)
            if (next === decoded) break
            decoded = next
        } catch {
            break
        }
    }
    return decoded
}

const peanutHost = /(?:^|[^a-z0-9-])(?:[a-z0-9-]+\.)*peanut\.me(?=$|[^a-z0-9.-])/iu
const withoutProductName = (value: string): string => value.replace(/Peanut Split/giu, '')
const hasStandalonePeanut = (value: string): boolean => /\bPeanut\b/iu.test(withoutProductName(value))

function jsonStrings(value: unknown, key = ''): Array<{ key: string; value: string }> {
    if (typeof value === 'string') return [{ key, value }]
    if (Array.isArray(value)) return value.flatMap((child, index) => jsonStrings(child, `${key}[${index}]`))
    if (!value || typeof value !== 'object') return []
    return Object.entries(value).flatMap(([childKey, child]) =>
        jsonStrings(child, key ? `${key}.${childKey}` : childKey)
    )
}

describe('official-host Peanut reference budget', () => {
    it('allowlists every Peanut-controlled domain literal, including encoded and subdomain forms', () => {
        const placements = filesBelow(root, new Set(['.ts', '.tsx']))
            .flatMap((file) =>
                typescriptTextNodes(file)
                    .filter(({ kind, text }) => kind === 'string' && peanutHost.test(decodeTwice(text)))
                    .map(({ text }) => ({ file: path.relative(root, file).replaceAll('\\', '/'), value: text }))
            )
            .sort((left, right) => `${left.file}\0${left.value}`.localeCompare(`${right.file}\0${right.value}`))

        expect(placements).toEqual(
            [
                {
                    file: 'app/(product-shell)/(marketing)/source/page.tsx',
                    value: 'https://peanut.me',
                },
                {
                    file: 'components/room/SettleDrawer.tsx',
                    value: 'https://peanut.me/send?utm_source=split&utm_medium=settle&code=squirrel&campaign=split',
                },
                { file: 'lib/domains.ts', value: 'split.peanut.me' },
                { file: 'lib/recent-rooms.ts', value: 'split.peanut.me' },
                { file: 'lib/recent-rooms.ts', value: 'www.split.peanut.me' },
                { file: 'server/fx.ts', value: 'https://api.peanut.me/fx/rates' },
            ].sort((left, right) => `${left.file}\0${left.value}`.localeCompare(`${right.file}\0${right.value}`))
        )
    })

    it('keeps standalone Peanut out of authored and generated SEO prose', () => {
        const placements = filesBelow(root, new Set(['.md', '.mdx']))
            .filter((file) => hasStandalonePeanut(fs.readFileSync(file, 'utf8')))
            .map((file) => path.relative(root, file).replaceAll('\\', '/'))

        expect(placements).toEqual([])
    })

    it('keeps catalog references inside the user-initiated settlement control only', () => {
        const placements = filesBelow(path.join(root, 'i18n', 'messages'), new Set(['.json']))
            .flatMap((file) => {
                const locale = path.basename(file, '.json')
                return jsonStrings(JSON.parse(fs.readFileSync(file, 'utf8')))
                    .filter(({ value }) => hasStandalonePeanut(value))
                    .map(({ key }) => `${locale}:${key}`)
            })
            .sort()
        const locales = ['de', 'en', 'es-419', 'fr', 'pl', 'pt-br', 'uk']

        expect(placements).toEqual(
            locales.flatMap((locale) => [`${locale}:room.settle.peanut`, `${locale}:room.settle.peanutNote`]).sort()
        )
    })

    it('keeps exactly two factual visible mentions on the dedicated source page', () => {
        const sourcePage = path.join(root, 'app', '(product-shell)', '(marketing)', 'source', 'page.tsx')
        const mentions = typescriptTextNodes(sourcePage)
            .filter(({ kind, text }) => kind === 'jsx' && hasStandalonePeanut(text))
            .map(({ text }) => text.trim().replace(/\s+/gu, ' '))

        expect(mentions).toEqual([
            'Peanut',
            ', including an optional settlement method. They never require a click, nag the user, become preselected, or gate a feature. They are part of the official hosted service, not a condition of the AGPL license. Forks and self-hosters do not owe Peanut or Squirrel Labs promotion.',
        ])
    })

    it('keeps cash as the default and opens Peanut only after an explicit method choice', () => {
        const source = fs.readFileSync(path.join(root, 'components', 'room', 'SettleDrawer.tsx'), 'utf8')

        expect(source).toContain("useState<SettlementMethod>('cash')")
        expect(source.match(/\{ id: 'peanut'/g)).toHaveLength(1)
        expect(source).toContain("if (method === 'peanut') window.open(PEANUT_URL")
        expect(source).not.toMatch(/useState<SettlementMethod>\('peanut'\)/)
    })

    it('does not duplicate the settlement reference in landing-page marketing', () => {
        const source = fs.readFileSync(path.join(root, 'components', 'marketing', 'ReadMore.tsx'), 'utf8')

        expect(source).toContain("key: 'cash' | 'bank'")
        expect(source).not.toContain("{ key: 'peanut'")
    })
})
