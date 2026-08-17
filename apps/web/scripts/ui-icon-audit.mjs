import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
// The whole product, not the two folders the landing pass happened to touch: a
// second icon system is most likely to appear in the corner nobody is auditing.
const sourceRoots = [resolve(root, 'src')]
const codeExtensions = new Set(['.ts', '.tsx'])
const rawSvgExceptions = new Map([
    ['src/components/ui/Doodle.tsx', 'the single generated doodle renderer'],
    ['src/components/ui/CustomRoomDrawing.tsx', 'renders strictly decoded custom room geometry'],
    ['src/server/og/emblem.ts', 'wraps a generated doodle path as a link-preview image'],
    ['src/lib/split-content/wallpaper.ts', 'assembles the skin wallpaper tile from generated doodle paths'],
])
const forbiddenImports = [
    { pattern: /from\s+['"]lucide(?:-react)?['"]/, label: 'Lucide' },
    { pattern: /from\s+['"]@heroicons\//, label: 'Heroicons' },
    { pattern: /from\s+['"]react-icons(?:\/|['"])/, label: 'react-icons' },
]
const interfaceGlyph = /[\u2190-\u21ff✓✔✕✖❌✅➕]/u
const pictograph = /\p{Extended_Pictographic}/u
const failures = []
const usedExceptions = new Set()

function filesBelow(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return filesBelow(path)
        return codeExtensions.has(extname(entry.name)) ? [path] : []
    })
}

function lineOf(sourceFile, node) {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

function auditVisibleLiteral(sourceFile, node, value) {
    if (!pictograph.test(value) && !interfaceGlyph.test(value)) return
    failures.push(
        `${relative(root, sourceFile.fileName)}:${lineOf(sourceFile, node)} renders a Unicode glyph; use <Doodle> or <Icon>`
    )
}

function visitVisibleLiterals(sourceFile, node) {
    if (ts.isJsxText(node)) auditVisibleLiteral(sourceFile, node, node.text)

    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
        auditVisibleLiteral(sourceFile, node.initializer, node.initializer.text)
    }

    if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)) {
        auditVisibleLiteral(sourceFile, node.expression, node.expression.text)
    }

    ts.forEachChild(node, (child) => visitVisibleLiterals(sourceFile, child))
}

for (const file of sourceRoots.flatMap(filesBelow)) {
    const source = readFileSync(file, 'utf8')
    const local = relative(root, file)

    for (const { pattern, label } of forbiddenImports) {
        if (pattern.test(source)) failures.push(`${local}: imports the legacy ${label} icon system`)
    }

    if (source.includes('MessagingDoodle')) {
        failures.push(`${local}: revives the retired parallel messaging-icon component`)
    }

    if (source.includes('<svg')) {
        if (rawSvgExceptions.has(local)) usedExceptions.add(local)
        else failures.push(`${local}: contains a raw SVG; add its geometry to design/doodles instead`)
    }

    const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
    visitVisibleLiterals(sourceFile, sourceFile)
}

// An allowance nobody needs is a hole with a label on it: the file it named can be
// rewritten through <Doodle> and the exception survives, ready to wave a real raw
// SVG through later. Retire it the moment it stops applying.
for (const file of rawSvgExceptions.keys()) {
    if (!usedExceptions.has(file)) failures.push(`${file}: no longer holds a raw SVG; drop its audit exception`)
}

if (failures.length) {
    console.error('UI icon audit failed:\n')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
}

console.log(`UI icon audit clean (${sourceRoots.flatMap(filesBelow).length} source files)`)
for (const [file, reason] of rawSvgExceptions) console.log(`  allowed: ${file} — ${reason}`)
