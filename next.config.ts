import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tryb deweloperski przez tunel (podgląd na telefonie): Next.js domyślnie blokuje skrypty
  // i HMR dla obcych domen — bez tego strona stała na preloaderze.
  allowedDevOrigins: ["*.trycloudflare.com", "*.untun.dev", "*.ngrok-free.app", "*.loca.lt", "192.168.*.*"],
};

export default nextConfig;
