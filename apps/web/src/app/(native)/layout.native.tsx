import { type Metadata, type Viewport } from 'next'
import { bodyFontClassName } from '@/lib/fonts'
import { NativeShell } from '@/lib/native/NativeShell'
import '../../styles/globals.css'
import '../../styles/desktop-frame.css'

export const metadata: Metadata = {
    title: 'Split',
}

/** Same viewport as the product layout; `viewport-fit=cover` keeps the home-indicator insets. */
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    colorScheme: 'light',
    viewportFit: 'cover',
    themeColor: '#FFC900',
}

/** Copied from the product layout: the in-app animation switch has to apply before React mounts. */
const motionPreferencePreflight = `
try {
  var splitSettings = JSON.parse(localStorage.getItem('ps:settings') || '{}');
  if (splitSettings.animationsEnabled === false) {
    document.documentElement.classList.add('reduce-animations');
  }
} catch (_) {}
`

/**
 * Capacitor serves this root index.html for every path without a dot (a cold start, a reload
 * after a language switch, Android recreating the WebView). Save the real path for NativeEntry and
 * reset the URL to `/`, so Next hydrates the root payload at the URL it was built for.
 * ARCHITECTURE 4.3.
 */
const bootPathCapture = `
window.__splitBootPath = location.pathname + location.search + location.hash;
if (location.pathname !== '/') history.replaceState(null, '', '/');
`

/**
 * The app's only root layout, built into a static export. No PWA head tags, no service worker, no
 * JSON-LD: the binary is the app, and the locale is chosen on the device (NativeIntlProvider).
 */
export default function NativeRootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" translate="no" style={{ colorScheme: 'light' }} suppressHydrationWarning>
            <head>
                <meta name="google" content="notranslate" />
                {/* Literal parser-blocking scripts: both must run before the Next bootstrap. */}
                <script id="split-motion-preflight" dangerouslySetInnerHTML={{ __html: motionPreferencePreflight }} />
                <script id="split-boot-path" dangerouslySetInnerHTML={{ __html: bootPathCapture }} />
            </head>
            <body className={bodyFontClassName}>
                <NativeShell>{children}</NativeShell>
            </body>
        </html>
    )
}
