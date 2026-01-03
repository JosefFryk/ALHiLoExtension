/**
 * Mock implementation of VS Code API for unit testing.
 * This allows testing code that imports 'vscode' without running in VS Code.
 */

// Mock SecretStorage
const mockSecrets = new Map<string, string>();

export const SecretStorage = {
  get: jest.fn((key: string) => Promise.resolve(mockSecrets.get(key))),
  store: jest.fn((key: string, value: string) => {
    mockSecrets.set(key, value);
    return Promise.resolve();
  }),
  delete: jest.fn((key: string) => {
    mockSecrets.delete(key);
    return Promise.resolve();
  })
};

// Mock ExtensionContext
export const ExtensionContext = {
  secrets: SecretStorage,
  subscriptions: [],
  extensionPath: '/mock/extension/path',
  globalState: {
    get: jest.fn(),
    update: jest.fn()
  },
  workspaceState: {
    get: jest.fn(),
    update: jest.fn()
  }
};

// Mock window
export const window = {
  showInformationMessage: jest.fn(() => Promise.resolve(undefined)),
  showWarningMessage: jest.fn(() => Promise.resolve(undefined)),
  showErrorMessage: jest.fn(() => Promise.resolve(undefined)),
  showQuickPick: jest.fn(() => Promise.resolve(undefined)),
  showInputBox: jest.fn(() => Promise.resolve(undefined)),
  showOpenDialog: jest.fn(() => Promise.resolve(undefined)),
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    append: jest.fn(),
    show: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn()
  })),
  withProgress: jest.fn((options, task) => task({ report: jest.fn() })),
  activeTextEditor: undefined
};

// Mock workspace
export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
    update: jest.fn(() => Promise.resolve()),
    has: jest.fn(() => false),
    inspect: jest.fn()
  })),
  workspaceFolders: [],
  onDidChangeConfiguration: jest.fn()
};

// Mock commands
export const commands = {
  registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
  executeCommand: jest.fn(() => Promise.resolve())
};

// Mock Uri
export const Uri = {
  file: jest.fn((path: string) => ({ fsPath: path, path })),
  parse: jest.fn((uri: string) => ({ fsPath: uri, path: uri }))
};

// Mock Position and Range
export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  constructor(
    public start: Position,
    public end: Position
  ) {}
}

export class Selection extends Range {
  constructor(
    public anchor: Position,
    public active: Position
  ) {
    super(anchor, active);
  }
}

// Mock ProgressLocation
export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15
}

// Mock ConfigurationTarget
export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3
}

// Helper to reset all mocks
export function resetMocks(): void {
  mockSecrets.clear();
  jest.clearAllMocks();
}

// Helper to set mock secrets for testing
export function setMockSecret(key: string, value: string): void {
  mockSecrets.set(key, value);
}

// Helper to get all mock secrets (for testing)
export function getMockSecrets(): Map<string, string> {
  return new Map(mockSecrets);
}
