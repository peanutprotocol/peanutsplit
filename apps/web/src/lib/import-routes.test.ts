import { describe, expect, it } from 'vitest'
import { existingRoomImportPath, importedRoomPath } from './import-routes'

describe('existing-room import routes', () => {
    it('keeps the room credential in the redacted room path and encodes it as one segment', () => {
        expect(existingRoomImportPath('summer/trip?private=yes')).toBe('/r/summer%2Ftrip%3Fprivate%3Dyes/import')
        expect(existingRoomImportPath('summer/trip?private=yes')).not.toContain('?')
        expect(importedRoomPath('summer/trip?private=yes')).toBe('/r/summer%2Ftrip%3Fprivate%3Dyes')
    })
})
