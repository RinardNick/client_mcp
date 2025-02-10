import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ServerDiscovery } from './discovery';
import { ServerConfig } from '../config/types';

// Mock fetch globally
global.fetch = vi.fn();

describe('ServerDiscovery', () => {
  let discovery: ServerDiscovery;

  beforeEach(() => {
    vi.clearAllMocks();
    discovery = new ServerDiscovery();
  });

  it('should discover tools and resources from a server', async () => {
    const mockTools = {
      tools: [
        {
          name: 'list-files',
          description: 'List files in a directory',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
          },
        },
      ],
    };

    const mockResources = {
      resources: [
        {
          name: 'workspace',
          type: 'directory',
          description: 'Workspace root directory',
        },
      ],
    };

    // Mock successful responses for both endpoints
    vi.mocked(fetch)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTools),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResources),
        })
      );

    const capabilities = await discovery.discoverCapabilities(
      'filesystem',
      'http://localhost:3000'
    );

    expect(capabilities).toEqual({
      tools: mockTools.tools,
      resources: mockResources.resources,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/tools/list');
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/resources/list');
  });

  it('should handle server errors gracefully', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Connection failed'));

    await expect(
      discovery.discoverCapabilities('test', 'http://localhost:3000')
    ).rejects.toThrow(
      'Failed to discover capabilities for server test: Connection failed'
    );
  });

  it('should handle invalid response data', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}), // Empty response
    });

    await expect(
      discovery.discoverCapabilities('test', 'http://localhost:3000')
    ).rejects.toThrow('Invalid response from server test');
  });
});
