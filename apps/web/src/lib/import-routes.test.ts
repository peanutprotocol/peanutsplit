import { afterEach, describe, expect, it, vi } from 'vitest'
import { existingRoomImportPath, importedRoomPath } from './import-routes'

describe('existing-room import routes', () => {
    it('keeps the room credential in the redacted room path and encodes it as one segment', () => {
        expect(existingRoomImportPath('summer/trip?private=yes')).toBe('/r/summer%2Ftrip%3Fprivate%3Dyes/import')
        expect(existingRoomImportPath('summer/trip?private=yes')).not.toContain('?')
        expect(importedRoomPath('summer/trip?private=yes')).toBe('/r/summer%2Ftrip%3Fprivate%3Dyes')
    })
})

describe('existing-room import routes in the store app', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it('points at the static native routes with the slug as one encoded query value', async () => {
        vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
        vi.resetModules()
        const routes = await import('./import-routes')
        expect(routes.existingRoomImportPath('summer/trip?private=yes')).toBe(
            '/room/import/?slug=summer%2Ftrip%3Fprivate%3Dyes'
        )
        expect(routes.importedRoomPath('ski-trip-kunc-syrup-drum')).toBe('/room/?slug=ski-trip-kunc-syrup-drum')
    })
})
