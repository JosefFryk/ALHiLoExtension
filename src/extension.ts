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
                const regex = new RegExp(`\\b${word}\\b`, 'gi'); // Match whole words, case-insensitive
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
        const word = await vscode.window.showInputBox({ prompt: 'Enter the word to add (case-insensitive):' });
        const correctCase = await vscode.window.showInputBox({ prompt: `Enter the correct case for "${word}":` });
    
        if (word && correctCase) {
            const config = vscode.workspace.getConfiguration('caseCorrector');
            const referenceList = config.get<{ [key: string]: string }>('referenceList', {});
    
            referenceList[word.toLowerCase()] = correctCase;
    
            await config.update('referenceList', referenceList, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Added "${word}" as "${correctCase}" to the reference list.`);
        }
    });

    context.subscriptions.push(correctCaseCmd,toLowerCaseCmd,addWordCmd);
}

export function deactivate() {}