import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Command to convert selected text to lowercase
    let toLowerCaseCmd = vscode.commands.registerCommand('extension.toLowerCase', () => {
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
    });

    // Command to apply correct case to the entire document
    let correctCaseCmd = vscode.commands.registerCommand('extension.correctCase', () => {
        const editor = vscode.window.activeTextEditor;

        if (editor) {
            const document = editor.document;

            // Fetch the reference list from user settings
            const config = vscode.workspace.getConfiguration('caseCorrector');
            const referenceList = config.get<{ [key: string]: string }>('referenceList', {});

            const fullText = document.getText();
            let updatedText = fullText;

            // Replace words in the document based on the reference list
            for (const [word, correctWord] of Object.entries(referenceList)) {
                const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g'); // Case-sensitive match
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
    });

    let addWordCmd = vscode.commands.registerCommand('extension.addWordToList', async () => {
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

        // Prompt the user for the original word (case-sensitive) and the correct case
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

        // Fetch the current reference list
        const config = vscode.workspace.getConfiguration('caseCorrector');
        const referenceList = config.get<{ [key: string]: string }>('referenceList', {});

        // Add the new word to the list (case-sensitive)
        referenceList[originalWord] = correctWord;

        // Update the reference list in user settings
        await config.update('referenceList', referenceList, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Added "${originalWord}" as "${correctWord}" to the reference list.`);
    });

    context.subscriptions.push(correctCaseCmd,toLowerCaseCmd,addWordCmd);
}

// Utility function to escape special regex characters
function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function deactivate() {}