import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import QueuePage from './QueuePage';
import QueuesPage from './QueuesPage';

expect.extend(toHaveNoViolations);

const queue = {
  id: 'queue-1',
  name: 'Passport appointments',
  slug: 'passport',
  description: 'A public appointment queue.',
  maxPositions: 20,
  enrolled: 5,
  advanced: 0,
  status: 'EnrollmentOpen',
  advancementRule: 'FIFO',
  escrowAsset: '',
  escrowAmount: 0,
  createdAt: '2026-01-01T00:00:00Z',
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('page accessibility', () => {
  it('reports no axe violations on QueuesPage and uses concise card semantics', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse([queue]));
    const { container } = render(
      <MemoryRouter>
        <QueuesPage />
      </MemoryRouter>,
    );

    const link = await screen.findByRole('link', { name: queue.name });
    expect(link).toHaveAccessibleName(queue.name);
    expect(link.querySelector('[role="progressbar"]')?.closest('[aria-hidden="true"]')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('reports no axe violations on QueuePage and announces enrollment errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse(queue));
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={['/queues/queue-1']}>
        <Routes>
          <Route path="/queues/:id" element={<QueuePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: queue.name });
    await user.click(screen.getByRole('button', { name: 'Enroll now' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid Stellar public key');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('announces successful enrollment as a polite status', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_, init) => {
      if (init?.method === 'POST') {
        return jsonResponse({
          queueId: queue.id,
          identity: `G${'A'.repeat(55)}`,
          enrolledAt: '2026-01-01T00:00:00Z',
          conflict: false,
          cancelled: false,
        });
      }
      return jsonResponse(queue);
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/queues/queue-1']}>
        <Routes>
          <Route path="/queues/:id" element={<QueuePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(await screen.findByRole('textbox', { name: 'Stellar public key' }), `G${'A'.repeat(55)}`);
    await user.click(screen.getByRole('button', { name: 'Enroll now' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Enrolled successfully');
  });

  it('reports no axe violations on DashboardPage and announces lookup errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Stellar public key' }), 'GINVALID');
    await user.click(screen.getByRole('button', { name: 'Lookup' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network error'));
    expect(await axe(container)).toHaveNoViolations();
  });
});
