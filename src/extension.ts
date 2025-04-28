import * as vscode from 'vscode';
import { toLowerCase, addWordToList, correctCase } from './commands/textCorrectionCommands';
import { translateTextAI } from './commands/translationCommands';

export function activate(context: vscode.ExtensionContext) {
    let toLowerCaseCmd = vscode.commands.registerCommand('extension.toLowerCase', () => toLowerCase());
    let correctCaseCmd = vscode.commands.registerCommand('extension.correctCase', () => correctCase());
    let addWordToListCmd = vscode.commands.registerCommand('extension.addWordToList', () => addWordToList());
    let translateTextAICmd = vscode.commands.registerCommand('extension.translateByAI', () => translateTextAI());

    context.subscriptions.push(toLowerCaseCmd, correctCaseCmd, addWordToListCmd, translateTextAICmd);
}
export function deactivate() {}