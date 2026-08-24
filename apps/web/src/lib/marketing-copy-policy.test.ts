import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    findMarkdownPostureFailures,
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

    it('allows FOSS claims only in upgrade fields and PublicSourceOnly regions', () => {
        const source = `---
title: Split is FOSS
description: Safe comparison
publicSourceTitle: Free and open-source Splitwise alternative
publicSourceDescription: Released source is available under AGPL-3.0-or-later.
releaseGate: public-source
claims:
  - public-source-and-self-hosting
publicSourceFaqs:
  - question: Is Split FOSS?
    answer: The released source is AGPL-3.0-or-later.
faqs:
  - question: Is Split open source?
    answer: This base FAQ must not claim it.
---

Split is FOSS before the wrapper.

<PublicSourceOnly>
Split is FOSS inside the wrapper.
</PublicSourceOnly>

Split is FOSS after the wrapper.
`
        const failures = findMarkdownPostureFailures(source, { allowPublicSourceCandidate: true })
        const releaseFailures = failures.filter(
            (failure) => failure.label === 'claims FOSS, open-source, or AGPL status before the public-release gate'
        )

        expect(releaseFailures).toHaveLength(4)
        expect(releaseFailures.map((failure) => failure.line)).toEqual(
            expect.arrayContaining(['frontmatter.title', 'frontmatter.faqs[0].question'])
        )
        expect(releaseFailures.filter((failure) => typeof failure.line === 'number')).toHaveLength(2)
    })

    it('does not honor release wrappers on an unapproved Markdown candidate', () => {
        const source = '<PublicSourceOnly>\nSplit is FOSS.\n</PublicSourceOnly>\n'
        const failures = findMarkdownPostureFailures(source)

        expect(failures.map((failure) => failure.label)).toContain(
            'claims FOSS, open-source, or AGPL status before the public-release gate'
        )
    })

    it.each([
        '{/* <PublicSourceOnly> */}\n\nSplit is FOSS and this paragraph renders before release.\n\n{/* </PublicSourceOnly> */}',
        '```mdx\n<PublicSourceOnly>\n```\n\nSplit is FOSS and this paragraph renders before release.\n\n```mdx\n</PublicSourceOnly>\n```',
    ])('does not let a comment or fenced example establish a release boundary', (source) => {
        const failures = findMarkdownPostureFailures(source, { allowPublicSourceCandidate: true })

        expect(failures.map((failure) => failure.label)).toContain(
            'claims FOSS, open-source, or AGPL status before the public-release gate'
        )
    })

    it.each([
        'The released software is licensed under AGPL-3.0-or-later.',
        'The source code is licensed under AGPL-3.0-or-later.',
        'Peanut Split is licensed as open source.',
        'The project is FOSS.',
        'Our code is open source.',
        'You can self-host the AGPL source.',
        'Licensed AGPL-3.0-or-later source is now public.',
        'Peanut Split uses an AGPL-3.0-or-later license.',
        'The public repository includes the source code.',
        'The source is publicly available.',
        'Download the source under AGPL-3.0-or-later.',
        'The code carries an AGPL-3.0-or-later license.',
        'This project is open source.',
        'Peanut Split comes with source code under AGPL.',
        'El proyecto es de código abierto.',
        'El código se publica bajo AGPL-3.0-or-later.',
        'El repositorio público incluye el código fuente.',
        'Puedes alojar Split por tu cuenta.',
        'O projeto é de código aberto.',
        'O código é publicado sob AGPL-3.0-or-later.',
        'O repositório público inclui o código-fonte.',
        'Você pode auto-hospedar o Split.',
        '[Read the source receipt](/source)',
    ])('rejects any public-source term or link outside the approved MDX region: %s', (copy) => {
        const failures = findMarkdownPostureFailures(copy, { allowPublicSourceCandidate: true })

        expect(failures.map((failure) => failure.label)).toContain(
            'claims FOSS, open-source, or AGPL status before the public-release gate'
        )
    })

    it.each([
        '<PublicSourceOnly>\nSplit is FOSS.\n',
        '</PublicSourceOnly>\nSplit is FOSS.\n',
        '<PublicSourceOnly>\n<PublicSourceOnly>\nSplit is FOSS.\n</PublicSourceOnly>\n</PublicSourceOnly>\n',
    ])('rejects an unbalanced or nested public-source boundary', (source) => {
        expect(findMarkdownPostureFailures(source, { allowPublicSourceCandidate: true })).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ label: 'has an unbalanced or nested PublicSourceOnly release boundary' }),
            ])
        )
    })
})
