// Declare vitest globals to fix TypeScript errors in test files
declare module 'vitest' {
  export interface TestContext {
    // Add any custom context you might need in tests
  }

  export const describe: (name: string, fn: () => void) => void;
  export const it: (name: string, fn: (...args: any[]) => any) => void;
  export const test: (name: string, fn: (...args: any[]) => any) => void;
  export const expect: any;
  export const beforeEach: (fn: () => any) => void;
  export const afterEach: (fn: () => any) => void;
  export const beforeAll: (fn: () => any) => void;
  export const afterAll: (fn: () => any) => void;
  export const vi: any;
}

// Declare chai globals for use in tests
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: (...args: any[]) => any) => void;
declare const test: (name: string, fn: (...args: any[]) => any) => void;
declare const expect: any;
declare const beforeEach: (fn: () => any) => void;
declare const afterEach: (fn: () => any) => void;
declare const beforeAll: (fn: () => any) => void;
declare const afterAll: (fn: () => any) => void;
