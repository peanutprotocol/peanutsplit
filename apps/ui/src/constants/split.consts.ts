/// Server-side only. In the browser the app talks to the same-origin `/_split`
/// rewrite instead (see next.config.js) so previews and devcontainers never
/// need a second forwarded port.
export const SPLIT_API_URL = process.env.SPLIT_API_URL ?? 'http://localhost:5051'
