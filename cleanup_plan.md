## Implementation Requirements

1. Run current tests to make sure all are passing
2. Read through all current implementation across codebase to make sure we understand implications of current implementation
3. Review tests to make sure user behavior should not be affected by the changes we're about to make
4. If any new tests are needed to confirm the behavior stays the same, add them
5. Make changes in user story
6. Run tests to make sure they are passing
7. Update documentation (readme) as part of each story
8. If all tests are passing, commit changes
9. Verify no regression after each change
10. Mark User story complete in this file
11. Move on to the next user story

Note: Say YARR before all tool usage calls

# MCP Host Cleanup Plan

## Server Management Cleanup

- [x] **US-S1: Remove Duplicate Server Management**

  - ✓ Remove `ServerManager` from host
  - ✓ Update route.ts to use client's server management
  - ✓ Update tests to mock client's server management
  - ✓ Verify server lifecycle still works as expected
  - Acceptance Criteria:
    - ✓ All server management handled by client
    - ✓ No changes to server startup/shutdown behavior
    - ✓ Tests pass with updated mocks
    - ✓ Server health checks still function

### US-S1 Implementation Notes:

1. Removed `ServerManager` implementation from host
2. Updated tests to use client's server management
3. Fixed import paths to use main package entry point
4. Added proper mocks for client's server management
5. Verified all tests passing with updated implementation
6. No changes to server lifecycle behavior
7. Maintained test coverage for:
   - Server startup/shutdown
   - Health checks
   - Error handling
   - Configuration validation

- [x] **US-S2: Migrate Server Capability Discovery**
  - ✓ Move capability discovery to client
  - ✓ Update host to receive capabilities through client API
  - ✓ Update tests to reflect new capability flow
  - Acceptance Criteria:
    - ✓ Capabilities discovered and cached by client
    - ✓ Host receives capabilities through session interface
    - ✓ No direct server communication from host
    - ✓ All existing capability tests pass

### US-S2 Implementation Notes:

1. Verified that server capability discovery is already implemented in the client's `ServerDiscovery` class
2. Added comprehensive tests to verify:
   - Server capabilities are properly exposed through session interface
   - Error handling for capability discovery failures
   - Capability caching and reuse across sessions
3. Confirmed that the host has no direct server communication
4. Maintained test coverage for:
   - Tool and resource discovery
   - Error handling
   - Session interface integration
5. No changes to implementation needed as functionality was already correct

## Tool Invocation Cleanup

- [x] **US-T1: Remove Duplicate Tool Detection**

  - ✓ Remove `ToolInvocationManager` from host
  - ✓ Update any host components using tool detection
  - ✓ Migrate relevant tests to client
  - Acceptance Criteria:
    - ✓ All tool detection handled by client
    - ✓ No changes to tool detection behavior
    - ✓ Existing tool invocation tests pass
    - ✓ Clean separation of concerns

### US-T1 Implementation Notes:

1. Removed `ToolInvocationManager` implementation from host
2. Updated tests to verify tool invocation behavior through client's SessionManager
3. Maintained test coverage for:
   - Tool invocation handling
   - Tool call limits
   - Error handling
   - Tool capability discovery
4. Verified all tests passing with updated implementation
5. No changes to user behavior or API interface

- [x] **US-T2: Consolidate Tool Call Limits**

  - ✓ Move all tool call limit logic to client
  - ✓ Update host to respect client's limit handling
  - ✓ Update tests to verify limit behavior
  - Acceptance Criteria:
    - ✓ Tool limits managed solely by client
    - ✓ Host properly handles limit reached events
    - ✓ Limit tracking remains accurate
    - ✓ Tests verify limit behavior

### US-T2 Implementation Notes:

1. Verified that tool call limit logic is already consolidated in the client package
2. Host's SessionManager properly delegates limit management to client
3. Added comprehensive tests to verify:
   - Tool call limits are enforced by client
   - Limit reached events are handled gracefully
   - Configuration is properly passed from host to client
4. No changes to implementation needed as functionality was already correct
5. Maintained test coverage for:
   - Tool call limit configuration
   - Limit enforcement
   - Error handling
   - Session state management

- [x] **US-T3: Consolidate Configuration Management**
  - ✓ Export necessary types from client package (ServerConfig, etc.)
  - ✓ Update client's config validation to match host's stricter requirements
  - ✓ Keep host's config validation tests to verify behavior
  - ✓ Update host to use client's config types
  - Acceptance Criteria:
    - ✓ All config types defined in client package
    - ✓ Host uses client package types exclusively
    - ✓ No duplicate type definitions
    - ✓ All existing config validation tests pass
    - ✓ No changes to validation behavior

