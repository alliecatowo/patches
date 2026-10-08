import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SafeExternalLink } from './SafeExternalLink.js';

describe('SafeExternalLink', () => {
  it('links an https URL with safe rel/target and screen reader notice', () => {
    render(<SafeExternalLink href="https://example.com/a" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/a');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveTextContent('(opens in a new tab)');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'vbscript:x',
    ' java\tscript:alert(1)',
  ])('renders %s as inert text, never an anchor', (href) => {
    render(<SafeExternalLink href={href}>click me</SafeExternalLink>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('click me')).toBeInTheDocument();
  });
});
