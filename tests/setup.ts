/**
 * Jest setup file - runs before each test file
 */

import { resetMocks } from './__mocks__/vscode';

// Reset all mocks before each test
beforeEach(() => {
  resetMocks();
});

// Global test timeout
jest.setTimeout(10000);
