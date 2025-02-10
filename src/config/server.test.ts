import { describe, it, expect } from 'vitest';
import { loadConfig } from './loader';
import { ConfigurationError } from './types';
import fs from 'fs/promises';
import { vi } from 'vitest';

vi.mock('fs/promises');

describe('Server Configuration Validation', () => {
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should accept valid server configuration', async () => {
    const validConfig = {
      llm: {
        type: 'openai',
        api_key: 'test-key',
        system_prompt: 'test prompt',
        model: 'gpt-4',
      },
      servers: {
        test_server: {
          command: 'node',
          args: ['server.js'],
          env: {
            PORT: '3000',
            NODE_ENV: 'test',
          },
        },
      },
    };

    mockFs.readFile.mockResolvedValue(JSON.stringify(validConfig));
    const config = await loadConfig('test.json');
    expect(config.servers?.test_server).toBeDefined();
    expect(config.servers?.test_server.command).toBe('node');
  });

  it('should reject server without command', async () => {
    const invalidConfig = {
      llm: {
        type: 'openai',
        api_key: 'test-key',
        system_prompt: 'test prompt',
        model: 'gpt-4',
      },
      servers: {
        test_server: {
          args: ['server.js'],
          env: {},
        },
      },
    };

    mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));
    await expect(loadConfig('test.json')).rejects.toThrow(ConfigurationError);
  });

  it('should reject server with non-string command', async () => {
    const invalidConfig = {
      llm: {
        type: 'openai',
        api_key: 'test-key',
        system_prompt: 'test prompt',
        model: 'gpt-4',
      },
      servers: {
        test_server: {
          command: 123,
          args: [],
          env: {},
        },
      },
    };

    mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));
    await expect(loadConfig('test.json')).rejects.toThrow(ConfigurationError);
  });

  it('should reject server with non-array args', async () => {
    const invalidConfig = {
      llm: {
        type: 'openai',
        api_key: 'test-key',
        system_prompt: 'test prompt',
        model: 'gpt-4',
      },
      servers: {
        test_server: {
          command: 'node',
          args: 'server.js',
          env: {},
        },
      },
    };

    mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));
    await expect(loadConfig('test.json')).rejects.toThrow(ConfigurationError);
  });

  it('should reject server with non-string args', async () => {
    const invalidConfig = {
      llm: {
        type: 'openai',
        api_key: 'test-key',
        system_prompt: 'test prompt',
        model: 'gpt-4',
      },
      servers: {
        test_server: {
          command: 'node',
          args: ['server.js', 123],
          env: {},
        },
      },
    };

    mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));
    await expect(loadConfig('test.json')).rejects.toThrow(ConfigurationError);
  });

  it('should reject server with non-object env', async () => {
    const invalidConfig = {
      llm: {
        type: 'openai',
        api_key: 'test-key',
        system_prompt: 'test prompt',
        model: 'gpt-4',
      },
      servers: {
        test_server: {
          command: 'node',
          args: ['server.js'],
          env: 'invalid',
        },
      },
    };

    mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));
    await expect(loadConfig('test.json')).rejects.toThrow(ConfigurationError);
  });

  it('should reject server with non-string env values', async () => {
    const invalidConfig = {
      llm: {
        type: 'openai',
        api_key: 'test-key',
        system_prompt: 'test prompt',
        model: 'gpt-4',
      },
      servers: {
        test_server: {
          command: 'node',
          args: ['server.js'],
          env: {
            PORT: 3000,
          },
        },
      },
    };

    mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));
    await expect(loadConfig('test.json')).rejects.toThrow(ConfigurationError);
  });
});
