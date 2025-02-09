import { vi, describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs/promises';
import { loadConfig } from '../loader';
import { ConfigurationError } from '../types';

vi.mock('fs/promises');

describe('Configuration Loader', () => {
  const mockFs = fs as unknown as { readFile: ReturnType<typeof vi.fn> };
  const validConfig = {
    llm: {
      type: 'claude',
      api_key: 'test-key',
      system_prompt: 'You are a helpful assistant.',
      model: 'claude-3-sonnet-20240229',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load a valid minimal configuration', async () => {
    vi.mocked(mockFs.readFile).mockResolvedValue(JSON.stringify(validConfig));

    const config = await loadConfig('config.json');
    expect(config).toEqual(validConfig);
    expect(mockFs.readFile).toHaveBeenCalledWith('config.json', 'utf-8');
  });

  it('should load a configuration with optional fields', async () => {
    const configWithOptionals = {
      ...validConfig,
      max_tool_calls: 3,
      servers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: {},
        },
      },
    };

    vi.mocked(mockFs.readFile).mockResolvedValue(
      JSON.stringify(configWithOptionals)
    );

    const config = await loadConfig('config.json');
    expect(config).toEqual(configWithOptionals);
  });

  it('should throw ConfigurationError for invalid JSON', async () => {
    vi.mocked(mockFs.readFile).mockResolvedValue('invalid json');

    await expect(loadConfig('config.json')).rejects.toThrow(ConfigurationError);
  });

  it('should throw ConfigurationError for missing LLM config', async () => {
    vi.mocked(mockFs.readFile).mockResolvedValue(JSON.stringify({}));

    await expect(loadConfig('config.json')).rejects.toThrow(ConfigurationError);
  });

  it('should throw ConfigurationError for invalid LLM config', async () => {
    const invalidConfig = {
      llm: {
        type: 'claude',
        // missing required fields
      },
    };

    vi.mocked(mockFs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

    await expect(loadConfig('config.json')).rejects.toThrow(ConfigurationError);
  });

  it('should throw ConfigurationError for invalid server config', async () => {
    const invalidConfig = {
      ...validConfig,
      servers: {
        invalid: {
          // missing required fields
        },
      },
    };

    vi.mocked(mockFs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

    await expect(loadConfig('config.json')).rejects.toThrow(ConfigurationError);
  });

  it('should throw ConfigurationError for invalid max_tool_calls', async () => {
    const invalidConfig = {
      ...validConfig,
      max_tool_calls: -1,
    };

    vi.mocked(mockFs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

    await expect(loadConfig('config.json')).rejects.toThrow(ConfigurationError);
  });
});
