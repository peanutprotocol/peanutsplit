#!/usr/bin/env node
/**
 * Fails when a native setting that a store review or a user's data depends on has drifted
 * (ARCHITECTURE 13 and 15). No dependencies; prints one line per check.
 *
 *   node scripts/native/assert-native-config.mjs                  # source mode: config and both projects
 *   node scripts/native/assert-native-config.mjs --app <App.app>  # the Info.plist Xcode built
 *   ... --root <dir>   checks a copy of apps/web instead (used to prove a check fails)
 *
 * The Xcode project, the plists and the manifest are parsed as text: the checks must run on Linux,
 * where neither Xcode nor the Android tools exist.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const option = (name) => {
    const index = args.indexOf(name)
    return index === -1 ? null : args[index + 1]
}
const root = path.resolve(option('--root') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'))
const appBundle = option('--app')

const failures = []
function check(label, ok, detail = '') {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? `: ${detail}` : ''}`)
    if (!ok) failures.push(label)
}
const read = (file) => readFileSync(path.join(root, file), 'utf8')

// --- A minimal XML plist reader (dict, array, string, integer, real, true, false) ----------------

function parsePlist(xml) {
    // Comments, the XML declaration and the doctype are matched as tokens and dropped, so a comment
    // that contains '<' or '>' never splits into stray tokens.
    const tokens = xml
        .match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)
        .filter((token) => token.trim() !== '' && !/^<(!--|\?xml|!DOCTYPE)/.test(token))
    let at = 0
    const decode = (text) =>
        text
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&')
    function text(close) {
        let value = ''
        while (tokens[at] !== close) value += tokens[at++]
        at++
        return decode(value)
    }
    function value() {
        const tag = tokens[at++]
        if (tag === '<true/>') return true
        if (tag === '<false/>') return false
        if (tag === '<array/>') return []
        if (tag === '<dict/>') return {}
        if (tag === '<string/>') return ''
        if (tag === '<string>') return text('</string>')
        if (tag === '<integer>' || tag === '<real>') return Number(text(`</${tag.slice(1)}`))
        if (tag === '<array>') {
            const list = []
            while (tokens[at] !== '</array>') list.push(value())
            at++
            return list
        }
        if (tag === '<dict>') {
            const dict = {}
            while (tokens[at] !== '</dict>') {
                if (tokens[at++] !== '<key>') throw new Error(`plist: expected <key> near token ${at}`)
                const key = text('</key>')
                dict[key] = value()
            }
            at++
            return dict
        }
        throw new Error(`plist: unexpected ${tag}`)
    }
    if (tokens[at++] !== '<plist version="1.0">') throw new Error('plist: no <plist> root')
    return value()
}

function readPlist(file) {
    const raw = readFileSync(file)
    // Xcode writes the built Info.plist as a binary plist; plutil exists wherever Xcode does.
    const xml =
        raw.subarray(0, 6).toString() === 'bplist'
            ? execFileSync('plutil', ['-convert', 'xml1', '-o', '-', file], { encoding: 'utf8' })
            : raw.toString('utf8')
    return parsePlist(xml)
}

/** PNG colour types 4 and 6 carry alpha; a tRNS chunk adds it to the others. */
function pngHasAlpha(file) {
    const png = readFileSync(file)
    if (png.subarray(1, 4).toString() !== 'PNG') throw new Error(`${file} is not a PNG`)
    const colourType = png[25]
    if (colourType === 4 || colourType === 6) return true
    // Walk the chunks rather than search the bytes: compressed pixel data can contain "tRNS".
    for (let at = 8; at + 8 <= png.length; at += 12 + png.readUInt32BE(at)) {
        const type = png.subarray(at + 4, at + 8).toString('latin1')
        if (type === 'tRNS') return true
        if (type === 'IDAT' || type === 'IEND') break
    }
    return false
}

// --- capacitor.config.ts -------------------------------------------------------------------------

/**
 * The config file holds plain values plus one type annotation. Dropping the type import and the
 * annotation leaves JavaScript, which runs as a module, so the checks see the real values rather
 * than a regex's guess. A config that no longer evaluates this way fails here, loudly.
 */
async function loadCapacitorConfig() {
    const source = read('capacitor.config.ts')
        .replace(/^import type .*$/m, '')
        .replace(/:\s*CapacitorConfig\b/, '')
    return (await import(`data:text/javascript,${encodeURIComponent(source)}`)).default
}

