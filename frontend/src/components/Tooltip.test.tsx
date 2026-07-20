import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import Tooltip from './Tooltip';

expect.extend(toHaveNoViolations);

describe('Tooltip component', () => {
  it('keeps the associated tooltip hidden in the DOM initially', () => {
    const { container } = render(
      <Tooltip content="Helper text">
        <button>Hover me</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button').parentElement!;
    const tooltip = screen.getByRole('tooltip', { hidden: true });

    expect(tooltip).not.toBeVisible();
    expect(tooltip).toHaveAttribute('id');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
    return expect(axe(container)).resolves.toHaveNoViolations();
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
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
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
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
  });
});
