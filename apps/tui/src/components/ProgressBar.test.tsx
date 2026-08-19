import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { PlainModeProvider } from '../theme/plain-mode.js';
import { ProgressBar } from './ProgressBar.js';

describe('ProgressBar', () => {
  it('shows the label and percentage', () => {
    const { lastFrame } = render(<ProgressBar label="Uploading photo.png" value={42} />);
    expect(lastFrame()).toContain('Uploading photo.png… 42%');
  });

  it('clamps out-of-range values', () => {
    expect(render(<ProgressBar label="x" value={150} />).lastFrame()).toContain('100%');
    expect(render(<ProgressBar label="x" value={-10} />).lastFrame()).toContain('0%');
  });

  it('measures to the same height in rich and plain mode (two rows: label, bar)', () => {
    const rich = render(<ProgressBar label="x" value={50} />).lastFrame() ?? '';
    const plainFrame =
      render(
        <PlainModeProvider plain>
          <ProgressBar label="x" value={50} />
        </PlainModeProvider>,
      ).lastFrame() ?? '';
    expect(rich.split('\n')).toHaveLength(2);
    expect(plainFrame.split('\n')).toHaveLength(2);
  });

  it('renders a fixed-width ASCII bar in plain mode instead of dropping the row', () => {
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <ProgressBar label="x" value={50} />
      </PlainModeProvider>,
    );
    const lines = (lastFrame() ?? '').split('\n');
    expect(lines[1]).toBe('[##########----------]');
  });
});
