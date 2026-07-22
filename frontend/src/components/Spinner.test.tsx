import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import Spinner from './Spinner';

afterEach(cleanup);

describe('Spinner component', () => {
  it('exposes a status live region that is not aria-hidden', () => {
    render(<Spinner />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).not.toHaveAttribute('aria-hidden');
  });

  it('announces "Loading" via visually hidden text', () => {
    render(<Spinner />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading');
    expect(screen.getByText('Loading')).toHaveClass('sr-only');
  });

  it('hides the decorative svg from assistive technology', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
  });

  it('applies size and custom className', () => {
    const { container } = render(<Spinner size="lg" className="mx-2" />);
    expect(container.querySelector('svg')).toHaveClass('h-8', 'w-8');
    expect(screen.getByRole('status')).toHaveClass('mx-2');
  });
});
