import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Every page is static and all data goes through API routes, so the build's
// prerendered output served from Workers assets is all the cache we need
// (no R2 bucket, which would require a payment method on the account).
export default defineCloudflareConfig({
	incrementalCache: staticAssetsIncrementalCache,
});
