import { boundedJson, EFFORTS, terminalRun, validEffort } from './protocol';
import { capabilityManifest, discoverCapabilities, matchesSchema, validateCapability, validateShape } from './capabilityManifest';
import { changedShapes, checkDocument, patchDocument, undoReceipts, withinSelection, type DocumentReceipt } from './documentOperations';
import type { Shape } from '../classes/shape';

export const shape = (id = 'one', patch: Partial<Shape> = {}): Shape => ({ id, type: 'rectangle', x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100, level: 0, zIndex: 0, ...patch });
describe('Astra protocol and capabilities', () => {
  it('uses exactly the supported Astra efforts and terminal states', () => {
    EFFORTS.forEach(effort => expect(validEffort(effort)).toBe(true));
    expect(validEffort('ultra')).toBe(false);
    expect(terminalRun('completed')).toBe(true); expect(terminalRun('awaiting_apply')).toBe(false);
  });
  it('bounds JSON numbers, size, depth and prototype fields before schema interpretation', () => {
    expect(() => boundedJson({ value: [null, true, 'safe', 42] })).not.toThrow();
    for (const value of [undefined, 'x'.repeat(120001), { x: Infinity }, { x: NaN }, { x: Number.MAX_SAFE_INTEGER + 1 }, JSON.parse('{"__proto__":{}}'), { constructor: {} }, { prototype: {} }]) expect(() => boundedJson(value)).toThrow();
    let deep: unknown = 1; for (let index = 0; index < 26; index++) deep = { next: deep };
    expect(() => boundedJson(deep)).toThrow('nested');
  });
  it('discovers every UI repository and editor command with parameter schemas', () => {
    expect(capabilityManifest.length).toBeGreaterThan(180);
    expect(new Set(capabilityManifest.map(item => item.id)).size).toBe(capabilityManifest.length);
    expect(discoverCapabilities('').domains).toContain('social');
    expect(discoverCapabilities('missing').capabilities).toEqual([]);
    expect(discoverCapabilities('canvas').shape).toBeDefined();
    expect(Object.keys(discoverCapabilities('canvas').definitions).length).toBeGreaterThan(5);
    expect(discoverCapabilities('editor').capabilities.some(item => item.name === 'createComponentSelected')).toBe(true);
    expect(validateCapability('board.createBoard', []).domain).toBe('board');
    expect(validateCapability('board.createBoard', ['Hello']).id).toBe('board.createBoard');
    expect(() => validateCapability('fetch', [])).toThrow('Unknown');
    expect(() => validateCapability('board.createBoard', [2])).toThrow('arguments');
    expect(() => validateCapability('board.createBoard', ['Hello', 'extra'])).toThrow();
    expect(() => validateCapability('canvas.select', [])).toThrow();
    expect(() => validateCapability('canvas.select', {} as unknown as unknown[])).toThrow();
  });
  it('validates the generated schema subset without dynamic evaluation', () => {
    const cases: Array<[unknown, Parameters<typeof matchesSchema>[1], boolean]> = [
      [1, { const: 1 }, true], [2, { const: 1 }, false], [null, { type: 'null' }, true], [0, { type: 'null' }, false],
      ['x', { type: 'string' }, true], [1, { type: 'string' }, false], ['long', { type: 'string', maxLength: 2 }, false], ['yes', { type: 'string', pattern: '^yes$' }, true], ['no', { type: 'string', pattern: '^yes$' }, false],
      [1, { type: 'number' }, true], ['1', { type: 'number' }, false], [NaN, { type: 'number' }, false], [-2, { type: 'number', minimum: 0 }, false], [2, { type: 'number', maximum: 1 }, false],
      [true, { type: 'boolean' }, true], [1, { type: 'boolean' }, false],
      [[1], { type: 'array', items: { type: 'number' } }, true], [[1, 2], { type: 'array', maxItems: 1, items: {} }, false], [['x'], { type: 'array', items: { type: 'number' } }, false], [1, { type: 'array', items: {} }, false],
      [null, { type: 'object' }, false], [[], { type: 'object' }, false], [1, { type: 'object' }, false],
      [{}, { type: 'object', required: ['x'] }, false], [{ x: 1 }, { type: 'object', properties: { x: { type: 'number' } }, additionalProperties: false }, true],
      [{ x: 1 }, { type: 'object', additionalProperties: true }, true], [{ x: 1 }, { type: 'object', additionalProperties: { type: 'number' } }, true], [{ x: 1 }, { type: 'object', additionalProperties: false }, false],
      [true, { anyOf: [{ type: 'string' }, { type: 'boolean' }] }, true], [1, { anyOf: [{ type: 'string' }] }, false], [42, {}, true],
    ];
    cases.forEach(([value, schema, expected]) => expect(matchesSchema(value, schema)).toBe(expected));
    expect(validateShape(shape())).toBe(true); expect(validateShape({ ...shape(), arbitrary: 1 })).toBe(false);
  });
});

