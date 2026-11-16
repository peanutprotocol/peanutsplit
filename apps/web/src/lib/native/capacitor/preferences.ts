import { Preferences } from '@capacitor/preferences'
import { quietly } from './guard'

/** The stored value for `key`, or null when it is missing or the bridge is unavailable. */
export const get = (key: string): Promise<string | null> =>
    quietly(async () => (await Preferences.get({ key })).value, null)

/** Stores `value` under `key`. False when the write failed. */
export const set = (key: string, value: string): Promise<boolean> =>
    quietly(async () => {
        await Preferences.set({ key, value })
        return true
    }, false)

/** Removes `key`. False when the removal failed. */
export const remove = (key: string): Promise<boolean> =>
    quietly(async () => {
        await Preferences.remove({ key })
        return true
    }, false)

/** Every stored key; an empty list when the bridge is unavailable. */
export const keys = (): Promise<string[]> => quietly(async () => (await Preferences.keys()).keys, [])
