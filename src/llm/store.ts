import { ChatSession } from './types';

// Global session store shared across imports
export const globalSessions = new Map<string, ChatSession>();