describe('collaborative builder document operations', () => {
  it('changes only supplied fields with matching preconditions', () => {
    const before = shape();
    const result = patchDocument([before], [{ id: before.id, expected: { backgroundColor: null }, patch: { backgroundColor: '#fff' } }]);
    expect(result[0]).toEqual({ ...before, backgroundColor: '#fff' });
    expect(before.backgroundColor).toBeUndefined();
    const duplicate = { id: before.id, expected: {}, patch: {} };
    expect(() => patchDocument([before], [duplicate, duplicate])).toThrow('once');
    expect(() => patchDocument([], [duplicate])).toThrow('no longer');
    expect(() => patchDocument([before], [{ ...duplicate, patch: { id: 'new' } }])).toThrow('IDs');
    expect(() => patchDocument([before], [{ ...duplicate, patch: { opacity: .5 } }])).toThrow('changed');
    expect(() => patchDocument([before], [{ ...duplicate, expected: { width: 2 }, patch: { width: 3 } }])).toThrow('changed');
    expect(() => patchDocument([before], [{ ...duplicate, expected: { nope: null }, patch: { nope: 1 } }])).toThrow('unsupported');
  });
  it('respects locks and selection ancestry including cycles', () => {
    const locked = shape('one', { locked: true });
    expect(() => patchDocument([locked], [{ id: 'one', expected: { width: 100 }, patch: { width: 200 } }])).toThrow('Unlock');
    expect(patchDocument([locked], [{ id: 'one', expected: { locked: true }, patch: { locked: false } }])[0]?.locked).toBe(false);
    const tree = [shape('parent'), shape('child', { parentId: 'parent' }), shape('loop', { parentId: 'loop' })];
    expect(withinSelection(tree, 'child', ['parent'])).toBe(true);
    expect(withinSelection(tree, 'child', ['other'])).toBe(false);
    expect(withinSelection(tree, 'loop', [])).toBe(false);
    expect(withinSelection(tree, 'missing', [])).toBe(false);
    expect(changedShapes([shape()], [shape('other')]).ids).toEqual(['one', 'other']);
  });
  it('undoes applied fields without erasing later edits, parents or child additions', () => {
    const before = shape('one', { backgroundColor: 'red', opacity: 1, name: 'old' });
    const after = shape('one', { backgroundColor: 'blue', opacity: .5 });
    const added = shape('added');
    const removed = shape('removed');
    const receipt: DocumentReceipt = { runId: 'run', operationId: 'op', before: [before, removed], after: [after, added], timestamp: 1 };
    const result = undoReceipts([{ ...after, opacity: .8 }, added], [receipt]);
    expect(result.find(item => item.id === 'one')).toMatchObject({ backgroundColor: 'red', opacity: .8, name: 'old' });
    expect(result.some(item => item.id === 'added')).toBe(false); expect(result).toContainEqual(removed);
    expect(undoReceipts([after, added, shape('child', { parentId: 'added' })], [receipt]).some(item => item.id === 'added')).toBe(true);
    expect(undoReceipts([shape('added', { name: 'changed' }), removed], [receipt]).find(item => item.id === 'added')?.name).toBe('changed');
    expect(undoReceipts([], [{ ...receipt, before: [shape('orphan', { parentId: 'missing' })], after: [] }])).toEqual([]);
    const withNew = { ...shape(), backgroundColor: 'blue' };
    expect(undoReceipts([withNew], [{ ...receipt, before: [shape()], after: [withNew] }])[0]?.backgroundColor).toBeUndefined();
    expect(undoReceipts([], [{ ...receipt, before: [], after: [shape()] }])).toEqual([]);
    expect(undoReceipts([shape('parent')], [{ ...receipt, before: [shape('child', { parentId: 'parent' })], after: [] }])).toHaveLength(2);
    const parent = shape('parent'); const child = shape('child', { parentId: 'parent' });
    const creation = { ...receipt, before: [], after: [parent, child] };
    expect(undoReceipts([], [{ ...receipt, before: [child, parent], after: [] }])).toEqual([parent, child]);
    const reparented = { ...child, parentId: 'new-parent' };
    expect(undoReceipts([shape('new-parent'), reparented], [{ ...receipt, before: [child], after: [reparented] }]).find(item => item.id === 'child')?.parentId).toBe('new-parent');
    expect(undoReceipts([parent, { ...child, name: 'Collaborator edit' }], [creation])).toHaveLength(2);
    expect(undoReceipts([parent, child], [creation])).toEqual([]);
    expect(undoReceipts([parent, child, shape('connector', { connectorStart: { shapeId: 'child' } } as Partial<Shape>)], [creation])).toHaveLength(3);
    expect(undoReceipts([parent, child, { ...shape('retained'), linkedIds: ['child'] } as Shape], [creation])).toHaveLength(3);
  });
  it('reports structural and text problems without treating every overlap as a defect', () => {
    expect(checkDocument([shape()])).toEqual([]);
    const findings = checkDocument([shape('invalid', { width: Infinity }), shape('orphan', { parentId: 'gone' }), shape('text', { type: 'text', text: 'Hello', fontSize: 20, height: 10 }), shape('cycle', { parentId: 'cycle' })]);
    expect(findings.map(item => item.message)).toEqual(expect.arrayContaining(['Invalid shape geometry or field values', 'Missing parent', 'Text box is shorter than one line', 'Cyclic parent reference']));
  });
});

