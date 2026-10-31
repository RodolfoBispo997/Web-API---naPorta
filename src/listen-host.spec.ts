import { describe, expect, it } from 'vitest';
import { resolveListenHost } from './listen-host.js';

describe('application listen host', () => {
  it.each([undefined, '', '   '])('defaults to loopback for %s', (host) => {
    expect(resolveListenHost(host)).toBe('127.0.0.1');
  });

  it('uses the configured host after trimming surrounding spaces', () => {
    expect(resolveListenHost(' 0.0.0.0 ')).toBe('0.0.0.0');
  });
});
