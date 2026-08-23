export const PREVIEW_API_TARGET = "https://kumo-preview-zach-2267.vercel.app";

export const devProxyForMode = (mode: string) => mode === "remote"
  ? {
      "/api": {
        target: PREVIEW_API_TARGET,
        changeOrigin: true,
        secure: true,
      },
    }
  : undefined;
