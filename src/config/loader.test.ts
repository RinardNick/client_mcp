import { vi, describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs/promises';
import { loadConfig } from './loader';
import { ConfigurationError } from './types';

vi.mock('fs/promises');

describe('Configuration Loader', () => {
  const mockFs = fs as unknown as { readFile: ReturnType<typeof vi.fn> };
  const validConfig = {
    llm: {
      type: 'claude',
      api_key: 'test-key',
      system_prompt: 'You are a helpful assistant.',
      model: 'claude-3-5-test-sonnet-20241022',
    },
    max_tool_calls: 3,
    servers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        env: {},
      },
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

  it('should require max_tool_calls field', async () => {
    const configWithoutToolCalls = {
      llm: validConfig.llm,
      servers: validConfig.servers,
    };

    vi.mocked(mockFs.readFile).mockResolvedValue(
      JSON.stringify(configWithoutToolCalls)
    );

    await expect(loadConfig('config.json')).rejects.toThrow(
      'max_tool_calls is required'
    );
  });

  it('should require servers field', async () => {
    const configWithoutServers = {
      llm: validConfig.llm,
      max_tool_calls: validConfig.max_tool_calls,
    };

    vi.mocked(mockFs.readFile).mockResolvedValue(
      JSON.stringify(configWithoutServers)
    );

    await expect(loadConfig('config.json')).rejects.toThrow(
      'servers section is required'
    );
  });

  describe('Server Configuration', () => {
    it('should validate server command is present', async () => {
      const invalidConfig = {
        ...validConfig,
        servers: {
          filesystem: {
            args: [],
            env: {},
          },
        },
      };

      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify(invalidConfig)
      );
      await expect(loadConfig('config.json')).rejects.toThrow(
        ConfigurationError
      );
    });

    it('should validate server args is an array', async () => {
      const invalidConfig = {
        ...validConfig,
        servers: {
          filesystem: {
            command: 'npx',
            args: 'not-an-array',
            env: {},
          },
        },
      };

      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify(invalidConfig)
      );
      await expect(loadConfig('config.json')).rejects.toThrow(
        ConfigurationError
      );
    });

    it('should validate server env is an object', async () => {
      const invalidConfig = {
        ...validConfig,
        servers: {
          filesystem: {
            command: 'npx',
            args: [],
            env: 'not-an-object',
          },
        },
      };

      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify(invalidConfig)
      );
      await expect(loadConfig('config.json')).rejects.toThrow(
        ConfigurationError
      );
    });

    it('should accept valid server configuration', async () => {
      vi.mocked(mockFs.readFile).mockResolvedValue(JSON.stringify(validConfig));
      const config = await loadConfig('config.json');
      expect(config).toEqual(validConfig);
    });
  });
});
