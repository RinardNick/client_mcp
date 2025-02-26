/**
 * Tests for tool call parsing in various formats
 */

import { describe, it, expect } from 'vitest';

// Function to simulate the tool call detection logic in session.ts
function detectToolCall(response: any): { hasToolCall: boolean; toolCall?: any } {
  let content = '';
  let hasToolCall = false;
  let toolCall = undefined;
  
  // Look for tool calls in the structured response format
  const toolCalls = response.content?.filter(item => item.type === 'tool_use');
  
  if (toolCalls && toolCalls.length > 0) {
    // We have a structured tool call
    const toolUse = toolCalls[0];
    
    if (toolUse.id && toolUse.name && toolUse.input) {
      hasToolCall = true;
      toolCall = {
        name: toolUse.name,
        parameters: toolUse.input
      };
    }
  }
  
  // Extract text content
  const textContent = response.content?.filter(item => item.type === 'text');
  if (textContent && textContent.length > 0) {
    content = textContent[0].text;
  } else if (toolCalls && toolCalls.length > 0) {
    // If we only have tool calls, create a placeholder content
    content = `I need to use the ${toolCalls[0].name} tool.`;
  }
  
  // For backward compatibility, also check for <tool> tag format
  if (!hasToolCall && content) {
    const toolMatch = content.match(/<tool>(.*?)<\/tool>/s);
    
    if (toolMatch && toolMatch[1]) {
      hasToolCall = true;
      const toolContent = toolMatch[1].trim();
      const spaceIndex = toolContent.indexOf(' ');
      if (spaceIndex > -1) {
        const name = toolContent.slice(0, spaceIndex);
        const paramsStr = toolContent.slice(spaceIndex + 1);
        try {
          toolCall = {
            name,
            parameters: JSON.parse(paramsStr),
          };
        } catch (error) {
          console.error('Failed to parse tool parameters:', error);
        }
      }
    }
  }
  
  return { hasToolCall, toolCall };
}

describe('Tool Call Parsing', () => {
  it('should detect structured tool calls', () => {
    const response = {
      content: [
        {
          type: 'tool_use',
          id: 'tool_1',
          name: 'list_files',
          input: {
            path: '/home/user'
          }
        },
        {
          type: 'text',
          text: 'I need to check what files are in your directory.'
        }
      ]
    };
    
    const result = detectToolCall(response);
    
    expect(result.hasToolCall).toBe(true);
    expect(result.toolCall).toBeDefined();
    expect(result.toolCall?.name).toBe('list_files');
    expect(result.toolCall?.parameters).toEqual({ path: '/home/user' });
  });
  
  it('should detect legacy tool calls in text', () => {
    const response = {
      content: [
        {
          type: 'text',
          text: 'I need to check what files are in your directory. <tool>list_files {"path": "/home/user"}</tool>'
        }
      ]
    };
    
    const result = detectToolCall(response);
    
    expect(result.hasToolCall).toBe(true);
    expect(result.toolCall).toBeDefined();
    expect(result.toolCall?.name).toBe('list_files');
    expect(result.toolCall?.parameters).toEqual({ path: '/home/user' });
  });
  
  it('should handle responses with no tool calls', () => {
    const response = {
      content: [
        {
          type: 'text',
          text: 'Here is the information you requested.'
        }
      ]
    };
    
    const result = detectToolCall(response);
    
    expect(result.hasToolCall).toBe(false);
    expect(result.toolCall).toBeUndefined();
  });
  
  it('should handle malformed tool calls gracefully', () => {
    const response = {
      content: [
        {
          type: 'text',
          text: 'I need to check what files are in your directory. <tool>list_files {"path": "/home/user"</tool>'
        }
      ]
    };
    
    const result = detectToolCall(response);
    
    // The tool call will be detected but parameters won't parse
    expect(result.hasToolCall).toBe(true);
    expect(result.toolCall).toBeUndefined();
  });
  
  it('should prioritize structured tool calls over legacy format', () => {
    const response = {
      content: [
        {
          type: 'tool_use',
          id: 'tool_1',
          name: 'list_files',
          input: {
            path: '/structured/path'
          }
        },
        {
          type: 'text',
          text: 'I need to check files. <tool>list_files {"path": "/legacy/path"}</tool>'
        }
      ]
    };
    
    const result = detectToolCall(response);
    
    expect(result.hasToolCall).toBe(true);
    expect(result.toolCall?.name).toBe('list_files');
    expect(result.toolCall?.parameters).toEqual({ path: '/structured/path' });
  });
});