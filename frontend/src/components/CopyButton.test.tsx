import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach, vi } from 'vitest';
import CopyButton from './CopyButton';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mockClipboard(writeText: () => Promise<void>) {
  Object.assign(navigator, { clipboard: { writeText } });
}

describe('CopyButton component', () => {
  it('shows "Copied" after a successful clipboard write', async () => {
    mockClipboard(vi.fn(async () => undefined));
    render(<CopyButton text="hello" />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('shows "Copy failed" when the clipboard API throws and no fallback succeeds', async () => {
    mockClipboard(vi.fn(async () => {
      throw new Error('clipboard unavailable');
    }));
    document.execCommand = vi.fn(() => false);
    render(<CopyButton text="hello" />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText('Copy failed')).toBeInTheDocument();
  });

  it('falls back to document.execCommand when the clipboard API throws', async () => {
    mockClipboard(vi.fn(async () => {
      throw new Error('clipboard unavailable');
    }));
    document.execCommand = vi.fn(() => true);
    render(<CopyButton text="hello" />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('returns to the idle label after the feedback timeout', async () => {
    mockClipboard(vi.fn(async () => {
      throw new Error('clipboard unavailable');
    }));
    document.execCommand = vi.fn(() => false);
    render(<CopyButton text="hello" />);

    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Copy failed')).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('is operable with the keyboard (Tab + Enter)', async () => {
    mockClipboard(vi.fn(async () => undefined));
    render(<CopyButton text="hello" />);

    await userEvent.tab();
    expect(screen.getByRole('button')).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
});
