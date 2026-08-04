#!/usr/bin/env node

import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const resolveConfig = require('tailwindcss/resolveConfig')
const tailwindConfig = require('../tailwind.config.js')
const root = resolve(import.meta.dirname, '..')
const src = join(root, 'src')
const resolvedTheme = resolveConfig(tailwindConfig).theme
const failures = []

// These named shadows come from the design-system component plugin rather than
// theme.boxShadow. Keep the list small so a misspelt depth fails this audit.
const componentShadows = new Set([
    '2',
    '4',
    'primary-3',
    'primary-4',
    'primary-6',
    'primary-8',
    'secondary-3',
    'secondary-4',
    'secondary-6',
    'secondary-8',
])
const roundedDirections = /^(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee)-/

function filesBelow(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return filesBelow(path)
        return ['.ts', '.tsx', '.css'].includes(extname(entry.name)) ? [path] : []
    })
}

function validateToken(raw, file, line) {
    const token = raw
        .split(':')
        .at(-1)
        ?.replace(/^!/, '')
        .replace(/[),;}]+$/, '')
    if (!token || token.includes('[')) return

    if (token.startsWith('shadow-')) {
        const key = token.slice('shadow-'.length)
        if (resolvedTheme.boxShadow[key] === undefined && !componentShadows.has(key)) {
            failures.push(`${file}:${line} uses unknown shadow class ${token}`)
        }
        return
    }

    if (token.startsWith('rounded-')) {
        const key = token.slice('rounded-'.length).replace(roundedDirections, '')
        if (resolvedTheme.borderRadius[key] === undefined) {
            failures.push(`${file}:${line} uses unknown radius class ${token}`)
        }
        return
    }

    if (token.startsWith('z-')) {
        const key = token.slice(2)
        if (resolvedTheme.zIndex[key] === undefined)
            failures.push(`${file}:${line} uses unknown z-index class ${token}`)
    }
}

function validateClasses(value, file, line) {
    for (const token of value.split(/\s+/)) validateToken(token, file, line)
}

for (const path of filesBelow(src)) {
    const source = readFileSync(path, 'utf8')
    const file = relative(root, path)

    if (path.endsWith('.css')) {
        for (const match of source.matchAll(/\[data-testid(?:=|\])/g)) {
            const line = source.slice(0, match.index).split('\n').length
            failures.push(`${file}:${line} styles through data-testid; use a component, class or data-state attribute`)
        }
        for (const match of source.matchAll(/@apply\s+([^;:{]+)[;:{]/g)) {
            const line = source.slice(0, match.index).split('\n').length
            validateClasses(match[1], file, line)
        }
        continue
    }

    const sourceFile = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )

    function visit(node) {
        if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'className' && node.initializer) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
            if (ts.isStringLiteral(node.initializer)) validateClasses(node.initializer.text, file, line)
            if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
                const visitClassExpression = (child) => {
                    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
                        validateClasses(child.text, file, line)
                    }
                    ts.forEachChild(child, visitClassExpression)
                }
                visitClassExpression(node.initializer.expression)
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
}

if (failures.length) {
    console.error('Tailwind class audit failed:\n')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
}

console.log('Tailwind class audit clean: radius, shadow and z-index names resolve; test ids are not CSS hooks')
