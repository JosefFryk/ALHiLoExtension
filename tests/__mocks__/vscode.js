"use strict";
/**
 * Mock implementation of VS Code API for unit testing.
 * This allows testing code that imports 'vscode' without running in VS Code.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationTarget = exports.ProgressLocation = exports.Selection = exports.Range = exports.Position = exports.Uri = exports.commands = exports.workspace = exports.window = exports.ExtensionContext = exports.SecretStorage = void 0;
exports.resetMocks = resetMocks;
exports.setMockSecret = setMockSecret;
exports.getMockSecrets = getMockSecrets;
// Mock SecretStorage
const mockSecrets = new Map();
exports.SecretStorage = {
    get: jest.fn((key) => Promise.resolve(mockSecrets.get(key))),
    store: jest.fn((key, value) => {
        mockSecrets.set(key, value);
        return Promise.resolve();
    }),
    delete: jest.fn((key) => {
        mockSecrets.delete(key);
        return Promise.resolve();
    })
};
// Mock ExtensionContext
exports.ExtensionContext = {
    secrets: exports.SecretStorage,
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
exports.window = {
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
exports.workspace = {
    getConfiguration: jest.fn(() => ({
        get: jest.fn((key, defaultValue) => defaultValue),
        update: jest.fn(() => Promise.resolve()),
        has: jest.fn(() => false),
        inspect: jest.fn()
    })),
    workspaceFolders: [],
    onDidChangeConfiguration: jest.fn()
};
// Mock commands
exports.commands = {
    registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
    executeCommand: jest.fn(() => Promise.resolve())
};
// Mock Uri
exports.Uri = {
    file: jest.fn((path) => ({ fsPath: path, path })),
    parse: jest.fn((uri) => ({ fsPath: uri, path: uri }))
};
// Mock Position and Range
class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}
exports.Position = Position;
class Range {
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }
}
exports.Range = Range;
class Selection extends Range {
    constructor(anchor, active) {
        super(anchor, active);
        this.anchor = anchor;
        this.active = active;
    }
}
exports.Selection = Selection;
// Mock ProgressLocation
var ProgressLocation;
(function (ProgressLocation) {
    ProgressLocation[ProgressLocation["SourceControl"] = 1] = "SourceControl";
    ProgressLocation[ProgressLocation["Window"] = 10] = "Window";
    ProgressLocation[ProgressLocation["Notification"] = 15] = "Notification";
})(ProgressLocation || (exports.ProgressLocation = ProgressLocation = {}));
// Mock ConfigurationTarget
var ConfigurationTarget;
(function (ConfigurationTarget) {
    ConfigurationTarget[ConfigurationTarget["Global"] = 1] = "Global";
    ConfigurationTarget[ConfigurationTarget["Workspace"] = 2] = "Workspace";
    ConfigurationTarget[ConfigurationTarget["WorkspaceFolder"] = 3] = "WorkspaceFolder";
})(ConfigurationTarget || (exports.ConfigurationTarget = ConfigurationTarget = {}));
// Helper to reset all mocks
function resetMocks() {
    mockSecrets.clear();
    jest.clearAllMocks();
}
// Helper to set mock secrets for testing
function setMockSecret(key, value) {
    mockSecrets.set(key, value);
}
// Helper to get all mock secrets (for testing)
function getMockSecrets() {
    return new Map(mockSecrets);
}
//# sourceMappingURL=vscode.js.map