import { describe, expect, it } from 'vitest'
import {
    nativeRoomShareData,
    renderShareChannelFixture,
    roomSharePackage,
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

    it('builds a URL-first native payload with no file attachment', () => {
        const native = nativeRoomShareData(payload)

        expect(native).toEqual({
            title: 'Lisbon weekend · Peanut Split',
            text: nextAction,
            url,
        })
        expect(Object.keys(native)).toEqual(['title', 'text', 'url'])
        expect(native).not.toHaveProperty('files')
        expect(native.url).toBe(url)
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
})
