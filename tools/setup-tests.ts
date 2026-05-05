import '@testing-library/jest-dom';

// Carbon's responsive utilities expect `window.matchMedia`. jsdom doesn't
// implement it, so provide a minimal stub.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Carbon also occasionally probes ResizeObserver.
if (
  typeof window !== 'undefined' &&
  typeof (window as unknown as { ResizeObserver?: unknown }).ResizeObserver === 'undefined'
) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
