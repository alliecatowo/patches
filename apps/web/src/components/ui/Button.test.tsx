import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button.js';

describe('Button', () => {
  it('renders children and default attributes', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('sets aria-busy when loading is true', () => {
    render(<Button loading>Submit</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  it('supports custom type and disabled state', () => {
    render(
      <Button type="submit" disabled>
        Submit Form
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Submit Form' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toBeDisabled();
  });
});
