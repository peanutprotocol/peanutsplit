#!/usr/bin/env node
/**
 * Writes the ExportOptions.plist that `xcodebuild -exportArchive` uses in native-release.yml.
 *
 *   EXPORT_OPTIONS_PATH=<file> APPLE_TEAM_ID=<team> PROFILE_NAME=<profile> node scripts/native/render-export-options.mjs
 *
 * App Store Connect distribution with manual signing: the archive is already signed by the
 * Release configuration in project.pbxproj, and the export re-signs with the same profile.
 * The bundle ID comes from capacitor.config.ts, so set-identifiers.mjs needs no edit here.
 * Build numbers come from the archive (scripts/native/version-code.mjs), never from Xcode.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const escapeXml = (value) =>
    value.replace(
        /[&<>"']/g,
        (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]
    )

export function renderExportOptions({ appId, teamId, profileName }) {
    if (!/^[A-Z0-9]{10}$/.test(teamId)) throw new Error('APPLE_TEAM_ID must be a 10-character Apple Team ID')
    if (!appId) throw new Error('the bundle ID is empty')
    if (!profileName) throw new Error('the provisioning profile name is empty')
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>destination</key>
    <string>export</string>
    <key>teamID</key>
    <string>${escapeXml(teamId)}</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>${escapeXml(appId)}</key>
        <string>${escapeXml(profileName)}</string>
    </dict>
    <key>manageAppVersionAndBuildNumber</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const required = (name) => {
        const value = process.env[name]
        if (!value) {
            console.error(`render-export-options: ${name} is required`)
            process.exit(1)
        }
        return value
    }
    const outputPath = required('EXPORT_OPTIONS_PATH')
    const appId = readFileSync(path.join(root, 'capacitor.config.ts'), 'utf8').match(/appId: '([^']+)'/)?.[1] ?? ''
    try {
        const plist = renderExportOptions({
            appId,
            teamId: required('APPLE_TEAM_ID'),
            profileName: required('PROFILE_NAME'),
        })
        // `wx` never follows or overwrites a file that is already there.
        writeFileSync(outputPath, plist, { flag: 'wx', mode: 0o600 })
    } catch (error) {
        console.error(`render-export-options: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
    }
    console.log(`render-export-options: wrote ${outputPath} for ${appId}`)
}