async function checkCapacitorConfig() {
    let config
    try {
        config = await loadCapacitorConfig()
    } catch (error) {
        check('capacitor.config.ts evaluates', false, error.message)
        return null
    }
    const server = config.server ?? {}
    const plugins = config.plugins ?? {}
    // Changing any of these three moves localStorage to a new origin: every room on the phone is lost.
    check("server.iosScheme is 'capacitor'", server.iosScheme === 'capacitor', String(server.iosScheme))
    check("server.androidScheme is 'https'", server.androidScheme === 'https', String(server.androidScheme))
    check("server.hostname is 'localhost'", server.hostname === 'localhost', String(server.hostname))
    check('no server.url (the app ships its bundle, never a remote site)', server.url === undefined, String(server.url))
    check('CapacitorHttp is off', plugins.CapacitorHttp?.enabled === false)
    check("webDir is '.next-native'", config.webDir === '.next-native', String(config.webDir))
    check(
        'StatusBar.overlaysWebView is false',
        plugins.StatusBar?.overlaysWebView === false,
        String(plugins.StatusBar?.overlaysWebView)
    )
    check(
        'StatusBar has a backgroundColor',
        /^#[0-9a-f]{6}$/i.test(plugins.StatusBar?.backgroundColor ?? ''),
        String(plugins.StatusBar?.backgroundColor)
    )
    check('SplashScreen hides itself only when the app says so', plugins.SplashScreen?.launchAutoHide === false)
    return config
}

// --- iOS -----------------------------------------------------------------------------------------

const IOS = 'ios/App'
const PORTRAIT = ['UIInterfaceOrientationPortrait']
const CAMERA_TEXT = 'Split uses the camera to scan a receipt you choose to photograph.'
// The share sheet offers 'Save Image' for a card PNG; without this key iOS kills the app on that tap.
const PHOTO_ADD_TEXT = 'Split saves the image you choose to your photos.'

function checkInfoPlist() {
    const plist = readPlist(path.join(root, IOS, 'App/Info.plist'))
    check('Info.plist: ITSAppUsesNonExemptEncryption is false', plist.ITSAppUsesNonExemptEncryption === false)
    check(
        'Info.plist: NSCameraUsageDescription',
        plist.NSCameraUsageDescription === CAMERA_TEXT,
        plist.NSCameraUsageDescription
    )
    check(
        'Info.plist: NSPhotoLibraryAddUsageDescription',
        plist.NSPhotoLibraryAddUsageDescription === PHOTO_ADD_TEXT,
        plist.NSPhotoLibraryAddUsageDescription
    )
    check(
        "Info.plist: CFBundleDisplayName is 'Split'",
        plist.CFBundleDisplayName === 'Split',
        plist.CFBundleDisplayName
    )
    check('Info.plist: version from $(MARKETING_VERSION)', plist.CFBundleShortVersionString === '$(MARKETING_VERSION)')
    check('Info.plist: build from $(CURRENT_PROJECT_VERSION)', plist.CFBundleVersion === '$(CURRENT_PROJECT_VERSION)')
    check(
        'Info.plist: portrait only',
        JSON.stringify(plist.UISupportedInterfaceOrientations) === JSON.stringify(PORTRAIT)
    )
    check('Info.plist: no background modes', plist.UIBackgroundModes === undefined)
}

function checkEntitlements(file, apsEnvironment) {
    const label = path.basename(file)
    if (!existsSync(path.join(root, IOS, file))) {
        check(`${label} exists`, false)
        return
    }
    const entitlements = readPlist(path.join(root, IOS, file))
    check(
        `${label}: aps-environment is ${apsEnvironment}`,
        entitlements['aps-environment'] === apsEnvironment,
        entitlements['aps-environment']
    )
    check(
        `${label}: associated domain applinks:peanutsplit.com`,
        JSON.stringify(entitlements['com.apple.developer.associated-domains']) === '["applinks:peanutsplit.com"]'
    )
}

