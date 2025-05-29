import * as vscode from 'vscode';
import { toLowerCase, addWordToList, correctCase } from './commands/textCorrectionCommands';
import { translateTextAI, translateSelectionCommand } from './commands/translationCommands';
import { exportTranslationDictionary } from './commands/exportTranslationDictionary';
import { exportTranslationToDB } from './commands/exportTranslationToDB';

export function activate(context: vscode.ExtensionContext) {
    let toLowerCaseCmd = vscode.commands.registerCommand('textCorrection.toLowerCase', () => toLowerCase());
    let correctCaseCmd = vscode.commands.registerCommand('textCorrection.correctCase', () => correctCase());
    let addWordToListCmd = vscode.commands.registerCommand('textCorrection.addWordToList', () => addWordToList());
    let translateTextAICmd = vscode.commands.registerCommand('hiloTranslator.translateByAI', () => translateTextAI());
    let exportTranslationDictionaryCmd = vscode.commands.registerCommand('hiloTranslator.exportTranslationDictionary', () => exportTranslationDictionary());
    let exportTranslationToDBCmd = vscode.commands.registerCommand('hiloTranslator.exportTranslationToDB', () => exportTranslationToDB());
    let translateSelectionCmd = vscode.commands.registerCommand('hiloTranslator.translateSelection', () => translateSelectionCommand());

    context.subscriptions.push(toLowerCaseCmd, correctCaseCmd, addWordToListCmd, translateTextAICmd, exportTranslationDictionaryCmd, exportTranslationToDBCmd, translateSelectionCmd);
}
export function deactivate() {}