import { StatusBar } from '@capacitor/status-bar'
import { quietly } from './guard'

/** The status bar's height in CSS pixels when the bridge reports it, else 0. capacitor.config.ts owns its style. */
export const height = (): Promise<number> => quietly(async () => (await StatusBar.getInfo()).height ?? 0, 0)
