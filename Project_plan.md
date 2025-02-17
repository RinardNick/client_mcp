# MCP Client Implementation Plan

## Overview

The goal of this project is to build a minimal MCP client using TypeScript and the MCP TypeScript SDK. The client will be invoked by a host via an API, read a JSON configuration file listing accessible servers, and engage in an LLM chat conversation. During the conversation, if the LLM decides to invoke a tool, the client will forward that call to the appropriate MCP server (launched per the config) using the MCP protocol. Conversation responses—along with minimal tool call metadata and error logs—will be streamed back to the host. This initial prototype will focus on core functionality with a simple, clear architecture that can be improved in later iterations.

For background on the MCP SDK and protocol, please refer to:

- MCP TypeScript SDK on GitHub: citeturn0search0
- MCP Specification: citeturn0search1
- MCP Architecture: citeturn0search2

## Project Goals

- **Launch Client**: Start the MCP client as a standalone process.
- **Read Config**: Load a JSON configuration file that specifies LLM settings and available MCP servers.
- **Install/Launch Servers**: For each server listed in the config, execute the provided command (using Node's child process APIs) to launch the MCP server.
- **Server Discovery**: Call each server’s `/tools/list` and `/resources/list` endpoints to retrieve their capabilities. These details will be used to initialize the LLM's system prompt.
- **LLM Chat Initialization**: Start a chat session by constructing a system prompt that includes:
  - The provided `system_prompt` from the config.
  - Details (tools and resources) retrieved from the servers.
- **User Interaction**: Expose an API endpoint so that a host can send chat messages to the LLM. The conversation continues as:
  - The user sends a message.
  - The LLM responds and may decide to use a tool.
  - If a tool is used, the client will route the tool call (using the MCP protocol) to the appropriate server.
- **Tool Call Handling**:
  - Use the MCP protocol (as defined in the MCP architecture) to send tool usage requests from the LLM to the MCP server.
  - Receive responses from the MCP server and forward them to the LLM.
  - Automatically continue the conversation until either no tool is requested or the maximum number of tool calls (`max_tool_calls` from the config) is reached.
- **Streaming Responses**: Return the conversation responses (and any associated error or logging information) back to the host in a streaming format.
- **Basic Logging & Error Reporting**: Log errors and debugging information locally and include these details in the response stream for troubleshooting.

## Sample JSON Configuration

Below is an example of the JSON configuration file you provided:

```json
{
  "llm": {
    "type": "claude",
    "api_key": "YOUR_API_KEY_HERE",
    "system_prompt": "You are a helpful assistant.",
    "model": "claude-3-5-sonnet-20241022"
  },
  "max_tool_calls": 3,
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "YOUR_FILESYSTEM_WORK_DIR_HERE"
      ],
      "env": {}
    },
    "terminal": {
      "command": "npx",
      "args": [
        "@rinardnick/mcp-terminal",
        "--allowed-commands",
        "[go,python3,uv,npm,npx,git,ls,cd,touch,mv,pwd,mkdir]"
      ],
      "env": {}
    }
  }
}
```

## Architecture & Component Breakdown

1. **API Gateway**

   - **Technology**: Express.js (or a similar lightweight framework)
   - **Responsibilities**:
     - Expose endpoints for starting a chat session and for sending messages.
     - Provide streaming responses (using Server-Sent Events or a basic HTTP chunked response) to the host.

2. **Configuration Manager**

   - **Responsibilities**:
     - Read and validate the JSON configuration at startup.
     - Provide configuration data to other modules.

3. **Server Launcher & Discovery Module**

   - **Responsibilities**:
     - For each server in the configuration, launch the server using Node's `child_process` (e.g., using `spawn`).
     - Once running, call endpoints such as `/tools/list` and `/resources/list` to gather capabilities.
     - Pass the retrieved details to the LLM initialization module.

4. **LLM Chat Manager**

   - **Responsibilities**:
     - Integrate with the MCP TypeScript SDK for managing chat sessions.
     - Construct the initial system prompt using the provided prompt from the config and incorporating the tools/resources from the servers.
     - Process incoming user messages and manage conversation state.
     - Detect and parse tool call instructions in the LLM responses.
     - Limit tool usage to the `max_tool_calls` defined in the config.

5. **Tool Invocation Handler**

   - **Responsibilities**:
     - When the LLM requests a tool, format the request according to MCP protocol specifications.
     - Forward the tool usage request to the corresponding server using the MCP SDK.
     - Relay the server’s response back into the ongoing conversation.

6. **Streaming & Logging Module**
   - **Responsibilities**:
     - Stream conversation outputs (and any error messages or logs) back to the host.
     - Implement a simple logging mechanism to capture errors and debugging information.
     - Attach logging information to the stream so the host can troubleshoot issues.

## Implementation Steps

1. **Project Setup**

   - Initialize a new TypeScript project.
   - Set up npm/yarn with required dependencies:
     - MCP TypeScript SDK
     - Express.js (or another minimal API framework)
     - A library for HTTP client calls (e.g., Axios or native fetch)
     - Any additional utilities (e.g., for streaming/SSE support)

2. **Configuration Management**

   - Implement a module to load the JSON configuration at startup.
   - Validate the configuration (possibly with a JSON schema) to ensure that required keys are present.

3. **Server Launch & Discovery**

   - For each server in the config:
     - Use Node’s `child_process.spawn` to execute the provided command.
     - Implement a retry or status check mechanism to confirm the server is running.
     - Query the server’s `/tools/list` and `/resources/list` endpoints to fetch capabilities.
   - Log the outcomes of these calls for debugging.

4. **API Development**

   - Set up an Express.js server with endpoints to:
     - Start a chat session.
     - Send messages to the chat session.
     - Stream responses back to the host (using SSE or a similar streaming mechanism).

5. **LLM Chat Integration**

   - Use the MCP TypeScript SDK to:
     - Initiate a chat conversation with the LLM.
     - Embed the system prompt that includes both the user-defined prompt and the discovered tool/resources details.
   - Implement logic to handle the conversation flow:
     - Forward user messages to the LLM.
     - Intercept LLM responses to check for tool usage instructions.
     - Limit tool calls to the configured `max_tool_calls`.

6. **Tool Invocation Workflow**

   - Parse LLM responses for tool call indicators.
   - For each tool call:
     - Use the MCP protocol (as specified in the MCP architecture) to format and send the tool usage request to the appropriate server.
     - Await and capture the server’s response.
     - Inject the tool response back into the conversation context.
   - Ensure that if no tool is called (or after the maximum number is reached), the final message is returned to the user.

7. **Streaming Response & Error Handling**

   - Implement a streaming mechanism to deliver conversation responses and logging info back to the host.
   - Attach error logs (if any) to the stream, ensuring they are clearly distinguishable from normal conversation output.
   - Test error scenarios (e.g., server failures) to verify that errors are logged and streamed correctly.

8. **Testing & Documentation**
   - Write unit tests for each module (configuration, server discovery, LLM integration, tool invocation, streaming).
   - Develop integration tests simulating a full conversation including tool calls.
   - Document API endpoints, configuration structure, and setup instructions.
   - Include inline code documentation for clarity.

## Next Steps & Future Improvements

- **Refinement**: Once the minimal working version is complete, further refine the code structure, logging, and error handling.
- **Enhanced Streaming**: Evaluate more robust streaming protocols (like WebSockets) if future performance requirements arise.
- **Security & Authentication**: Although not required now, plan for potential future integration of security mechanisms.
- **User Feedback Loop**: Gather feedback from initial users to iterate on functionality and improve usability.

---

This plan outlines the core steps required to build your MCP client prototype. Please review the approach and let me know if any additional details or modifications are needed.

```

---

Feel free to share your thoughts or ask for further clarifications as we refine the implementation plan.
```
