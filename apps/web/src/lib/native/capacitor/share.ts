import { Share } from '@capacitor/share'
import { quietly } from './guard'

export interface NativeShareInput {
    title?: string
    text?: string
    url?: string
    /** `file://` URIs written by the filesystem wrapper. */
    files?: string[]
}

/** Opens the system share sheet. False when it is unavailable or the person dismissed it. */
export const share = (input: NativeShareInput): Promise<boolean> =>
    quietly(async () => {
        await Share.share(input)
        return true
    }, false)

/** True when the system share sheet exists on this device. */
export const canShare = (): Promise<boolean> => quietly(async () => (await Share.canShare()).value, false)
