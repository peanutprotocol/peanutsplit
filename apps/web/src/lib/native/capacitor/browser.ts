import { Browser } from '@capacitor/browser'
import { quietly } from './guard'

/** Opens `url` in the in-app system browser. False when the bridge cannot open it. */
export const open = (url: string): Promise<boolean> =>
    quietly(async () => {
        await Browser.open({ url })
        return true
    }, false)
