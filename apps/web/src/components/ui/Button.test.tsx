import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button.js';

describe('Button component', () => {
  it('renders button with label', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('sets aria-busy and disabled when loading is true', () => {
    render(<Button loading>Saving</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('renders iconOnly button with accessible name', () => {
    render(
      <Button iconOnly aria-label="Close window">
        X
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Close window' });
    expect(button).toBeInTheDocument();
  });
});
