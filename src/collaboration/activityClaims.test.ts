import { claimedShapeIds } from './activityClaims';
it('shares human and unexpired builder claims without retaining disconnected claims', () => {
  expect(claimedShapeIds({})).toEqual([]);
  expect(claimedShapeIds({ activeShapeIds: ['a'], builder: { expiresAt: 2, shapeIds: ['b'] } }, 1)).toEqual(['a', 'b']);
  expect(claimedShapeIds({ builder: { expiresAt: 1, shapeIds: ['b'] } }, 2)).toEqual([]);
});
