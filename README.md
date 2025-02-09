# TypeScript MCP Client

A TypeScript implementation of a Model Context Protocol (MCP) client that enables LLM chat interactions and tool invocations through MCP servers.

## Features

- Load and validate configuration from JSON files
- Initialize LLM chat sessions using the MCP TypeScript SDK
- Launch and manage MCP servers for tool invocation
- Stream conversation responses back to the host
- Handle errors and provide detailed logging

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)

### Installation

1. Clone the repository:

```bash
git clone [repository-url]
cd ts-mcp-client
```

2. Install dependencies:

```bash
npm install
```

3. Create a configuration file (`config.json`):

```json
{
  "llm": {
    "type": "claude",
    "api_key": "YOUR_API_KEY_HERE",
    "system_prompt": "You are a helpful assistant.",
    "model": "claude-3-sonnet-20240229"
  }
}
```

### Development

- Build the project:

```bash
npm run build
```

- Run tests:

```bash
npm test
```

- Start the development server:

```bash
npm run dev
```

## Configuration

The client is configured using a JSON file with the following structure:

```typescript
interface Config {
  llm: {
    type: string;
    api_key: string;
    system_prompt: string;
    model: string;
  };
  max_tool_calls?: number;
  servers?: {
    [name: string]: {
      command: string;
      args: string[];
      env: Record<string, string>;
    };
  };
}
```

## Testing

The project uses Jest for testing. Run the test suite with:

```bash
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the ISC License.