function checkPrivacyManifest() {
    const file = path.join(root, IOS, 'App/PrivacyInfo.xcprivacy')
    if (!existsSync(file)) {
        check('PrivacyInfo.xcprivacy exists', false)
        return
    }
    const manifest = readPlist(file)
    check('PrivacyInfo: NSPrivacyTracking is false', manifest.NSPrivacyTracking === false)
    check('PrivacyInfo: no tracking domains', (manifest.NSPrivacyTrackingDomains ?? []).length === 0)
    const collected = manifest.NSPrivacyCollectedDataTypes ?? []
    check('PrivacyInfo: collected data types declared', collected.length > 0)
    check(
        'PrivacyInfo: no collected type is used for tracking',
        collected.every((type) => type.NSPrivacyCollectedDataTypeTracking === false)
    )
    const reasons = (manifest.NSPrivacyAccessedAPITypes ?? []).flatMap(
        (api) => api.NSPrivacyAccessedAPITypeReasons ?? []
    )
    check('PrivacyInfo: UserDefaults reason CA92.1', reasons.includes('CA92.1'))
    check('PrivacyInfo: file timestamp reason C617.1', reasons.includes('C617.1'))
}

/** The build settings of every XCBuildConfiguration, with whether it belongs to the App target. */
function buildConfigurations(pbxproj) {
    return [
        ...pbxproj.matchAll(
            /\/\* (\w+) \*\/ = \{\s*isa = XCBuildConfiguration;[\s\S]*?buildSettings = \{([\s\S]*?)\n\t\t\t\};/g
        ),
    ].map(([, name, body]) => ({ name, body, target: body.includes('INFOPLIST_FILE') }))
}
const setting = (body, key) =>
    body.match(new RegExp(`^\\s*"?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"? = ("?)(.*?)\\1;$`, 'm'))?.[2]

function checkXcodeProject() {
    const pbxproj = read(`${IOS}/App.xcodeproj/project.pbxproj`)
    const configs = buildConfigurations(pbxproj)
    check('project.pbxproj: four build configurations found', configs.length === 4, String(configs.length))
    const targets = [...pbxproj.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map((match) => match[1])
    check(
        'project.pbxproj: IPHONEOS_DEPLOYMENT_TARGET is 16.4 everywhere',
        targets.length > 0 && targets.every((value) => value === '16.4'),
        targets.join(', ')
    )
    const families = [...pbxproj.matchAll(/TARGETED_DEVICE_FAMILY = ("?)([^";]*)\1;/g)].map((match) => match[2])
    check(
        'project.pbxproj: TARGETED_DEVICE_FAMILY is 1 (iPhone only)',
        families.length > 0 && families.every((value) => value === '1'),
        families.join(', ')
    )

    const debug = configs.find((config) => config.target && config.name === 'Debug')
    const release = configs.find((config) => config.target && config.name === 'Release')
    check(
        'App Debug uses App.entitlements',
        setting(debug?.body ?? '', 'CODE_SIGN_ENTITLEMENTS') === 'App/App.entitlements'
    )
    check(
        'App Release uses AppRelease.entitlements',
        setting(release?.body ?? '', 'CODE_SIGN_ENTITLEMENTS') === 'App/AppRelease.entitlements'
    )
    // Signing lives in the Release config only; on the xcodebuild command line it leaks onto the
    // Swift packages and breaks the archive (peanut-ui pitfall 9).
    check('App Release signs manually', setting(release?.body ?? '', 'CODE_SIGN_STYLE') === 'Manual')
    check('App Release names a Team ID', /^[A-Z0-9]{10}$/.test(setting(release?.body ?? '', 'DEVELOPMENT_TEAM') ?? ''))
    check(
        'App Release names the provisioning profile',
        setting(release?.body ?? '', 'PROVISIONING_PROFILE_SPECIFIER') === 'Peanut Split App Store'
    )

    const resources = pbxproj.match(/isa = PBXResourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/)?.[1] ?? ''
    check(
        'PrivacyInfo.xcprivacy is in the App target resources',
        resources.includes('PrivacyInfo.xcprivacy in Resources')
    )
    check(
        'PrivacyInfo.xcprivacy has a file reference',
        /isa = PBXFileReference;[^}]*path = PrivacyInfo\.xcprivacy;/.test(pbxproj)
    )
}

function checkAppDelegate() {
    // Comments do not count: the plugin needs the two posts in code.
    const code = read(`${IOS}/App/AppDelegate.swift`).replace(/\/\/.*$/gm, '')
    for (const name of [
        'capacitorDidRegisterForRemoteNotifications',
        'capacitorDidFailToRegisterForRemoteNotifications',
    ]) {
        check(
            `AppDelegate.swift posts .${name}`,
            new RegExp(`NotificationCenter\\.default\\.post\\(name: \\.${name}\\b`).test(code)
        )
    }
}

