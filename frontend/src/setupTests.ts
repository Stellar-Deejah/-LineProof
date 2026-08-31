import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom does not implement IntersectionObserver. Provide a no-op stub so
// components that use it (e.g. QueuesPage infinite scroll sentinel) don't throw.
class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe() { /* no-op */ }
  unobserve() { /* no-op */ }
  disconnect() { /* no-op */ }
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverStub,
});
