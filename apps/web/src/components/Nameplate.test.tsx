import { create } from '@bufbuild/protobuf';
import { NameplateSchema } from '@patches/proto/es';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Nameplate } from './Nameplate.js';

describe('Nameplate', () => {
  it('renders a plain @handle with no nameplate', () => {
    render(<Nameplate handle="ada" />);
    expect(screen.getByText('@ada')).toBeInTheDocument();
  });

  it('applies a solid colour for a single hex stop', () => {
    render(
      <Nameplate handle="ada" nameplate={create(NameplateSchema, { nameColor: '#ff0000' })} />,
    );
    const el = screen.getByText('@ada');
    expect(el.style.color).not.toBe('');
  });

  it('renders the glyph before the handle when present', () => {
    const { container } = render(
      <Nameplate handle="ada" nameplate={create(NameplateSchema, { glyph: '★' })} />,
    );
    expect(screen.getByText('★')).toBeInTheDocument();
    expect(container).toHaveTextContent('★@ada');
  });

  it('never requires a nameplate to render — an empty one degrades to plain text', () => {
    render(<Nameplate handle="ada" nameplate={create(NameplateSchema, {})} />);
    expect(screen.getByText('@ada')).toBeInTheDocument();
  });
});
