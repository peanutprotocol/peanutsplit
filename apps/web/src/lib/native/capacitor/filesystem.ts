import { Directory, Filesystem } from '@capacitor/filesystem'
import { quietly } from './guard'

/**
 * Writes base64 `data` to the app cache as `name` and returns its `file://` URI for the share
 * sheet, or null when the write failed. The cache is the OS's to clear; nothing here is kept.
 */
export const writeCacheFile = (name: string, data: string): Promise<string | null> =>
    quietly(async () => (await Filesystem.writeFile({ path: name, data, directory: Directory.Cache })).uri, null)
