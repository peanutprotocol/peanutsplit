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

function jsxAttribute(node, name, sourceFile) {
    return node.attributes.properties.find(
        (property) => ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name
    )
}

function staticAttributeValue(attribute) {
    if (!attribute?.initializer) return attribute ? 'true' : undefined
    if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text
    if (!ts.isJsxExpression(attribute.initializer)) return undefined
    const expression = attribute.initializer.expression
    if (expression?.kind === ts.SyntaxKind.TrueKeyword) return 'true'
    if (expression?.kind === ts.SyntaxKind.FalseKeyword) return 'false'
    if (expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) {
        return expression.text
    }
    return undefined
}

function stringTokensInside(attribute) {
    if (!attribute?.initializer) return []
    if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text.split(/\s+/)
    if (!ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) return []
    const tokens = []
    const visit = (node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            tokens.push(...node.text.split(/\s+/))
        }
        ts.forEachChild(node, visit)
    }
    visit(attribute.initializer.expression)
    return tokens
}

for (const path of filesBelow(src)) {
    const source = readFileSync(path, 'utf8')
    const file = relative(root, path)
    const isDevDs = file.startsWith('src/app/dev-ds/')

    if (!isDevDs) {
        for (const match of source.matchAll(/placeholder:text-grey-2/g)) {
            const line = source.slice(0, match.index).split('\n').length
            failures.push(`${file}:${line} uses the below-contrast placeholder token; use placeholder:text-n-3`)
        }
        for (const match of source.matchAll(
            /(?:focus-visible:(?:ring|border)|focus-within:ring|focus:ring)[^'"\s]*/g
        )) {
            const line = source.slice(0, match.index).split('\n').length
            failures.push(`${file}:${line} adds a local focus ring/border; use the central focus-visible recipe`)
        }
        if (/^src\/(?:app|components)\//.test(file)) {
            for (const match of source.matchAll(/fieldInk/g)) {
                const line = source.slice(0, match.index).split('\n').length
                failures.push(`${file}:${line} consumes decorative-only fieldInk in product UI`)
            }
        }
    }

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

    let nextLinkBinding
    let buttonBinding
    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
        const moduleName = statement.moduleSpecifier.text
        if (moduleName === 'next/link') nextLinkBinding = statement.importClause?.name?.text
        if (moduleName === '@/components/ui/Button') {
            const imports = statement.importClause?.namedBindings
            if (imports && ts.isNamedImports(imports)) {
                buttonBinding = imports.elements.find(
                    (element) => (element.propertyName ?? element.name).text === 'Button'
                )?.name.text
            }
        }
    }

    function visit(node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag = node.tagName.getText(sourceFile)
            if (!isDevDs && ['input', 'textarea', 'select'].includes(tag)) {
                const type = staticAttributeValue(jsxAttribute(node, 'type', sourceFile)) ?? 'text'
                const ariaHidden = staticAttributeValue(jsxAttribute(node, 'aria-hidden', sourceFile)) === 'true'
                const nonTextInput =
                    tag === 'input' && ['checkbox', 'radio', 'range', 'file', 'hidden', 'color'].includes(type)
                if (!ariaHidden && !nonTextInput) {
                    const classTokens = stringTokensInside(jsxAttribute(node, 'className', sourceFile))
                    const unsafeMobileText = classTokens.find((token) => token === 'text-xs' || token === 'text-sm')
                    if (unsafeMobileText) {
                        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
                        failures.push(
                            `${file}:${line} gives a touch form control ${unsafeMobileText}; use text-base md:text-sm to prevent mobile focus zoom`
                        )
                    }
                }
            }
            const isButton = tag === 'button' || (buttonBinding && tag === buttonBinding)
            if (isButton) {
                let ancestor = node.parent
                while (ancestor) {
                    if (ts.isJsxElement(ancestor)) {
                        const ancestorTag = ancestor.openingElement.tagName.getText(sourceFile)
                        const isAnchor = ancestorTag === 'a' || (nextLinkBinding && ancestorTag === nextLinkBinding)
                        if (isAnchor) {
                            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
                            failures.push(
                                `${file}:${line} nests an interactive button inside an anchor; style the anchor with buttonClassName instead`
                            )
                            break
                        }
                    }
                    ancestor = ancestor.parent
                }
            }
        }
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

console.log(
    'Tailwind class audit clean: tokens resolve; mobile form text stays at least 16px; focus and placeholder recipes are central; links do not nest controls; test ids are not CSS hooks'
)