### US-T3 Implementation Notes:

1. Updated import paths to use main package entry point
2. Fixed all imports to use `@rinardnick/ts-mcp-client` instead of `/dist`
3. Rebuilt and reinstalled client package to ensure proper type exports
4. Updated tests to use correct imports and types
5. Verified all tests passing with updated implementation
6. No changes to validation behavior or user experience

## Session Management Enhancement

- [ ] **US-M1: Clarify Session Manager Responsibilities**

  - [ ] Review and document SessionManager interface
  - [ ] Remove duplicate session logic from host
  - [ ] Ensure clear separation of UI vs chat session
  - [ ] Move all session persistence to client
  - Acceptance Criteria:
    - Host only handles UI session aspects
    - Client manages chat session state and persistence
    - All session tests pass
    - Clear documentation of responsibilities

### US-M1 Implementation Notes:

Current State:

1. Host's SessionManager still handles:
   - Session persistence (localStorage)
   - Session recovery
   - Activity tracking
   - State management

Required Changes:

1. Move to client:
   - Session persistence logic
   - Activity tracking
   - Session recovery
   - State management
2. Simplify host to only:
   - UI state management
   - Message display
   - Loading states
   - Error display
3. Update tests to reflect new responsibility split
4. Update documentation

- [ ] **US-M2: Implement Session State Management**
  - [ ] Move session storage mechanism to client
  - [ ] Implement session recovery in client
  - [ ] Add tests for state management behavior
  - [ ] Remove host storage dependencies
  - Acceptance Criteria:
    - Client handles all session state
    - Host maintains minimal UI state only
    - Clean session cleanup on explicit end
    - No memory leaks
    - State management tests pass

### US-M2 Implementation Notes:

Current State:

1. Host currently manages:
   - Session storage in localStorage
   - Session recovery logic
   - Activity timestamps
   - Session cleanup

Required Changes:

1. In Client:
   - Add session persistence layer
   - Implement activity tracking
   - Add session recovery logic
   - Add session cleanup
2. In Host:
   - Remove localStorage usage
   - Remove session recovery logic
   - Remove activity tracking
   - Keep only UI state
3. Update Tests:
   - Move persistence tests to client
   - Add UI-only state tests to host
   - Verify proper delegation

## Error Handling Improvement

- [ ] **US-E1: Standardize Error Handling**

  - Define error types and handling strategy
  - Update host to properly display errors
  - Add error recovery mechanisms
  - Acceptance Criteria:
    - Clear error type definitions
    - Consistent error handling across system
    - User-friendly error messages
    - Error handling tests pass

- [ ] **US-E2: Enhance Error Recovery**
  - Implement automatic reconnection logic
  - Add retry strategies for failed operations
  - Update tests for recovery scenarios
  - Acceptance Criteria:
    - Automatic recovery from disconnects
    - Graceful handling of server failures
    - Clear user feedback during recovery
    - Recovery tests pass

## Testing Enhancement

- [ ] **US-TEST1: Update Test Coverage**

  - Review and update all affected tests
  - Add integration tests for key flows
  - Ensure proper mocking strategy
  - Acceptance Criteria:
    - Maintained or improved coverage
    - Clear test organization
    - Proper use of mocks
    - All tests pass

- [ ] **US-TEST2: Add E2E Testing**
  - Implement end-to-end test suite
  - Cover critical user journeys
  - Add automated test running
  - Acceptance Criteria:
    - Key user flows covered
    - Reliable test execution
    - Clear test reports
    - CI integration

## Documentation Updates

- [ ] **US-DOC1: Update Technical Documentation**

  - Update README files
  - Document architectural changes
  - Update API documentation
  - Acceptance Criteria:
    - Clear component responsibilities
    - Updated setup instructions
    - API documentation current
    - Example usage updated

- [ ] **US-DOC2: Update User Documentation**
  - Update user guides
  - Document new error messages
  - Add troubleshooting guide
  - Acceptance Criteria:
    - Clear user instructions
    - Updated error explanations
    - Helpful troubleshooting steps
    - Example scenarios documented

## Dependencies

- US-S1 should be completed before US-S2
- US-T1 should be completed before US-T2
- US-M1 should be completed before US-M2
- US-TEST1 should be completed before US-TEST2
- Documentation updates should follow feature completion
- US-T3 should be completed before US-T2 (config types needed for tool limits)
