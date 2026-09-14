import { render, screen } from '@testing-library/react';
import ChatText from './ChatText';

it('formats streamed replies as paragraphs, headings, emphasis, lists and code without HTML execution', () => {
  const { container, rerender } = render(<ChatText text={'## Dashboard ready\n\nCreated **three cards** with `revenue` data.\nAll saved.\n- Navigation\n- Chart\n\n1. Review\n2. Refine\n```js\n<script>alert(1)</script>\n```\n\n**unfinished'} />);
  expect(screen.getByRole('heading')).toHaveTextContent('Dashboard ready');
  expect(container.querySelector('strong')).toHaveTextContent('three cards');
  expect(container.querySelectorAll('li')).toHaveLength(4);
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('pre')).toHaveTextContent('<script>alert(1)</script>');
  expect(screen.getByText('**unfinished')).toBeInTheDocument();
  rerender(<ChatText text={'```\npartial code'} />);
  expect(container.querySelector('pre')).toHaveTextContent('partial code');
  rerender(<ChatText text={'- First\n1. Second\n### Next\nParagraph\n\n'} />);
  expect(screen.getByRole('heading')).toHaveTextContent('Next');
  expect(screen.getAllByRole('list')).toHaveLength(2);
});
