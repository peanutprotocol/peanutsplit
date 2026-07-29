import { DOODLE } from '@/components/ui/doodles'
import { emblemDoodle } from '@/lib/room-emblem'
import { FALLBACK_DOODLE } from '@/lib/room-doodle'
import { themeFor } from '@/lib/themes'

export { SHARE_PACKAGE_VARIANT } from './share-package-contract'

export interface RoomSharePackage {
    title: string
    text: string
    url: string
    /** The plain-text fallback. The bearer link belongs here because this is a
     * user-directed handoff, never in the visual card. */
    fullText: string
}

export interface RoomShareVisual {
    filename: string
    mimeType: 'image/svg+xml'
    svg: string
}

export type ShareChannelFixture = 'whatsapp' | 'telegram' | 'messenger' | 'sms' | 'email'

/**
 * One payload for every real share path. Browsers do not reveal which app a
 * person chose in the native sheet, so the product never guesses a channel.
 */
export function roomSharePackage(input: { title: string; nextAction: string; url: string }): RoomSharePackage {
    return {
        title: input.title,
        text: input.nextAction,
        url: input.url,
        fullText: `${input.nextAction}\n${input.url}`,
    }
}

const escapeXml = (value: string): string =>
    value.replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&apos;',
        }
        return entities[character]
    })

const filenameStem = (roomName: string): string =>
    roomName
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'split-room'

const titleLines = (title: string): string[] => {
    const words = title.trim().replace(/\s+/g, ' ').split(' ')
    const lines: string[] = []
    for (const word of words) {
        const current = lines.at(-1)
        if (!current || (current.length + word.length + 1 > 24 && lines.length < 3)) lines.push(word)
        else lines[lines.length - 1] = `${current} ${word}`
    }
    if (lines.length === 0) return ['Split room']
    const visible = lines.slice(0, 3)
    if (lines.length > 3 || visible[2]?.length > 24) visible[2] = `${visible[2].slice(0, 21).trimEnd()}...`
    return visible
}

/**
 * A local, credential-free visual attachment.
 *
 * It is deliberately generated from exactly three room properties: title,
 * theme key and doodle key. There is no API state here from which member names,
 * amounts, expense/member counts, uploads or the bearer slug could leak. The
 * SVG becomes a File or a blob download in the browser; it is never published
 * at an address.
 */
export function roomShareVisual(input: {
    roomName: string
    theme: string | null | undefined
    emblem: string | null | undefined
}): RoomShareVisual {
    const theme = themeFor(input.theme)
    const doodle = emblemDoodle(input.emblem) ?? FALLBACK_DOODLE
    const lines = titleLines(input.roomName)
    const title = lines
        .map(
            (line, index) =>
                `<text x="92" y="${270 + index * 88}" font-family="Arial, sans-serif" ` +
                `font-size="72" font-weight="800" fill="#211C17">${escapeXml(line)}</text>`
        )
        .join('')
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
        `<rect width="1200" height="630" rx="42" fill="${theme.field}"/>` +
        `<circle cx="1010" cy="112" r="210" fill="${theme.fieldTint}"/>` +
        `<circle cx="1140" cy="610" r="250" fill="${theme.tint}"/>` +
        `<text x="92" y="112" font-family="Arial, sans-serif" font-size="30" font-weight="800" ` +
        `letter-spacing="4" fill="${theme.fieldInk}">PEANUT SPLIT</text>` +
        title +
        `<g transform="translate(820 180) scale(8.2)">` +
        `<path d="${DOODLE[doodle]}" fill="none" stroke="#211C17" stroke-width="2.2" ` +
        `stroke-linecap="round" stroke-linejoin="round"/></g>` +
        `</svg>`

    return {
        filename: `${filenameStem(input.roomName)}-invite.svg`,
        mimeType: 'image/svg+xml',
        svg,
    }
}

/**
 * Contract fixtures for the five target receivers. They model what each app can
 * render from the same standards-based share fields; they do not deep-link to a
 * channel, read contacts or pretend Web Share tells us which destination won.
 */
export function renderShareChannelFixture(
    channel: ShareChannelFixture,
    payload: RoomSharePackage
): { subject?: string; body: string } {
    if (channel === 'email') return { subject: payload.title, body: payload.fullText }
    return { body: payload.fullText }
}
