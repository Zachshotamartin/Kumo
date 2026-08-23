export type KumoLogoContext = "idle" | "loading" | "success" | "error" | "attention" | "hover";

export const KUMO_LOGO_CONFIG = {
  color: "#d9d9d9",
  expression: "surpris",
  design: {
    bodyAspect: 0.04,
    legLength: 1.3,
    legThickness: 1.35,
    legStyle: "paddle",
    eyeColor: "#b87a2e",
    legs: [
      { angle: 139.5156419317742, reach: 1.35, bend: 1 },
      { angle: 35.67021330221917, reach: 1.35, bend: -1 },
      { angle: 78, reach: 1.35, bend: -1 },
      { angle: 105.14998241104365, reach: 1.35, bend: 1 },
    ],
  },
  motion: {
    amount: 1,
    speed: 0.92,
    rhythm: "breathe",
  },
  followPointer: true,
} as const;
