import { fireEvent, render, screen } from '@testing-library/react';
import BuilderLauncher from './BuilderLauncher';
import { getBuilderEnabled } from './bridge';
vi.mock('./BuilderPanel', () => ({ default: ({ visible, onClose }: { visible: boolean; onClose: () => void }) => visible ? <button onClick={onClose}>Close panel</button> : null }));
it('loads Astra only when requested and keeps its controller mounted when minimized', async () => {
  const rendered = render(<BuilderLauncher />); expect(getBuilderEnabled()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Build with Astra' })); expect(getBuilderEnabled()).toBe(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Close panel' })); expect(screen.queryByText('Close panel')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Build with Astra' })); expect(await screen.findByText('Close panel')).toBeInTheDocument();
  rendered.unmount(); expect(getBuilderEnabled()).toBe(false);
});
