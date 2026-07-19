import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LiveRegion from './LiveRegion';

describe('LiveRegion component', () => {
  it('announces errors assertively', () => {
    render(<LiveRegion>Enrollment failed</LiveRegion>);

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('announces status updates politely', () => {
    render(<LiveRegion type="status">Enrolled successfully</LiveRegion>);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
