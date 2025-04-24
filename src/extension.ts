import * as vscode from 'vscode';
import { registerTextCorrectionCommands } from './commands/textCorrectionCommands';
import { registerTranslationCommands } from './commands/translationCommands';

export function activate(context: vscode.ExtensionContext) {
    registerTextCorrectionCommands(context);
    registerTranslationCommands(context);
}

export function deactivate() {}