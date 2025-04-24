import * as vscode from 'vscode';

export function registerTranslationCommands(context: vscode.ExtensionContext) {
    // Example stub command
    const dummyTranslateCmd = vscode.commands.registerCommand('extension.translateText', () => {
        vscode.window.showInformationMessage('Translation feature not yet implemented.');
    });

    context.subscriptions.push(dummyTranslateCmd);
}