it('accepts only bounded user/assistant conversation text', async () => {
  const { conversationMessages } = await import('./protocol');
  expect(conversationMessages(undefined)).toEqual([]);
  expect(conversationMessages([{ role: 'user', content: 'Hi', extra: 'ignored' }])).toEqual([{ role: 'user', content: 'Hi' }]);
  for (const value of [null, {}, Array(25).fill({ role: 'user', content: 'Hi' }), [null], [{ role: 'developer', content: 'Bad' }], [{ role: 'user', content: 1 }], [{ role: 'assistant', content: ' ' }], [{ role: 'user', content: 'x'.repeat(8001) }], Array(5).fill({ role: 'user', content: 'x'.repeat(8000) })]) expect(() => conversationMessages(value)).toThrow();
});
it('discovers individual actions and includes the Shape schema only once', () => {
  const patch = discoverCapabilities('canvas.patch');
  expect(patch.capabilities.map(item => item.id)).toEqual(['canvas.patch']);
  expect(patch.definitions).toEqual({});
  const create = discoverCapabilities('canvas.create');
  expect(create.capabilities[0]?.parameters[0]?.schema.items).toEqual({ $ref: '#/definitions/Shape' });
  expect(create.definitions[create.definitions.Shape!.$ref!.slice('#/definitions/'.length)]?.properties).toBeDefined();
  expect(discoverCapabilities('canvas').shape).toEqual({ $ref: '#/definitions/Shape' });
});
