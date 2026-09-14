import type { Shape } from '../classes/shape';

export const rewriteShapeAssetIds = (shapes: Shape[], assetIds: Record<string, string>): Shape[] => shapes.map(shape => ({
  ...shape,
  ...(shape.assetId && assetIds[shape.assetId] ? { assetId: assetIds[shape.assetId], backgroundImage: undefined } : {}),
  ...(shape.shapes ? { shapes: rewriteShapeAssetIds(shape.shapes, assetIds) } : {}),
}));

export const collectShapeAssetIds = (shapes: Shape[]): string[] => [...new Set(shapes.flatMap((shape): string[] => [
  ...(shape.assetId ? [shape.assetId] : []),
  ...(shape.shapes ? collectShapeAssetIds(shape.shapes) : []),
]))];
