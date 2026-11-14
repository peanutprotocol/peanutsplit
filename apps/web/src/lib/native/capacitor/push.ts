import { PushNotifications, type ActionPerformed } from '@capacitor/push-notifications'
import { listen, quietly } from './guard'

export type PushPermission = 'granted' | 'denied' | 'prompt'

/** The notification permission state, or null when push is unavailable. */
export const permission = (): Promise<PushPermission | null> =>
    quietly(async () => {
        const { receive } = await PushNotifications.checkPermissions()
        return receive === 'granted' || receive === 'denied' ? receive : 'prompt'
    }, null)

/** Asks for notification permission once; returns the resulting state, or null when unavailable. */
export const requestPermission = (): Promise<PushPermission | null> =>
    quietly(async () => {
        const { receive } = await PushNotifications.requestPermissions()
        return receive === 'granted' || receive === 'denied' ? receive : 'prompt'
    }, null)

/** Starts APNs or FCM registration; the token arrives through `onRegistration`. False when unavailable. */
export const register = (): Promise<boolean> =>
    quietly(async () => {
        await PushNotifications.register()
        return true
    }, false)

/** Calls `handler` with the device token after `register()`. Returns a disposer. */
export const onRegistration = (handler: (token: string) => void): Promise<() => void> =>
    listen(() => PushNotifications.addListener('registration', (token) => handler(token.value)))

/** Calls `handler` when registration fails. Returns a disposer. */
export const onRegistrationError = (handler: (message: string) => void): Promise<() => void> =>
    listen(() => PushNotifications.addListener('registrationError', (error) => handler(error.error)))

/** Calls `handler` with the data of each tapped notification. Returns a disposer. */
export const onTap = (handler: (data: Record<string, unknown>) => void): Promise<() => void> =>
    listen(() =>
        PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) =>
            handler((action.notification.data ?? {}) as Record<string, unknown>)
        )
    )
