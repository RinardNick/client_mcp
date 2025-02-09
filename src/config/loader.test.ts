import { loadConfig } from './loader';
import { ConfigurationError } from './types';
import fs from 'fs/promises';
import path from 'path';

jest.mock('fs/promises');

describe('Configuration Loader', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const validConfig = {
    llm: {
      type: 'claude',
      api_key: 'test-key',
      system_prompt: 'You are a helpful assistant.',
      model: 'claude-3-sonnet-20240229',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load a valid minimal configuration', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify(validConfig));

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

    mockFs.readFile.mockResolvedValue(JSON.stringify(configWithOptionals));

    const config = await loadConfig('config.json');
    expect(config).toEqual(configWithOptionals);
  });

  it('should throw ConfigurationError for invalid JSON', async () => {
    mockFs.readFile.mockResolvedValue('invalid json');

    await expect(loadConfig('config.json')).rejects.toThrow(ConfigurationError);
  });

  it('should throw ConfigurationError for missing LLM config', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify({}));

    await expect(loadConfig('config.json')).rejects.toThrow(ConfigurationError);
  });

  it('should throw ConfigurationError for invalid LLM config', async () => {
    const invalidConfig = {
      llm: {
        type: 'claude',
        // missing required fields
      },
    };

    mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

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

    mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

    await expect(loadConfig('config.json')).rejects.toThrow(ConfigurationError);
  });

  it('should throw ConfigurationError for invalid max_tool_calls', async () => {
    const invalidConfig = {
      ...validConfig,
      max_tool_calls: -1,
    };

    mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

    await expect(loadConfig('config.json')).rejects.toThrow(ConfigurationError);
  });
});
