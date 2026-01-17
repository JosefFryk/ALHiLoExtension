import * as vscode from 'vscode';
import { translateXLIFF } from '../xliff/xliff-handler';
import { translateText } from '../models/translation';
import { showUsageLog } from '../models/usageLoger';
import { applyFirstTranslation, lookupExistingTranslationsInOpenFile, buildOpenFileTranslationIndex, lookupExistingTranslationFromIndex } from '../xliff/fileTranslationHandler';

interface TranslationQuickPickItem extends vscode.QuickPickItem {
  __payload?: { translated: string; confidence: number; unitId?: string };
}

async function ensureDocumentSaved(file: vscode.TextDocument): Promise<boolean> {
  if (!file.isDirty) {
    return true;
  }

  const saved = await file.save();
  if (!saved) {
    vscode.window.showErrorMessage('Failed to save the file. Translation canceled.');
  }
  return saved;
}

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
   const safeTranslated = escapeXml(String(translated ?? ''));

  const targetTag =
    `<target state="translated" confidence="${confidence.toFixed(2)}" translationSource="${source}">` +
    `${safeTranslated}</target>`;
  
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

export async function translateAndLog(
  file: vscode.TextDocument,
  sourceLang: string,
  targetLang: string,
  numOptions = 1
) {
  const canProceed = await ensureDocumentSaved(file);
  if (!canProceed) {
    return;
  }

  // NEW: build index once (O(N)) from the currently opened document text
  const openText = file.getText();
  const openIndex = buildOpenFileTranslationIndex(openText);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Translating XLIFF...',
      cancellable: false,
    },
    async (progress) => {
      await translateXLIFF(
        file.fileName,
        async (text: string) => {
          const sourceText = String(text ?? '').trim();
          if (!sourceText) {
            return { translated: '', confidence: 0, source: 'unknown' };
          }

          // NEW: O(1) lookup in the pre-built index
          const hit = lookupExistingTranslationFromIndex(openIndex, sourceText);
          if (hit) {
            return {
              translated: hit.translated,
              confidence: hit.confidence,
              source: 'file',
            };
          }

          // otherwise AI
          const aiResults = await translateText(sourceText, sourceLang, targetLang, numOptions);
          const bestAI =
            (Array.isArray(aiResults) && aiResults.length > 0 && aiResults[0]) ||
            { translated: '', confidence: 0, source: 'aiTranslator' };

          if (bestAI?.translated) {
            // update index so next identical source is instant
            const key = sourceText.trim().replace(/\s+/g, ' ').toLowerCase();
            const conf = typeof bestAI.confidence === 'number' && isFinite(bestAI.confidence)
              ? bestAI.confidence
              : 0.9;
            openIndex.set(key, { translated: bestAI.translated, confidence: conf });
          }

          return bestAI;
        },
        progress
      );
    }
  );

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

  // Your existing helpers
  const { sourceLang, targetLang } = await extractLanguagesFromXLIFF(documentText);

  const transUnit = findTransUnitBlock(documentText, offset);
  if (!transUnit) {
    vscode.window.showInformationMessage('No translation unit found.');
    return;
  }

  const sourceMatch = transUnit.block.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);
  if (!sourceMatch) {
    vscode.window.showInformationMessage('No source text found in the block.');
    return;
  }

  const sourceText = sourceMatch[1].trim();
  const placeholder = `Translate: ${sourceText}`;

  // 0) Offer existing translations from the OPEN file (if any)
  const existingList = await lookupExistingTranslationsInOpenFile(sourceText);
  if (existingList.length > 0) {
    const existingOptions: TranslationQuickPickItem[] = existingList.map(e => ({
      label: e.translated,
      description: `existing in file • conf: ${(e.confidence * 100).toFixed(0)}%${e.unitId ? ` • id: ${e.unitId}` : ''}`,
      __payload: e
    }));
    // Add an option to fetch AI proposals
    existingOptions.push({ label: 'Get AI Translate', description: 'ask AI for proposals' });

    const pick = await vscode.window.showQuickPick(existingOptions, {
      placeHolder: 'Use an existing translation or fetch AI?',
      ignoreFocusOut: true
    });
    if (!pick) return; // ESC → do nothing

    // If the user picked an existing translation, write it now (only after selection)
    if (pick.label !== 'Get AI Translate' && pick.__payload) {
      const chosen = pick.__payload;
      const ok = await applyFirstTranslation(sourceText, chosen.translated, chosen.confidence, 'file');

      if (!ok) {
        // Fallback: update the block under the cursor if no needs-translation match was found
        const updatedBlock = updateTargetInBlock(
          transUnit.block,
          chosen.translated,
          chosen.confidence,
          'file'
        );
        await replaceBlock(editor, transUnit.block, transUnit.start, transUnit.end, updatedBlock);
      }

      vscode.window.showInformationMessage(`Translation inserted: ${chosen.translated}`);
      return; // done
    }
    // else: user chose "Get AI Translate" → continue to AI flow below
  }

  // 1) Explicit action to fetch AI proposals
  const action = await vscode.window.showQuickPick(['Get AI Translate'], { placeHolder: placeholder, ignoreFocusOut: true });
  if (!action) return; // ESC → do nothing

  // 2) Get up to 2 translation variants from AI
  const translations = await translateText(sourceText, sourceLang, targetLang, 2);
  if (!translations || translations.length === 0 || !translations[0]?.translated) {
    vscode.window.showInformationMessage('No translations generated.');
    return;
  }

  // 3) Split the first AI result into options (keeps your original behavior)
  const splitTranslations = translations[0].translated
    .split(/\n|\|/)
    .map(str => str.trim())
    .filter(str => str);

  if (splitTranslations.length === 0) {
    vscode.window.showInformationMessage('No valid translation options.');
    return;
  }

  const options = splitTranslations.map(t => ({
    label: t,
    description: `Confidence: ${(translations[0].confidence * 100).toFixed(2)}% • Source: ${translations[0].source}`
  }));

  // 4) Let the user pick the final wording
  const choice = await vscode.window.showQuickPick(options, {
    placeHolder: 'Select the best translation',
    ignoreFocusOut: true
  });
  if (!choice) return; // ESC → do nothing

  // 5) Write ONLY AFTER explicit selection
  const ok = await applyFirstTranslation(
    sourceText,
    choice.label,
    translations[0].confidence,
    translations[0].source
  );

  if (!ok) {
    // Fallback: update the block under the cursor if no <target state="needs-translation"> was found
    const updatedBlock = updateTargetInBlock(
      transUnit.block,
      choice.label,
      translations[0].confidence,
      translations[0].source
    );
    await replaceBlock(editor, transUnit.block, transUnit.start, transUnit.end, updatedBlock);
  }

  vscode.window.showInformationMessage(`Translation inserted: ${choice.label}`);
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

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
}
