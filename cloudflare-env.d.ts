// Bindings from wrangler.jsonc. Hand-written instead of `wrangler types`,
// whose generated runtime globals replace the DOM fetch/Response types and
// break every client-side `res.json()` in the app.
import type { D1Database } from '@cloudflare/workers-types'

declare global {
  interface CloudflareEnv {
    DB: D1Database
  }
}

export {}
