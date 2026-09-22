import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'

export interface NotificationBrowserOptions {
    platform?: 'android' | 'ios'
    standalone?: boolean
    permission?: NotificationPermission
    permissionResult?: NotificationPermission
    unsupported?: boolean
    endpoint?: string
}

/** Only OS browser APIs are modeled. Subscription and handoff requests reach the real server. */
export async function modelNotificationBrowser(page: Page, options: NotificationBrowserOptions = {}): Promise<string> {
    const endpoint = options.endpoint ?? `https://fcm.googleapis.com/fcm/send/notification-qa-${randomUUID()}`
    await page.addInitScript(
        ({ platform, standalone, permission, permissionResult, unsupported, endpoint }) => {
            const ios = platform === 'ios'
            Object.defineProperties(navigator, {
                userAgent: {
                    configurable: true,
                    value: ios
                        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Version/18.5 Mobile/15E148 Safari/604.1'
                        : 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36',
                },
                platform: { configurable: true, value: ios ? 'iPhone' : 'Linux armv8l' },
                standalone: { configurable: true, value: standalone },
                maxTouchPoints: { configurable: true, value: 5 },
            })
            const matchMedia = window.matchMedia.bind(window)
            window.matchMedia = (query: string) =>
                query.includes('display-mode: standalone')
                    ? ({
                          matches: standalone,
                          media: query,
                          addEventListener() {},
                          removeEventListener() {},
                      } as MediaQueryList)
                    : matchMedia(query)

            if (unsupported) {
                Reflect.deleteProperty(window, 'Notification')
                Reflect.deleteProperty(window, 'PushManager')
                return
            }

            const increment = (key: string) =>
                localStorage.setItem(key, String(Number(localStorage.getItem(key) ?? 0) + 1))
            const subscription = {
                endpoint,
                toJSON: () => ({ endpoint, keys: { p256dh: 'BPk3p256dhKeyMaterial', auth: 'authKeyMaterial' } }),
                unsubscribe: async () => {
                    increment('__qa-push-revocations')
                    localStorage.removeItem('__qa-push-subscribed')
                    return true
                },
            }
            const registration = {
                scope: `${location.origin}/`,
                active: null,
                installing: null,
                waiting: null,
                addEventListener() {},
                removeEventListener() {},
                update: async () => {},
                pushManager: {
                    getSubscription: async () =>
                        localStorage.getItem('__qa-push-subscribed') === '1' ? subscription : null,
                    subscribe: async () => {
                        localStorage.setItem('__qa-push-subscribed', '1')
                        return subscription
                    },
                },
            }
            Object.defineProperty(window, 'Notification', {
                configurable: true,
                value: {
                    get permission() {
                        return localStorage.getItem('__qa-push-permission') ?? permission
                    },
                    requestPermission: async () => {
                        increment('__qa-push-permission-requests')
                        localStorage.setItem('__qa-push-permission', permissionResult)
                        return permissionResult
                    },
                },
            })
            Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
            Object.defineProperty(navigator, 'serviceWorker', {
                configurable: true,
                value: {
                    controller: null,
                    register: async () => registration,
                    getRegistration: async () => registration,
                    getRegistrations: async () => [registration],
                    ready: Promise.resolve(registration),
                    addEventListener() {},
                    removeEventListener() {},
                },
            })
        },
        {
            platform: options.platform ?? 'android',
            standalone: options.standalone ?? false,
            permission: options.permission ?? 'default',
            permissionResult: options.permissionResult ?? 'granted',
            unsupported: options.unsupported ?? false,
            endpoint,
        }
    )
    return endpoint
}
