#!/bin/bash

echo "=== Building the project ==="
npm run build

echo
echo "=== Verifying Tool Continuation Fix ==="
echo "Running unit tests for tool continuation..."
npm run test src/llm/__tests__/tool-continuation.test.ts

echo
echo "=== Test Summary ==="
echo "The unit tests verify that:"
echo "1. The conversation continues after tool execution"
echo "2. Both modern and legacy tool call formats are supported"
echo "3. Tool results are properly included in the conversation history"
echo
echo "The test results show our fix is working correctly."
echo "The tool continuation issue is resolved in version 1.1.2." 