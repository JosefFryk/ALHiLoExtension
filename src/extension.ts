import * as vscode from 'vscode';
import { toLowerCase, addWordToList, correctCase } from './commands/textCorrectionCommands';
import { translateTextAI, translateSelectionCommand } from './commands/translationCommands';
import { exportTranslationDictionary } from './commands/exportTranslationDictionary';
import { exportTranslationToDB } from './commands/exportTranslationToDB';
import { applyCorrectionsFromCosmos } from './commands/applyCorrectionsFromCosmos';
import { importExcelCorrections } from './commands/importExcelCorrections';
import { applyExcelCorrections } from './commands/applyExcelCorrections';
import { initConfigManager } from './setup/configurationManager';
import { runSetupCommand, checkFirstRunSetup, showConfigStatus } from './setup/setupCommand';

export function activate(context: vscode.ExtensionContext) {
    // Initialize the configuration manager with SecretStorage
    initConfigManager(context);

    // Register commands
    const toLowerCaseCmd = vscode.commands.registerCommand('textCorrection.toLowerCase', () => toLowerCase());
    const correctCaseCmd = vscode.commands.registerCommand('textCorrection.correctCase', () => correctCase());
    const addWordToListCmd = vscode.commands.registerCommand('textCorrection.addWordToList', () => addWordToList());
    const translateTextAICmd = vscode.commands.registerCommand('hiloTranslator.translateByAI', () => translateTextAI());
    const exportTranslationDictionaryCmd = vscode.commands.registerCommand('hiloTranslator.exportTranslationDictionary', () => exportTranslationDictionary());
    const exportTranslationToDBCmd = vscode.commands.registerCommand('hiloTranslator.exportTranslationToDB', () => exportTranslationToDB());
    const translateSelectionCmd = vscode.commands.registerCommand('hiloTranslator.translateSelection', () => translateSelectionCommand());
    const applyCorrectionsFromCosmosCmd = vscode.commands.registerCommand('hiloTranslator.applyCorrectionsFromCosmos', () => applyCorrectionsFromCosmos());
    const importExcelCorrectionsCmd = vscode.commands.registerCommand('hiloTranslator.importExcelCorrections', () => importExcelCorrections());
    const applyExcelCorrectionsCmd = vscode.commands.registerCommand('hiloTranslator.applyExcelCorrections', () => applyExcelCorrections());

    // Setup commands
    const setupCmd = vscode.commands.registerCommand('hiloTranslator.setup', () => runSetupCommand());
    const configStatusCmd = vscode.commands.registerCommand('hiloTranslator.configStatus', () => showConfigStatus());

    context.subscriptions.push(
        toLowerCaseCmd,
        correctCaseCmd,
        addWordToListCmd,
        translateTextAICmd,
        exportTranslationDictionaryCmd,
        exportTranslationToDBCmd,
        translateSelectionCmd,
        applyCorrectionsFromCosmosCmd,
        importExcelCorrectionsCmd,
        applyExcelCorrectionsCmd,
        setupCmd,
        configStatusCmd
    );

    // Check if first-run setup is needed (async, non-blocking)
    checkFirstRunSetup();
}

export function deactivate() {}
