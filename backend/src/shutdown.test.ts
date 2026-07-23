import { createServer } from 'node:http';
import { EventEmitter, once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createGracefulShutdown, registerShutdownSignals } from './shutdown.js';

describe('graceful shutdown', () => {
  it('registers SIGTERM and SIGINT with the process signal source', () => {
    const source = new EventEmitter();
    const shutdown = vi.fn();
    registerShutdownSignals(shutdown, source);

    source.emit('SIGTERM');
    source.emit('SIGINT');

    expect(shutdown).toHaveBeenNthCalledWith(1, 'SIGTERM');
    expect(shutdown).toHaveBeenNthCalledWith(2, 'SIGINT');
  });

  it('lets an in-flight response complete after SIGTERM before exiting', async () => {
    let releaseResponse: (() => void) | undefined;
    let requestStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });

    const server = createServer((_request, response) => {
      requestStarted?.();
      void new Promise<void>((resolve) => {
        releaseResponse = resolve;
      }).then(() => {
        response.end('completed');
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server address');

    const responseBody = new Promise<string>((resolve, reject) => {
      fetch(`http://127.0.0.1:${address.port}/slow`, {
        headers: { connection: 'close' },
      })
        .then((response) => response.text())
        .then(resolve, reject);
    });
    await started;

    const exit = vi.fn();
    const logger = { info: vi.fn(), warn: vi.fn() };
    const stop = vi.fn();
    const shutdown = createGracefulShutdown({
      server,
      eventIndexer: { stop },
      timeoutMs: 1_000,
      exit,
      logger,
    });

    shutdown('SIGTERM');
    expect(stop).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith('Graceful shutdown initiated (SIGTERM)');

    releaseResponse?.();
    expect(await responseBody).toBe('completed');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(logger.info).toHaveBeenCalledWith('Server closed');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('force closes connections after the configured timeout', async () => {
    vi.useFakeTimers();
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const exit = vi.fn();
    const logger = { info: vi.fn(), warn: vi.fn() };
    const closeAllConnections = vi.spyOn(server, 'closeAllConnections');
    const close = vi.spyOn(server, 'close').mockImplementation(() => server);

    createGracefulShutdown({ server, timeoutMs: 25, exit, logger })('SIGINT');
    await vi.advanceTimersByTimeAsync(25);

    expect(closeAllConnections).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
    vi.useRealTimers();
    close.mockRestore();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
