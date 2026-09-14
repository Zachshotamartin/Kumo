import { fireEvent, render, screen } from '@testing-library/react';
import BuilderLauncher from './BuilderLauncher';
import { BuilderButton, BuilderDock } from './BuilderControls';
import { getBuilderEnabled } from './bridge';
vi.mock('./BuilderPanel', () => ({ default: ({ visible, onClose }: { visible: boolean; onClose: () => void }) => visible ? <button onClick={onClose}>Close panel</button> : null }));
it('loads Astra only when requested and keeps its controller mounted when minimized', async () => {
  const rendered = render(<><BuilderButton /><BuilderDock /><BuilderLauncher /></>); expect(getBuilderEnabled()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Kumo AI' })); expect(getBuilderEnabled()).toBe(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Close panel' })); expect(screen.queryByText('Close panel')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Kumo AI' })); expect(await screen.findByText('Close panel')).toBeInTheDocument();
  rendered.unmount(); expect(getBuilderEnabled()).toBe(false);
});

it('keeps a visible stop control in the header while AI is working', async () => {
  const { act } = await import('@testing-library/react');
  const { setBuilderBusy } = await import('./uiState');
  const stop = vi.fn(); window.addEventListener('kumo:builder-stop', stop);
  const rendered = render(<><BuilderButton className="native-control" /><BuilderDock /><BuilderLauncher /></>);
  act(() => setBuilderBusy(true));
  fireEvent.click(screen.getByRole('button', { name: 'Stop AI' })); expect(stop).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Kumo AI' })).toHaveTextContent('Kumo AI');
  window.removeEventListener('kumo:builder-stop', stop); rendered.unmount();
});

it('waits for a board dock before showing a requested panel', async () => {
  const rendered = render(<><BuilderButton /><BuilderLauncher key="controller" /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Kumo AI' }));
  expect(screen.queryByText('Close panel')).not.toBeInTheDocument();
  rendered.rerender(<><BuilderButton /><BuilderDock /><BuilderLauncher key="controller" /></>);
  expect(await screen.findByText('Close panel')).toBeInTheDocument();
});
