# Epics & User Stories for MCP Client Implementation

The goal is to incrementally build the MCP client. We start with a minimal, working prototype that handles LLM chat interactions, then later add server (tool) integration. Each user story focuses on clear data flow between components with measurable acceptance criteria.

---

## Epic 1: Basic LLM Chat Interaction

### User Story 1.1: Minimal Configuration File for LLM Chat

**Description**:  
As an engineer, I want a minimal configuration file that contains only LLM information so that we can focus on establishing LLM chat interactions before adding server functionality.

**Acceptance Criteria**:

- A configuration file exists (e.g., `config.json`) with the following structure:

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

- The client reads and parses this file on startup.
- If the file is missing or contains invalid JSON, an error is logged and a clear error message is returned.

---

### User Story 1.2: Initialize LLM Chat Session Using MCP SDK

**Description**:
As an engineer, I want to initialize an LLM chat session using the MCP TypeScript SDK based on the minimal configuration so that the client can start a conversation with the LLM.

**Acceptance Criteria**:

- The client initializes the LLM session using the MCP SDK with the provided LLM parameters.
- The system prompt is built solely from the configuration’s `system_prompt`.
- Successful initialization returns a unique session identifier that can be referenced in later requests.
- All initialization steps and outcomes are logged for debugging.

---

### User Story 1.3: Receive a Chat Message from the Host

**Description**:
As a host, I want to send a chat message to the client via an API endpoint so that I can interact with the LLM.

**Acceptance Criteria**:

- A RESTful API endpoint (e.g., `POST /chat/session/{sessionId}/message`) accepts a chat message.
- The endpoint validates that the session exists and accepts a non-empty message payload.
- On receipt, the client logs the incoming message and acknowledges receipt to the host.

---

### User Story 1.4: Forward Message to LLM and Retrieve a Response

**Description**:
As an engineer, I want the client to forward incoming chat messages to the LLM and retrieve the LLM’s response so that the conversation can progress.

**Acceptance Criteria**:

- The client sends the user’s message to the LLM using the MCP SDK.
- The LLM processes the message and returns a response.
- The response is logged and made available for streaming back to the host.
- Any errors in the LLM interaction are captured and logged.

---

### User Story 1.5: Stream LLM Response Back to the Host

**Description**:
As a host, I want to receive the LLM response in a streaming format so that I can see the conversation progress in real time.

**Acceptance Criteria**:

- The API endpoint streams the LLM’s response (using Server-Sent Events or HTTP chunked responses).
- The stream delivers the response message as soon as it is received from the LLM.
- The data flow clearly shows: host message → client → LLM → client → host.
- Logs and any error messages are included in the stream in a distinct format.

---

### User Story 1.6: Basic Error Handling and Logging in the LLM Chat Flow

**Description**:
As an engineer, I want clear error logging and error messages in the chat stream so that issues during LLM interaction can be diagnosed quickly.

**Acceptance Criteria**:

- All errors encountered during configuration loading, session initialization, or message handling are logged with details.
- When an error occurs, a distinct error message is streamed back to the host.
- The client continues to operate for new messages if recoverable.

---

## Epic 2: Extended Server Integration for Tool Invocation

_Note: This epic is only tackled once the basic LLM chat interaction is proven stable._

### User Story 2.1: Extend Configuration File to Include Server Details

**Description**:
As an engineer, I want to update the configuration file to include server information so that the client can later launch MCP servers for tool invocation.

**Acceptance Criteria**:

- The configuration file is extended with a `servers` section. For example:
  ```json
  {
    "llm": { ... },
    "max_tool_calls": 3,
    "servers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "YOUR_FILESYSTEM_WORK_DIR_HERE"],
        "env": {}
      },
      "terminal": {
        "command": "npx",
        "args": ["@rinardnick/mcp-terminal", "--allowed-commands", "[go,python3,uv,npm,npx,git,ls,cd,touch,mv,pwd,mkdir]"],
        "env": {}
      }
    }
  }
  ```
