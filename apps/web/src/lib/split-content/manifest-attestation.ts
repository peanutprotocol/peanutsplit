import fs from 'node:fs'
import path from 'node:path'

export const SPLIT_CONTENT_GENERATED_ROOT = path.join(process.cwd(), 'src/generated/seo')

/** Read exactly the committed bytes that the renderer parses; absence means no guides ship. */
export function readSplitContentManifestBytes(root: string = SPLIT_CONTENT_GENERATED_ROOT): Buffer | null {
    try {
        return fs.readFileSync(path.join(root, 'manifest.json'))
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
    }
}
