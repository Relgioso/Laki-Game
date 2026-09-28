import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Local assets only (~2MB total) — skip the Cloudflare Images binding.
  images: { unoptimized: true },
};

export default nextConfig;

// Gives `next dev` access to the D1 binding via getCloudflareContext().
initOpenNextCloudflareForDev();
