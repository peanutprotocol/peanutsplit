import { roomPath } from './platform'

// roomPath encodes the slug as one path segment on web and as the `slug` query value in the app.
export const existingRoomImportPath = (slug: string): string => roomPath(slug, 'import')
export const importedRoomPath = (slug: string): string => roomPath(slug)