- The client successfully parses the extended configuration.
- The presence of server details is logged, even if they are not used in the initial LLM-only flow.

---

### User Story 2.2: Launch MCP Servers Based on Configuration

**Description**:
As an engineer, I want the client to launch each MCP server defined in the configuration so that their tool capabilities are available.

**Acceptance Criteria**:

- For each server in the configuration, a child process is spawned using the provided command, arguments, and environment variables.
- The client performs a basic health check (e.g., a ping or status endpoint call) to confirm each server is running.
- The system logs the launch status of each server.
- If a server fails to launch, an error is logged and returned as part of the debugging stream.

---

### User Story 2.3: Discover Server Capabilities

**Description**:
As an engineer, I want the client to query each launched server for its available tools and resources so that these details can be included in the LLM’s system prompt.

**Acceptance Criteria**:

- After launching, the client sends requests to each server’s `/tools/list` and `/resources/list` endpoints.
- The client stores and logs the retrieved capabilities.
- These capabilities are made available for incorporation into the LLM chat’s initialization prompt in subsequent sessions.

---

### User Story 2.4: Integrate Tool Invocation into LLM Chat Flow

**Description**:
As a host, I want the client to handle tool invocation requests from the LLM and incorporate the server’s response back into the conversation so that the LLM can leverage external tools.

**Acceptance Criteria**:

- The LLM chat flow is updated to detect a tool invocation instruction in its responses.
- When a tool invocation is detected, the client:
  - Formats the tool request per the MCP protocol.
  - Sends the request to the corresponding server.
  - Receives the tool’s output.
- The tool output is logged and injected into the ongoing LLM conversation context.
- The updated conversation (LLM response + tool output) is streamed back to the host.

---

### User Story 2.5: Limit Tool Invocations and Continue Conversation

**Description**:
As an engineer, I want the client to enforce a maximum number of tool invocations per session and continue the conversation seamlessly once that limit is reached so that the LLM does not enter an infinite loop of tool calls.

**Acceptance Criteria**:

- The client tracks the number of tool invocations in the current session.
- Once the number reaches the configured `max_tool_calls`, any further tool invocation requests are either ignored or replaced with a final message.
- The conversation continues normally without additional tool calls.
- The final message from the LLM (with no pending tool calls) is streamed back to the host.
- All steps, including when the tool limit is reached, are logged.

---

## Data Flow Summary

- **LLM-Only Flow (Epic 1)**:

  1. Host sends a chat message → Client receives it.
  2. Client forwards message to LLM via the MCP SDK.
  3. LLM processes and returns a response → Client logs and streams response back to Host.
  4. Errors during any of these steps are logged and streamed to Host.

- **Extended Flow with Server Integration (Epic 2)**:
  1. Host sends a chat message → Client receives it.
  2. Client forwards message to LLM.
  3. LLM responds and (if needed) issues a tool invocation.
  4. Client intercepts the tool call, sends a formatted request to the appropriate server.
  5. Server returns tool output → Client integrates tool output into conversation.
  6. Updated conversation is sent back to LLM and streamed to Host.
  7. The process repeats until tool call limits are reached or no further tool calls are requested.

---

# Next Steps

1. **Start with Epic 1**:

   - Implement and test the LLM chat flow with a minimal configuration.
   - Validate that messages are received, processed, and streamed correctly.

2. **Move to Epic 2**:

   - Extend the configuration and implement server launch and discovery.
   - Integrate tool invocation into the chat flow and test data flow from client → server → client → LLM.

3. **Iterative Testing & Feedback**:
   - Continuously test each user story against the acceptance criteria.
   - Gather feedback and adjust the user stories as needed.

---

This approach ensures that we build a simple, working prototype for LLM interaction first and then expand to include server-based tool invocation. Each user story is designed to validate a clear piece of the overall data flow, making it easier to test and deliver incremental user value.

```

---

These user stories focus on the smallest units of functionality and clearly describe the data flow between components. Let me know if you’d like to adjust or continue expanding on any particular area.
```

```

```