function checkIcons() {
    for (const file of ['resources/icon.png', `${IOS}/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`]) {
        const full = path.join(root, file)
        check(
            `${file} has no alpha channel`,
            existsSync(full) && !pngHasAlpha(full),
            existsSync(full) ? 'alpha found' : 'missing'
        )
    }
}

// --- Android -------------------------------------------------------------------------------------

function checkAndroid() {
    const manifest = read('android/app/src/main/AndroidManifest.xml')
    // The OS backup is the only way a person's room list reaches a new phone (INTERACTION 2.7).
    check('AndroidManifest: android:allowBackup="true"', /<application\b[^>]*android:allowBackup="true"/.test(manifest))
    check(
        'AndroidManifest: AD_ID removed',
        /android:name="com\.google\.android\.gms\.permission\.AD_ID"\s+tools:node="remove"/.test(manifest)
    )
    check('AndroidManifest: MainActivity is singleTask', /android:launchMode="singleTask"/.test(manifest))
    check(
        'AndroidManifest: verified App Link for https://peanutsplit.com/r/',
        /<intent-filter android:autoVerify="true">[\s\S]*?<data android:scheme="https" android:host="peanutsplit\.com" android:pathPrefix="\/r\/" \/>/.test(
            manifest
        )
    )
    const variables = read('android/variables.gradle')
    for (const [key, value] of [
        ['minSdkVersion', 24],
        ['compileSdkVersion', 36],
        ['targetSdkVersion', 36],
    ]) {
        check(`variables.gradle: ${key} = ${value}`, new RegExp(`${key} = ${value}\\b`).test(variables))
    }
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
        const file = `android/app/src/main/res/drawable-${density}/ic_stat_split.png`
        check(`${file} exists`, existsSync(path.join(root, file)))
    }
}

// --- --app: the bundle Xcode built ---------------------------------------------------------------

async function checkBuiltApp(bundle) {
    const config = await loadCapacitorConfig()
    const plist = readPlist(path.join(bundle, 'Info.plist'))
    check(
        'built Info.plist: bundle ID matches capacitor.config.ts',
        plist.CFBundleIdentifier === config.appId,
        plist.CFBundleIdentifier
    )
    check(
        "built Info.plist: CFBundleDisplayName is 'Split'",
        plist.CFBundleDisplayName === 'Split',
        plist.CFBundleDisplayName
    )
    check('built Info.plist: ITSAppUsesNonExemptEncryption is false', plist.ITSAppUsesNonExemptEncryption === false)
    check('built Info.plist: NSCameraUsageDescription', plist.NSCameraUsageDescription === CAMERA_TEXT)
    check(
        'built Info.plist: NSPhotoLibraryAddUsageDescription',
        plist.NSPhotoLibraryAddUsageDescription === PHOTO_ADD_TEXT,
        plist.NSPhotoLibraryAddUsageDescription
    )
    check('built Info.plist: MinimumOSVersion is 16.4', plist.MinimumOSVersion === '16.4', plist.MinimumOSVersion)
    check(
        'built Info.plist: iPhone only',
        JSON.stringify(plist.UIDeviceFamily) === '[1]',
        JSON.stringify(plist.UIDeviceFamily)
    )
    check(
        'built Info.plist: portrait only',
        JSON.stringify(plist.UISupportedInterfaceOrientations) === JSON.stringify(PORTRAIT)
    )
    for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) {
        check(
            `built Info.plist: ${key} is resolved`,
            typeof plist[key] === 'string' && plist[key] !== '' && !plist[key].includes('$('),
            plist[key]
        )
    }
    check('built app contains PrivacyInfo.xcprivacy', existsSync(path.join(bundle, 'PrivacyInfo.xcprivacy')))
    check('built app contains the web bundle', existsSync(path.join(bundle, 'public/index.html')))
}

if (appBundle) {
    await checkBuiltApp(path.resolve(appBundle))
} else {
    await checkCapacitorConfig()
    checkInfoPlist()
    checkEntitlements('App/App.entitlements', 'development')
    checkEntitlements('App/AppRelease.entitlements', 'production')
    checkPrivacyManifest()
    checkXcodeProject()
    checkAppDelegate()
    checkIcons()
    checkAndroid()
}

if (failures.length > 0) {
    console.error(`\n${failures.length} native config check(s) failed.`)
    process.exit(1)
}
console.log('\nNative config OK.')
