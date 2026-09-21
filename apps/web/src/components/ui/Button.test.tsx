import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button.js';

describe('Button', () => {
  it('renders children and defaults to type button', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('sets aria-busy and disabled when loading', () => {
    render(<Button loading>Submit</Button>);
    const button = screen.getByRole('button', { name: 'Submit' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('hides children when iconOnly is true', () => {
    render(
      <Button iconOnly aria-label="Settings">
        Settings Text
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Settings' });
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveTextContent('Settings Text');
  });
});
