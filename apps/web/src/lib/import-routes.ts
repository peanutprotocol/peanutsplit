const roomBasePath = (slug: string): string => `/r/${encodeURIComponent(slug)}`

export const existingRoomImportPath = (slug: string): string => `${roomBasePath(slug)}/import`
export const importedRoomPath = (slug: string): string => roomBasePath(slug)
