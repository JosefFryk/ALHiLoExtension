"use strict";
/**
 * Jest setup file - runs before each test file
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("./__mocks__/vscode");
// Reset all mocks before each test
beforeEach(() => {
    (0, vscode_1.resetMocks)();
});
// Global test timeout
jest.setTimeout(10000);
//# sourceMappingURL=setup.js.map