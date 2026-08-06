export { SHARE_PACKAGE_VARIANT } from './share-package-contract'

export interface RoomSharePackage {
    title: string
    text: string
    url: string
    /** The plain-text fallback. The bearer link belongs here because this is a
     * user-directed handoff, never in the visual card. */
    fullText: string
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

/**
 * The exact object handed to the native share sheet for a private room invite.
 *
 * Do not add `files` here. Several iOS share targets silently choose the image
 * and discard the bearer URL when both are present. The URL supplies its own
 * room-specific visual through Open Graph, so the credential stays the one
 * indispensable part of this payload.
 */
export function nativeRoomShareData(payload: RoomSharePackage): ShareData {
    return { title: payload.title, text: payload.text, url: payload.url }
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
