import { describe, expect, it } from 'vitest'
import { extractSteps, howToSchema } from './howto-schema'

describe('extractSteps', () => {
    it('returns null when the body has no Steps block', () => {
        expect(extractSteps('# Just a heading\n\nSome prose, no steps here.')).toBeNull()
    })

    it('returns null for a Steps block with zero Step children', () => {
        expect(extractSteps('<Steps title="Empty">\n</Steps>')).toBeNull()
    })

    it('extracts one Step child with the Steps title', () => {
        const body = '<Steps title="A few minutes">\n<Step title="Export">Open the export page.</Step>\n</Steps>'
        expect(extractSteps(body)).toEqual({
            title: 'A few minutes',
            steps: [{ title: 'Export', text: 'Open the export page.' }],
        })
    })

    it('extracts multiple Step children in document order', () => {
        const body = [
            '<Steps title="Moving your group">',
            '<Step title="Export the group">Open settings and export.</Step>',
            '<Step title="Import and review">Drop in the CSV, pick a currency.</Step>',
            '<Step title="Paste the link">Everyone can add from here.</Step>',
            '</Steps>',
        ].join('\n')
        expect(extractSteps(body)).toEqual({
            title: 'Moving your group',
            steps: [
                { title: 'Export the group', text: 'Open settings and export.' },
                { title: 'Import and review', text: 'Drop in the CSV, pick a currency.' },
                { title: 'Paste the link', text: 'Everyone can add from here.' },
            ],
        })
    })

    it('omits the title key when Steps carries none', () => {
        const body = '<Steps>\n<Step title="Only">One thing to do.</Step>\n</Steps>'
        expect(extractSteps(body)).toEqual({ steps: [{ title: 'Only', text: 'One thing to do.' }] })
    })

    it('returns null for an unclosed Steps tag', () => {
        const body = '<Steps title="Broken">\n<Step title="Export">Open the export page.</Step>\n'
        expect(extractSteps(body)).toBeNull()
    })

    it('returns null for an unclosed Step tag inside a closed Steps block', () => {
        const body = '<Steps title="Broken">\n<Step title="Export">Open the export page.\n</Steps>'
        expect(extractSteps(body)).toBeNull()
    })
})

describe('howToSchema', () => {
    it('returns null when the body has no Steps block, the same contract as faqSchema on an empty list', () => {
        expect(howToSchema('How to split a bill', 'https://peanutsplit.com/blog/x', 'no steps in here')).toBeNull()
    })

    it('builds a HowTo node with one HowToStep per Step, in position order', () => {
        const body = [
            '<Steps title="Moving your group">',
            '<Step title="Export the group">Open settings and export.</Step>',
            '<Step title="Import and review">Drop in the CSV.</Step>',
            '</Steps>',
        ].join('\n')

        expect(howToSchema('Move a Splitwise group', 'https://peanutsplit.com/splitwise-daily-limit', body)).toEqual({
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: 'Move a Splitwise group',
            mainEntityOfPage: 'https://peanutsplit.com/splitwise-daily-limit',
            step: [
                { '@type': 'HowToStep', position: 1, name: 'Export the group', text: 'Open settings and export.' },
                { '@type': 'HowToStep', position: 2, name: 'Import and review', text: 'Drop in the CSV.' },
            ],
        })
    })
})
