import { act, render, screen } from '@testing-library/react';
import BuilderPresenceCursor from './BuilderPresenceCursor';
it('shows actual world positions and expires disconnected builder cursors', () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const rendered = render(<BuilderPresenceCursor presence={{ x: 30, y: 40, label: 'Build', expiresAt: 2000 }} viewport={{ x: 10, y: 20, zoom: 2 }} />);
  expect(screen.getByText('Astra · Build').parentElement).toHaveStyle({ left: '40px', top: '40px' });
  act(() => vi.advanceTimersByTime(1000)); expect(screen.queryByText('Astra · Build')).not.toBeInTheDocument(); rendered.unmount(); vi.useRealTimers();
});
