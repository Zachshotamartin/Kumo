import { activateControl, clearBuilderFiles, fillControl, inspectControls, keyControl, pickBuilderFile, resolveBuilderFile } from './uiCapabilities';
beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ x: 0, y: 0, width: 100, height: 30 }] as unknown as DOMRectList);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); clearBuilderFiles(); });
const find = (label: string) => inspectControls().find(item => item.label === label)!.handle;
it('observes accessible controls and excludes credentials, hidden and builder-owned UI', () => {
  document.body.innerHTML = '<button aria-label="Named">Text</button><span id="label">Referenced</span><button aria-labelledby="label">X</button><label>Field<input value="abc"></label><button title="Title"></button><input placeholder="Placeholder"><textarea></textarea><select aria-label="Choice"><option value="a">Alpha</option></select><button disabled>Disabled</button><input type="password" value="secret"><input type="hidden"><div hidden><button>Hidden</button></div><div data-builder><button>Builder</button></div><div aria-hidden="true"><button>Invisible</button></div><div inert><button>Inert</button></div><div id="liveblocks-badge"><button>Badge</button></div>';
  const controls = inspectControls();
  expect(controls.map(item => item.label)).toEqual(['Named', 'Referenced', 'Field', 'Title', 'Placeholder', 'textarea', 'Choice']);
  expect(controls.find(item => item.label === 'Choice')?.options).toEqual([{ value: 'a', label: 'Alpha' }]);
  expect(JSON.stringify(controls)).not.toContain('secret');
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([] as unknown as DOMRectList); expect(inspectControls()).toEqual([]);
});
it('only activates a currently observed unchanged control', async () => {
  document.body.innerHTML = '<button>Hello</button><input aria-label="Name" value="old">';
  const button = document.querySelector('button')!; const clicked = vi.fn(); button.onclick = clicked;
  await activateControl(find('Hello'), vi.fn()); expect(clicked).toHaveBeenCalledOnce();
  await expect(activateControl('missing', vi.fn())).rejects.toThrow('changed');
  let handle = find('Hello'); button.textContent = 'Changed'; await expect(activateControl(handle, vi.fn())).rejects.toThrow('changed');
  handle = find('Changed'); button.disabled = true; await expect(activateControl(handle, vi.fn())).rejects.toThrow('changed');
  button.disabled = false; handle = find('Changed'); button.remove(); await expect(activateControl(handle, vi.fn())).rejects.toThrow('changed');
  handle = find('Name'); document.querySelector('input')!.value = 'new'; await expect(activateControl(handle, vi.fn())).rejects.toThrow('changed');
});
it('leaves existing dialogs, file pickers and external links to the user', async () => {
  document.body.innerHTML = '<div role="dialog"><button>Confirm</button></div><input type="file" aria-label="Upload"><a href="https://example.com">External</a><a href="/local">Internal</a>';
  const handoff = vi.fn().mockResolvedValue(undefined);
  for (const name of ['Confirm', 'Upload', 'External']) expect(await activateControl(find(name), handoff)).toEqual({ userHandoff: true });
  expect(handoff).toHaveBeenCalledTimes(3);
  document.querySelectorAll('a')[1]!.onclick = event => event.preventDefault();
  expect(await activateControl(find('Internal'), handoff)).toEqual({ activated: true });
});
it('updates native fields through input/change events while enforcing their constraints', () => {
  document.body.innerHTML = '<label>Name<input value="old"></label><textarea aria-label="Notes"></textarea><select aria-label="Choice"><option value="a">A</option><option value="b">B</option><option value="c" disabled>C</option></select><input aria-label="Read" readonly><input type="checkbox" aria-label="Check"><button>Button</button><div contenteditable="true" aria-label="Rich"></div>';
  const changed = vi.fn(); document.querySelector('input')!.addEventListener('input', changed);
  expect(fillControl(find('Name'), 'new')).toEqual({ filled: true }); expect(changed).toHaveBeenCalled();
  fillControl(find('Notes'), 'A note'); expect(document.querySelector('textarea')!.value).toBe('A note');
  fillControl(find('Choice'), 'b'); expect(document.querySelector('select')!.value).toBe('b');
  expect(() => fillControl(find('Choice'), 'c')).toThrow('available');
  for (const label of ['Read', 'Check', 'Button']) expect(() => fillControl(find(label), 'x')).toThrow('text');
  Object.defineProperty(document.querySelector('[contenteditable]'), 'isContentEditable', { value: true });
  fillControl(find('Rich'), 'Rich text'); expect(document.querySelector('[contenteditable]')!.textContent).toBe('Rich text');
});
it('uses scoped keyboard events without confirming dialogs', () => {
  document.body.innerHTML = '<button>Target</button><div role="dialog"><button>Confirm</button></div>';
  const keydown = vi.fn(); document.querySelector('button')!.onkeydown = keydown;
  const modifiers = { shift: true, alt: true, meta: true };
  expect(keyControl(find('Target'), 'a', modifiers)).toEqual({ pressed: 'a' }); expect(keydown.mock.calls[0]![0]).toMatchObject({ shiftKey: true, altKey: true, metaKey: true, ctrlKey: true });
  expect(() => keyControl(find('Confirm'), 'Enter', modifiers)).toThrow('dialog');
  expect(() => keyControl(find('Target'), 'x'.repeat(21), modifiers)).toThrow('single');
  expect(keyControl(find('Confirm'), 'Escape', { shift: false, alt: false, meta: false })).toEqual({ pressed: 'Escape' });
});
it('keeps file handles in memory and clears them on logout', async () => {
  await expect(pickBuilderFile('image/*', vi.fn().mockResolvedValue(undefined))).rejects.toThrow('No file');
  const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
  const result = await pickBuilderFile('text/*', async (_message, element) => { Object.defineProperty(element, 'files', { value: [file] }); });
  expect(result).toMatchObject({ name: 'note.txt', type: 'text/plain', size: 5 }); expect(resolveBuilderFile(result.handle)).toBe(file);
  expect(document.querySelector('input')).toBeNull();
  expect(resolveBuilderFile(1)).toBe(1); expect(resolveBuilderFile('text')).toBe('text');
  clearBuilderFiles(); expect(() => resolveBuilderFile(result.handle)).toThrow('no longer');
});
