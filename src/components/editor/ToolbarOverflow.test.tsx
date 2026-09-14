import { fireEvent, render, screen, within } from '@testing-library/react';
import ToolbarOverflow from './ToolbarOverflow';

it('keeps workspace actions accessible in the compact dropdown and closes on action, Escape and outside input', () => {
  const action = vi.fn();
  const rendered = render(<ToolbarOverflow><button onClick={action}>Comments</button><span>Tools</span></ToolbarOverflow>);
  const trigger = screen.getByRole('button', { name: 'Workspace tools' });
  fireEvent.click(trigger);
  fireEvent.pointerDown(trigger); expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const group = screen.getByRole('group', { name: 'Workspace tools' });
  fireEvent.click(within(group).getByText('Tools')); expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(within(group).getByRole('button', { name: 'Comments' }));
  expect(action).toHaveBeenCalledOnce(); expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger); fireEvent.keyDown(trigger, { key: 'ArrowDown' }); expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(trigger, { key: 'Escape' }); expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger); fireEvent.keyDown(document.body, { key: 'Escape' }); fireEvent.click(document.body); expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.pointerDown(document.body); expect(trigger).toHaveAttribute('aria-expanded', 'false');
  rendered.unmount(); fireEvent.pointerDown(document.body);
});
