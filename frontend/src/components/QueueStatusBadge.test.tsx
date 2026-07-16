import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import QueueStatusBadge from './QueueStatusBadge';

describe('QueueStatusBadge component', () => {
  it('renders Draft status', () => {
    render(<QueueStatusBadge status="Draft" />);
    const badge = screen.getByText('Draft');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-slate-100');
  });

  it('renders Open status', () => {
    render(<QueueStatusBadge status="Open" />);
    const badge = screen.getByText('Open');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-emerald-50');
  });

  it('renders EnrollmentOpen status', () => {
    render(<QueueStatusBadge status="EnrollmentOpen" />);
    const badge = screen.getByText('Enrollment Open');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-emerald-50');
  });

  it('renders EnrollmentClosed status', () => {
    render(<QueueStatusBadge status="EnrollmentClosed" />);
    const badge = screen.getByText('Enrollment Closed');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-amber-50');
  });

  it('renders AdvancementActive status', () => {
    render(<QueueStatusBadge status="AdvancementActive" />);
    const badge = screen.getByText('Advancing');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-blue-50');
  });

  it('renders Closed status', () => {
    render(<QueueStatusBadge status="Closed" />);
    const badge = screen.getByText('Closed');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-slate-100', 'text-slate-500');
  });

  it('renders unknown status with default Closed style', () => {
    // @ts-expect-error testing invalid status
    render(<QueueStatusBadge status="UnknownStatus" />);
    const badge = screen.getByText('UnknownStatus');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-slate-100', 'text-slate-500');
  });
});
