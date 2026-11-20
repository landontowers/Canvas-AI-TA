import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import App from './App.js';

describe('App Component Root', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the DemoShell within the application container', () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'ok',
              college: 'sdi',
              env: 'development',
              modelProvider: 'fake',
              canvasConnected: true,
              fakeCourseData: true,
              timestamp: new Date().toISOString(),
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const { container } = render(<App />);
    expect(container.querySelector('.demo-container')).not.toBeNull();
  });
});
