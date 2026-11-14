import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The first-paint surface: `body` gets `bg-background` from globals.css (tailwind.config.js
 * `background: '#FAF4F0'`). The WebView, the status bar and the splash use it so nothing flashes.
 */
const SURFACE = '#FAF4F0'

const config: CapacitorConfig = {
    appId: 'com.peanutsplit.app', // PLACEHOLDER: Hugo confirms before the first signed build; never changes after
    appName: 'Split',
    webDir: '.next-native',
    backgroundColor: SURFACE,
    // Origin of localStorage. NEVER change these three after release: every user's rooms live under them.
    server: { iosScheme: 'capacitor', androidScheme: 'https', hostname: 'localhost' },
    // Release lanes export NODE_ENV=production before `cap sync`, which turns WebView debugging off.
    android: { allowMixedContent: false, webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production' },
    plugins: {
        CapacitorHttp: { enabled: false },
        // NativeShell hides the splash once the first real screen commits (4 s cap).
        SplashScreen: { launchAutoHide: false, launchFadeOutDuration: 0, backgroundColor: SURFACE },
        // Not overlaying: Android 7-14 WebViews report no top inset, so the header would sit under the clock.
        StatusBar: { style: 'LIGHT', backgroundColor: SURFACE, overlaysWebView: false },
        PushNotifications: { presentationOptions: [] },
    },
}

export default config
