import { showBuilderFocus } from './bridge';

interface ObservedControl { element: HTMLElement; label: string; value: string; dialog: Element | null }
const controls = new Map<string, ObservedControl>();
const identities = new WeakMap<HTMLElement, { fingerprint: string; handle: string }>();
const files = new Map<string, File>();
let generation = 0;
const excluded = (element: HTMLElement) => Boolean(element.closest('[data-builder], #liveblocks-badge, [aria-hidden="true"], [hidden], [inert]')) || element.matches(':disabled, input[type="password"], input[type="hidden"]');
const labelFor = (element: HTMLElement) => element.getAttribute('aria-label') || (element.getAttribute('aria-labelledby') ?? '').split(' ').map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim() || (element as HTMLInputElement).labels?.[0]?.textContent?.trim() || element.getAttribute('title') || element.textContent?.trim().slice(0, 160) || element.getAttribute('placeholder') || element.tagName.toLowerCase();
const valueFor = (element: HTMLElement) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ? element.value : '';

export function inspectControls() {
  controls.clear(); generation += 1;
  const nodes = [...document.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [role="button"], [role="menuitem"], [role="tab"], [contenteditable="true"], [tabindex="0"]')];
  return nodes.filter(element => !excluded(element) && element.getClientRects().length > 0).slice(0, 200).map((element, index) => {
    const label = labelFor(element);
    const value = valueFor(element);
    const dialog = element.closest('[role="dialog"], [role="alertdialog"]');
    const fingerprint = JSON.stringify([label, value, element.getAttribute('type'), Boolean(dialog)]);
    const previous = identities.get(element);
    const handle = previous?.fingerprint === fingerprint ? previous.handle : `${generation}:${index}`;
    identities.set(element, { fingerprint, handle });
    controls.set(handle, { element, label, value, dialog });
    return { handle, label, tag: element.tagName.toLowerCase(), type: element.getAttribute('type'), value,
      options: element instanceof HTMLSelectElement ? [...element.options].map(option => ({ value: option.value, label: option.label })) : undefined,
      requiresUser: Boolean(dialog) || element.matches('input[type="file"]') };
  });
}

function observed(handle: string) {
  const control = controls.get(handle);
  if (!control || !control.element.isConnected || excluded(control.element) || labelFor(control.element) !== control.label || valueFor(control.element) !== control.value) throw new Error('This control changed. Inspect the interface again.');
  return control;
}
export type Handoff = (message: string, element?: HTMLElement) => Promise<void>;
export async function activateControl(handle: string, handoff: Handoff) {
  const { element, dialog } = observed(handle);
  element.scrollIntoView({ block: 'nearest' });
  const bounds = element.getBoundingClientRect();
  showBuilderFocus({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, world: false, shapeIds: [], label: labelFor(element) });
  if (dialog || element.matches('input[type="file"]')) {
    await handoff(`Complete “${labelFor(element)}” in Kumo, then continue.`, element);
    return { userHandoff: true };
  }
  if (element instanceof HTMLAnchorElement && new URL(element.href, location.href).origin !== location.origin) {
    await handoff(`Open “${labelFor(element)}” yourself, then continue.`, element);
    return { userHandoff: true };
  }
  element.click();
  return { activated: true };
}
export function fillControl(handle: string, value: string) {
  const { element } = observed(handle);
  if (element instanceof HTMLSelectElement) {
    if (![...element.options].some(option => option.value === value && !option.disabled)) throw new Error('Choose an available option.');
    element.value = value;
  } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.readOnly || element instanceof HTMLInputElement && ['file', 'checkbox', 'radio', 'submit', 'button'].includes(element.type)) throw new Error('This control does not accept text.');
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  } else if (element.isContentEditable) element.textContent = value;
  else throw new Error('This control does not accept text.');
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  return { filled: true };
}
export function keyControl(handle: string, key: string, modifiers: { shift: boolean; alt: boolean; meta: boolean }) {
  const { element, dialog } = observed(handle);
  if (dialog && key !== 'Escape') throw new Error('Complete this dialog yourself before continuing.');
  if (key.length > 20) throw new Error('Use a single keyboard key.');
  element.focus();
  for (const type of ['keydown', 'keyup']) element.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, shiftKey: modifiers.shift, altKey: modifiers.alt, metaKey: modifiers.meta, ctrlKey: modifiers.meta }));
  return { pressed: key };
}
export async function pickBuilderFile(accept: string, handoff: Handoff) {
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = accept;
  picker.setAttribute('aria-label', 'Choose file for Astra');
  picker.dataset.builder = '';
  document.body.append(picker);
  try {
    await handoff('Choose a file for Astra, then continue.', picker);
    const file = picker.files?.[0];
    if (!file) throw new Error('No file was selected.');
    const handle = `file:${crypto.randomUUID()}`;
    files.set(handle, file);
    return { handle, name: file.name, type: file.type, size: file.size };
  } finally { picker.remove(); }
}
export function resolveBuilderFile(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('file:')) return value;
  const file = files.get(value);
  if (!file) throw new Error('This file is no longer available. Choose it again.');
  return file;
}
export const clearBuilderFiles = () => files.clear();
