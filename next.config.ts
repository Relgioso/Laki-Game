import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Workerd can fail with an opaque "internal error" on Windows when the
// workspace path makes its SQLite persistence paths too long. A short temp
// directory also avoids writes to a read-only roaming profile in sandboxes.
const localWranglerRoot = join(tmpdir(), "laki-game-wrangler");
if (process.env.NODE_ENV === "development") {
  process.env.XDG_CONFIG_HOME ??= join(localWranglerRoot, "config");
}

// Gives `next dev` access to the D1 binding via getCloudflareContext().
initOpenNextCloudflareForDev({
  persist: { path: join(localWranglerRoot, "state", "v3") },
});

const nextConfig: NextConfig = {
  // Local assets only (~2MB total) — skip the Cloudflare Images binding.
  images: { unoptimized: true },
};

export default nextConfig;
