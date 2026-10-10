import type { Server } from 'node:http';
import type { EventIndexer } from './services/eventIndexer.js';

interface ShutdownLogger {
  info(message: string): void;
  warn(message: string): void;
}

interface GracefulShutdownOptions {
  server: Server;
  eventIndexer?: Pick<EventIndexer, 'stop'> | undefined;
  timeoutMs: number;
  exit?: (code: number) => void;
  logger?: ShutdownLogger;
}

export type ShutdownSignal = 'SIGINT' | 'SIGTERM';

interface ShutdownSignalSource {
  once(signal: ShutdownSignal, listener: () => void): unknown;
}

export function registerShutdownSignals(
  shutdown: (signal: ShutdownSignal) => void,
  source: ShutdownSignalSource = process,
): void {
  source.once('SIGTERM', () => shutdown('SIGTERM'));
  source.once('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Stop accepting new connections while allowing active responses to finish.
 * A bounded timeout prevents a stale keep-alive connection from blocking a
 * rolling deployment forever.
 */
export function createGracefulShutdown({
  server,
  eventIndexer,
  timeoutMs,
  exit = (code) => process.exit(code),
  logger = console,
}: GracefulShutdownOptions): (signal: ShutdownSignal) => void {
  let shuttingDown = false;

  return (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Graceful shutdown initiated (${signal})`);
    eventIndexer?.stop();

    const forceTimer = setTimeout(() => {
      logger.warn(`Shutdown timed out after ${timeoutMs}ms; closing remaining connections`);
      server.closeAllConnections?.();
      exit(1);
    }, timeoutMs);
    forceTimer.unref();

    server.close((error) => {
      clearTimeout(forceTimer);
      if (error) {
        logger.warn(`Server close failed: ${error.message}`);
        exit(1);
        return;
      }
      logger.info('Server closed');
      exit(0);
    });
  };
}
