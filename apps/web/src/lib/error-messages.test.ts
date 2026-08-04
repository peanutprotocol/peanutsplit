import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import ts from 'typescript'
import en from '@/i18n/messages/en.json'
import { ApiRequestError } from './api'
import { errorMessageFor, KNOWN_ERROR_CODES } from './error-messages'

/**
 * The one thing the i18n audit script cannot check about this module: it maps a code to a key at
 * runtime (`t(error.code)`), so the audit sees a computed key and skips it. Catalog parity still
 * guarantees es/pt-BR match en — this closes the other half by proving en covers every code the
 * client claims to know. A gap here renders the code itself at the user.
 */
describe('error message coverage', () => {
    const messages = en.errors as Record<string, string>

    it('has an English message for every known code', () => {
        const missing = KNOWN_ERROR_CODES.filter((code) => typeof messages[code] !== 'string')
        expect(missing).toEqual([])
    })

    it('has no orphan entries left behind by a removed code', () => {
        const known = new Set<string>([...KNOWN_ERROR_CODES, 'generic'])
        expect(Object.keys(messages).filter((key) => !known.has(key))).toEqual([])
    })

    it('recognizes every literal error code emitted by server and API code', () => {
        const known = new Set<string>(KNOWN_ERROR_CODES)
        expect([...emittedErrorCodes()].filter((code) => !known.has(code)).sort()).toEqual([])
    })
})

describe('errorMessageFor', () => {
    const translate = (key: string) => `translated:${key}`

    it('uses the localized catalog for a known server code', () => {
        expect(errorMessageFor(new ApiRequestError(404, 'NOT_FOUND', 'raw English'), translate)).toBe(
            'translated:NOT_FOUND'
        )
    })

    it('never exposes an unknown raw server message or room credential', () => {
        const error = new ApiRequestError(500, 'FUTURE_CODE', 'failed while reading /r/secret-room-capability')
        expect(errorMessageFor(error, translate)).toBe('translated:generic')
        expect(errorMessageFor(error, translate, 'Could not save this expense.')).toBe('Could not save this expense.')
    })
})

const sourceRoots = [resolve(import.meta.dirname, '../server'), resolve(import.meta.dirname, '../app/api')]
const helperDefaults = new Map([
    ['badRequest', 'VALIDATION_ERROR'],
    ['notFound', 'NOT_FOUND'],
    ['conflict', 'CONFLICT'],
])

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return sourceFiles(path)
        if (!['.ts', '.tsx'].includes(extname(path)) || path.includes('.test.')) return []
        return [path]
    })
}

function literal(node: ts.Expression | undefined): string | null {
    return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null
}

function emittedErrorCodes(): Set<string> {
    const codes = new Set<string>()
    for (const file of sourceRoots.flatMap(sourceFiles)) {
        const source = readFileSync(file, 'utf8')
        const sourceFile = ts.createSourceFile(
            file,
            source,
            ts.ScriptTarget.Latest,
            true,
            file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        )
        const visit = (node: ts.Node) => {
            if (ts.isNewExpression(node) && node.expression.getText(sourceFile) === 'ApiError') {
                const code = literal(node.arguments?.[1])
                if (code) codes.add(code)
            }
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
                const name = node.expression.text
                if (helperDefaults.has(name)) codes.add(literal(node.arguments[1]) ?? helperDefaults.get(name)!)
                if (name === 'errorResponse') {
                    const code = literal(node.arguments[0])
                    if (code) codes.add(code)
                }
            }
            ts.forEachChild(node, visit)
        }
        visit(sourceFile)
    }
    return codes
}
