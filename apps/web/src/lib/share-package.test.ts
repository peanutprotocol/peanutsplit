import { describe, expect, it } from 'vitest'
import {
    renderShareChannelFixture,
    roomSharePackage,
    roomShareVisual,
    SHARE_PACKAGE_VARIANT,
    type ShareChannelFixture,
} from './share-package'

const slug = 'lisbon-weekend-x7k2m9'
const url = `https://peanutsplit.com/r/${slug}`
const nextAction = 'Open the link, pick your name, then add what you paid.'
const payload = roomSharePackage({
    title: 'Lisbon weekend · Peanut Split',
    nextAction,
    url,
})

describe('room share package', () => {
    it('keeps the exact next action and bearer link together in the directed payload', () => {
        expect(payload).toEqual({
            title: 'Lisbon weekend · Peanut Split',
            text: nextAction,
            url,
            fullText: `${nextAction}\n${url}`,
        })
        expect(SHARE_PACKAGE_VARIANT).toBe('group_chat_package_v1')
    })

    it.each<ShareChannelFixture>(['whatsapp', 'telegram', 'messenger', 'sms', 'email'])(
        'stays legible when %s renders the standard share fields',
        (channel) => {
            const rendered = renderShareChannelFixture(channel, payload)
            expect(rendered.body).toContain('Open the link')
            expect(rendered.body).toContain('pick your name')
            expect(rendered.body).toContain('add what you paid')
            expect(rendered.body.match(new RegExp(slug, 'g'))).toHaveLength(1)
            if (channel === 'email') expect(rendered.subject).toBe(payload.title)
            else expect(rendered).not.toHaveProperty('subject')
        }
    )

    it('builds a local visual from room title, theme and doodle without the credential or group data', () => {
        const hostileSource = {
            roomName: 'Lisbon & friends',
            theme: 'mint',
            emblem: 'train',
            slug,
            members: ['Ana', 'Bea'],
            amount: '123.45',
            expenseCount: '3 expenses',
            memberCount: '2 people',
            upload: 'receipt-private.jpg',
            coverUrl: 'https://private.invalid/group-photo.jpg',
        }
        // The real API state contains all of these fields. Runtime callers can
        // hand us an object wider than the TypeScript projection; the generator
        // still reads exactly roomName/theme/emblem and nothing else.
        const visual = roomShareVisual(hostileSource)

        expect(visual.filename).toBe('lisbon-friends-invite.svg')
        expect(visual.mimeType).toBe('image/svg+xml')
        expect(visual.svg).toContain('Lisbon &amp; friends')
        expect(visual.svg).toContain('#98E9AB')
        expect(visual.svg).toContain('<path')
        expect(visual.svg).not.toContain(slug)
        for (const forbidden of [
            slug,
            'Ana',
            'Bea',
            '123.45',
            '3 expenses',
            '2 people',
            'receipt-private.jpg',
            'coverUrl',
            'private.invalid',
            'https://',
        ]) {
            expect(visual.svg).not.toContain(forbidden)
        }
    })

    it('escapes authored titles rather than turning them into SVG markup', () => {
        const visual = roomShareVisual({
            roomName: '<script>alert("no")</script>',
            theme: null,
            emblem: null,
        })

        expect(visual.svg).not.toContain('<script>')
        expect(visual.svg).toContain('&lt;script&gt;')
    })
})
