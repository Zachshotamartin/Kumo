interface ActivityPresence {
  activeShapeIds?: readonly string[];
  builder?: { expiresAt: number; shapeIds: readonly string[] } | null;
}
export const claimedShapeIds = (presence: ActivityPresence, now = Date.now()): readonly string[] => [
  ...(presence.activeShapeIds ?? []),
  ...(presence.builder && presence.builder.expiresAt > now ? presence.builder.shapeIds : []),
];
