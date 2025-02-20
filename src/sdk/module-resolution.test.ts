import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';

describe('SDK Module Resolution', () => {
  it('should import Client from SDK client module', () => {
    expect(Client).toBeDefined();
    expect(typeof Client).toBe('function');
  });

  it('should import StdioClientTransport from SDK stdio module', () => {
    expect(StdioClientTransport).toBeDefined();
    expect(typeof StdioClientTransport).toBe('function');
  });
});
