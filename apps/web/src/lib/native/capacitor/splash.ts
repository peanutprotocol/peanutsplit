import { SplashScreen } from '@capacitor/splash-screen'
import { quietly } from './guard'

/** Hides the launch splash (it stays up until this call: launchAutoHide is false). */
export const hide = (): Promise<void> => quietly(() => SplashScreen.hide(), undefined)
