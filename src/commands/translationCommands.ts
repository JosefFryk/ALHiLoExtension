import * as vscode from 'vscode';
import { translateXLIFF } from '../xliff/xliff-handler';
import { translateText } from '../models/translation';
import { showUsageLog } from '../models/usageLoger';

async function replaceBlock(editor: vscode.TextEditor, block: string, start: number, end: number, translatedBlock: string) {
  const range = new vscode.Range(
    editor.document.positionAt(start),
    editor.document.positionAt(end)
  );
  await editor.edit(editBuilder => {
    editBuilder.replace(range, translatedBlock);
  });
  await editor.document.save();
}

function updateTargetInBlock(block: string, translated: string, confidence: number, source:string): string {
  const targetTag = `<target state="translated" confidence="${confidence.toFixed(2)}" translationSource="${source}">${translated}</target>`;
  
  // Check if the block contains a self-closing target tag
  if (block.match(/<target[^>]*\/>/)) {
    return block.replace(/<target[^>]*\/>/, targetTag);
  }

  // Check if the block contains a target tag with content
  if (block.match(/<target[^>]*>.*?<\/target>/)) {
    return block.replace(/<target[^>]*>.*?<\/target>/, targetTag);
  }

  // Fallback: If no target tag is found, add it after the source tag
  return block.replace(/(<source>.*?<\/source>)/, `$1\n    ${targetTag}`);
}

function findTransUnitBlock(text: string, position: number): { block: string, start: number, end: number } | null {
  const regex = /<trans-unit[^>]*>([\s\S]*?)<\/trans-unit>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (position >= start && position <= end) {
      return { block: match[0], start, end };
    }
  }
  return null;
}

function extractLanguagesFromXLIFF(text: string): { sourceLang: string, targetLang: string } {
  const sourceLangMatch = text.match(/source-language="([^"]+)"/);
  const targetLangMatch = text.match(/target-language="([^"]+)"/);
  return {
    sourceLang: sourceLangMatch ? sourceLangMatch[1] : 'en-US',
    targetLang: targetLangMatch ? targetLangMatch[1] : 'cs-CZ'
  };
}

async function getLanguagesFromFile(file: vscode.TextDocument): Promise<{ sourceLang: string, targetLang: string }> {
  const documentText = file.getText();
  return extractLanguagesFromXLIFF(documentText);
}

async function translateAndLog(file: vscode.TextDocument, sourceLang: string, targetLang: string, numOptions = 1) {
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Translating XLIFF...',
    cancellable: false,
  }, async () => {
    await translateXLIFF(file.fileName, async (text) => {
      const result = await translateText(text, sourceLang, targetLang, numOptions);
      return result.length > 0 ? result[0] : { translated: '', confidence: 0, source: 'unknown' };
    });
  });

  const result = await vscode.window.showInformationMessage('✅ XLIFF translation complete.', 'Show Usage');
  if (result === 'Show Usage') {
    showUsageLog();
  }
}
export async function translateSelectionCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor.');
    return;
  }

  const position = editor.selection.start;
  const documentText = editor.document.getText();
  const offset = editor.document.offsetAt(position);
  const { sourceLang, targetLang } = await extractLanguagesFromXLIFF(documentText);

  const transUnit = findTransUnitBlock(documentText, offset);
  if (!transUnit) {
    vscode.window.showInformationMessage('No translation unit found.');
    return;
  }

  const sourceMatch = transUnit.block.match(/<source>([\s\S]*?)<\/source>/);
  if (!sourceMatch) {
    vscode.window.showInformationMessage('No source text found in the block.');
    return;
  }

  const sourceText = sourceMatch[1].trim();
  const placeholder = `Translate: ${sourceText}`;


vscode.window.showQuickPick(['Get AI Translate'], { placeHolder: placeholder }).then(async (choice) => {
  if (choice) {
    const translations = await translateText(sourceText, sourceLang, targetLang,2);

    // Split the translated string by newline or other delimiters
    const splitTranslations = translations[0].translated.split(/\n|\|/).map(str => str.trim()).filter(str => str);

    const options = splitTranslations.map((t, index) => ({
      label: t,
      description: `Confidence: ${(translations[0].confidence * 100).toFixed(2)}% • Source: ${translations[0].source}`
    }));

    vscode.window.showQuickPick(options, {
      placeHolder: 'Select the best translation'
    }).then(async (finalChoice) => {
      if (finalChoice) {
        const updatedBlock = updateTargetInBlock(transUnit.block, finalChoice.label, translations[0].confidence,translations[0].source);
        await replaceBlock(editor, transUnit.block, transUnit.start, transUnit.end, updatedBlock);
        vscode.window.showInformationMessage(`Translation inserted: ${finalChoice.label}`);
      }
    });
  }
});
}
 
export async function translateTextAI() {
  console.log('Translation command triggered');
  const file = vscode.window.activeTextEditor?.document;

  if (!file || !(file.fileName.endsWith('.xliff') || file.fileName.endsWith('.xlf'))) {
    vscode.window.showInformationMessage('Please open an XLIFF file.');
    return;
  }

  const { sourceLang, targetLang } = await getLanguagesFromFile(file);
  await translateAndLog(file, sourceLang, targetLang);
}