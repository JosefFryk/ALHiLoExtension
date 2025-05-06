import * as vscode from 'vscode';
import { translateXLIFF } from '../xliff/xliff-handler';
import { translateText } from '../models/translation';
import { showUsageLog } from '../models/usageLoger';

export async function translateTextAI() {
  console.log('Translation command triggered');
  const file = vscode.window.activeTextEditor?.document;

  if (!file || !file.fileName.endsWith('.xliff')) {
    vscode.window.showInformationMessage('Please open an XLIFF file.');
    return;
  }

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Translating XLIFF...',
    cancellable: false,
  }, async () => {
    await translateXLIFF(file.fileName, (text) => translateText(text, 'en-US', 'cs-CZ'));
  });

  const result = await vscode.window.showInformationMessage('✅ XLIFF translation complete.', 'Show Usage');
  if (result === 'Show Usage') {
    showUsageLog();
  }
}
