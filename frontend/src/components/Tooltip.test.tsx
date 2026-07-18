import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import Tooltip from './Tooltip';

describe('Tooltip component', () => {
  it('does not show tooltip initially', () => {
    render(
      <Tooltip content="Helper text">
        <button>Hover me</button>
      </Tooltip>
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows tooltip on mouse enter and hides on mouse leave', async () => {
    render(
      <Tooltip content="Helper text">
        <button>Hover me</button>
      </Tooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    
    await userEvent.hover(trigger);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent('Helper text');

    await userEvent.unhover(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows tooltip on focus and hides on blur', () => {
    render(
      <Tooltip content="Helper text">
        <button>Focus me</button>
      </Tooltip>
    );

    const trigger = screen.getByText('Focus me').parentElement!;
    
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
