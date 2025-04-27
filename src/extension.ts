import * as vscode from 'vscode';
import { toLowerCase, addWordToList, correctCase } from './commands/textCorrectionCommands';
import { translateText } from './commands/translationCommands';

export function activate(context: vscode.ExtensionContext) {
    // registerTextCorrectionCommands(context);
    // registerTranslationCommands(context);
    let toLowerCaseCmd = vscode.commands.registerCommand('extension.toLowerCase', () => toLowerCase());
    let correctCaseCmd = vscode.commands.registerCommand('extension.correctCase', () => correctCase());
    let addWordToListCmd = vscode.commands.registerCommand('extension.addWordToList', () => addWordToList());
    let translateTextCmd = vscode.commands.registerCommand('extension.translateByAI', () => translateText());

    context.subscriptions.push(toLowerCaseCmd, correctCaseCmd, addWordToListCmd);
}
export function deactivate() {}