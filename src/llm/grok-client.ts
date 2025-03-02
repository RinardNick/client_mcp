/**
 * Simple client for the Grok API
 * This is a wrapper for API interactions since there is no official SDK yet
 */

export interface GrokMessage {
  role: string;
  content: string;
}

export interface GrokCompletionOptions {
  model: string;
  messages: GrokMessage[];
  system_prompt?: string;
  max_tokens?: number;
  temperature?: number;
  tools?: any[];
  stream?: boolean;
}

export interface GrokResponse {
  message: {
    content: string;
    tool_calls?: any[] | null;
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GrokStreamChunk {
  content?: string;
  tool_call?: any;
  done?: boolean;
  error?: string;
}

/**
 * Client for interacting with the Grok API
 */
export class GrokClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.xai.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Make a request to the Grok API
   */
  private async makeRequest(endpoint: string, data: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Create a completion (non-streaming)
   */
  async complete(options: GrokCompletionOptions): Promise<GrokResponse> {
    const requestBody = {
      model: options.model,
      messages: options.messages,
      system_prompt: options.system_prompt,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      tools: options.tools,
    };

    return await this.makeRequest('chat/completions', requestBody);
  }

  /**
   * Create a streaming completion
   */
  async streamComplete(
    options: GrokCompletionOptions
  ): Promise<AsyncIterable<GrokStreamChunk>> {
    const requestBody = {
      ...options,
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Grok API streaming error: ${response.status} - ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error('Grok API returned empty response stream');
    }

    // Return an async iterable that processes the stream
    return {
      [Symbol.asyncIterator]: async function* () {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // Final chunk with done flag
              yield { done: true };
              break;
            }

            // Decode the chunk and add to buffer
            buffer += decoder.decode(value, { stream: true });

            // Process any complete lines in the buffer
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep any incomplete line in the buffer

            for (const line of lines) {
              if (line.trim() === '') continue;

              if (line.startsWith('data: ')) {
                const data = line.slice(6);

                if (data === '[DONE]') {
                  yield { done: true };
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);

                  // Extract content and yield
                  if (parsed.choices && parsed.choices[0]) {
                    const choice = parsed.choices[0];

                    if (choice.delta?.content) {
                      yield { content: choice.delta.content };
                    }

                    if (choice.delta?.tool_call) {
                      yield { tool_call: choice.delta.tool_call };
                    }
                  }
                } catch (e) {
                  yield { error: `Error parsing stream data: ${e}` };
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      },
    };
  }
}
