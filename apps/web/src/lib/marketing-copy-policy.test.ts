import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    findPostureFailures,
    markdownParagraphs,
    productionTypescriptFiles,
} from '../../scripts/marketing-copy-audit.mjs'

const labelsFor = (copy: string, allowPublicSourceCandidate = true): string[] =>
    findPostureFailures(copy, { allowPublicSourceCandidate }).map((failure: { label: string }) => failure.label)

describe('FOSS posture negative fixtures', () => {
    it('allows a gated claim about the released source, but not an ungated one', () => {
        expect(labelsFor('Split is FOSS')).toEqual([])
        expect(labelsFor('Split is FOSS', false)).toContain(
            'claims FOSS, open-source, or AGPL status before the public-release gate'
        )
    })

    it.each([
        'The official service is open source.',
        'The official Peanut Split service is open source.',
        'The official Peanut Split website is open source.',
        'Our hosted Peanut Split app runs under AGPL.',
        'El servicio oficial es de código abierto.',
        'El servicio oficial de Peanut Split es de código abierto.',
        'La web oficial de Peanut Split es de código abierto.',
        'O serviço oficial é de código aberto.',
        'O serviço oficial do Peanut Split é de código aberto.',
        'O site oficial do Peanut Split é de código aberto.',
    ])('rejects source-license language applied to a hosted service: %s', (copy) => {
        expect(labelsFor(copy)).toContain('misapplies the source license to the hosted service')
    })

    it.each([
        'Every future release will be open source.',
        'Every version we publish will use AGPL.',
        'We will keep releasing Peanut Split under AGPL.',
        'Subsequent Peanut Split releases will remain open source.',
        'Todas las próximas versiones serán software libre.',
        'Todas as próximas versões serão software livre.',
    ])('rejects promises about future release terms even inside approved launch copy: %s', (copy) => {
        expect(labelsFor(copy)).toContain('guarantees that future versions will keep the same FOSS terms')
    })

    it.each([
        'The AGPL license requires every fork to promote Peanut.',
        'Forks have to retain a Peanut link under the AGPL.',
        'The AGPL means forks have to promote Peanut.',
    ])('rejects turning Peanut promotion into a license condition: %s', (copy) => {
        expect(labelsFor(copy)).toContain('turns a Peanut reference into a software-license condition')
    })

    it('recursively audits the production UI instead of a hand-maintained file list', () => {
        const audited = productionTypescriptFiles().map((file: string) => path.relative(process.cwd(), file))

        expect(audited).toEqual(
            expect.arrayContaining([
                'src/app/(product-shell)/(marketing)/page.tsx',
                'src/app/(product-shell)/(marketing)/layout.tsx',
                'src/components/marketing/HonestyStrip.tsx',
                'src/components/marketing/SiteFooter.tsx',
                'src/app/(product-shell)/(marketing)/source/page.tsx',
            ])
        )
    })

    it.each([
        'The official hosted service\nis open source.',
        'Every future release will remain\nopen source.',
        'The AGPL license requires every fork\nto promote Peanut.',
    ])('normalizes wrapped Markdown before applying posture rules: %s', (copy) => {
        const failures = markdownParagraphs(copy).flatMap(({ text }) => labelsFor(text))

        expect(failures).not.toEqual([])
    })
})
