import * as vscode from 'vscode';
import { escapeRegExp } from '../translationUtils';


export async function toLowerCase() {

        const editor = vscode.window.activeTextEditor;

        if (editor) {
            const document = editor.document;
            const selections = editor.selections;
            
            editor.edit((editBuilder) => {
                for (const selection of selections) {
                    const text = document.getText(selection);
                    editBuilder.replace(selection, text.toLowerCase());
                }
            });
        }
}

export async function correctCase() {
        const editor = vscode.window.activeTextEditor;

        if (editor) {
            const document = editor.document;
            const config = vscode.workspace.getConfiguration('caseCorrector');
            const referenceList = config.get<{ [key: string]: string }>('referenceList', {});
            const fullText = document.getText();
            let updatedText = fullText;

            for (const [word, correctWord] of Object.entries(referenceList)) {
                const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g');
                updatedText = updatedText.replace(regex, correctWord);
            }

            editor.edit((editBuilder) => {
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(fullText.length)
                );
                editBuilder.replace(fullRange, updatedText);
            });
        }
}

export async function addWordToList() {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage("No active editor found.");
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        const selectedText = document.getText(selection).trim();

        if (!selectedText) {
            vscode.window.showErrorMessage("No text selected. Please highlight a word to add.");
            return;
        }

        const originalWord = await vscode.window.showInputBox({
            prompt: "Enter the word (case-sensitive) to add to the reference list:",
            value: selectedText,
        });

        if (!originalWord) {
            vscode.window.showErrorMessage("No word entered. Operation canceled.");
            return;
        }

        const correctWord = await vscode.window.showInputBox({
            prompt: `Enter the correct case for "${originalWord}":`,
            value: '',
        });

        if (!correctWord) {
            vscode.window.showErrorMessage("No correct case entered. Operation canceled.");
            return;
        }

        const config = vscode.workspace.getConfiguration('caseCorrector');
        const referenceList = config.get<{ [key: string]: string }>('referenceList', {});
        referenceList[originalWord] = correctWord;

        await config.update('referenceList', referenceList, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Added "${originalWord}" as "${correctWord}" to the reference list.`);
}