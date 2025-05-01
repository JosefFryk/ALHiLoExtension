import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { CosmosClient } from '@azure/cosmos';
import { v4 as uuidv4 } from 'uuid';

export async function exportTranslationToDB() {
    const sourceDatabase = await vscode.window.showQuickPick(
        ['None', 'Microsoft', 'OurDB', 'AITranslated'],
        { placeHolder: 'Select the source of these translations' }
      );
    
      if (!sourceDatabase) return;
    
      let confidence = 0.7;
      switch (sourceDatabase) {
        case 'Microsoft':
          confidence = 1.0;
          break;
        case 'OurDB':
          confidence = 0.9;
          break;
        case 'AITranslated':
          // TODO: Determine confidence dynamically or from AI model
          confidence = 0.8;
          break;
        case 'None':
        default:
          confidence = 0.7;
          break;
      }

  const fileUri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    openLabel: 'Select a translated .xliff file'
  });

  if (!fileUri || fileUri.length === 0) return;

  const filePath = fileUri[0].fsPath;
  const parser = new XMLParser({ ignoreAttributes: false });

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const json = parser.parse(raw);

    let units = json?.xliff?.file?.body?.['trans-unit'];
    if (!units && json?.xliff?.file?.body?.group?.['trans-unit']) {
      units = json.xliff.file.body.group['trans-unit'];
    }

    const unitArray = Array.isArray(units) ? units : units ? [units] : [];
    if (unitArray.length === 0) {
      vscode.window.showWarningMessage('No translation units found in the selected file.');
      return;
    }

    const config = vscode.workspace.getConfiguration();
    const cosmosEndpoint = config.get<string>('hiloTranslate.cosmosEndpoint');
    const cosmosKey = config.get<string>('hiloTranslate.cosmosKey');

    if (!cosmosEndpoint || !cosmosKey) {
      vscode.window.showErrorMessage('Cosmos DB endpoint or key is not configured.');
      return;
    }

    const client = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
    const container = client.database('translations').container('id');

    try {
        await container.read();
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `❌ Cosmos DB container not found. Check your database/container name in the code.\n${err.message}`
        );
        return;
      }

    let successCount = 0;
    let skippedCount = 0;

    for (const unit of unitArray) {
      const rawSource = unit.source;
      const rawTarget = unit.target;

      const source = typeof rawSource === 'string'
        ? rawSource.trim()
        : typeof rawSource?.['#text'] === 'string'
          ? rawSource['#text'].trim()
          : '';

      const target = typeof rawTarget === 'string'
        ? rawTarget.trim()
        : typeof rawTarget?.['#text'] === 'string'
          ? rawTarget['#text'].trim()
          : '';

      const state = rawTarget?.['@_state'];

      if (source && target && state === 'translated') {
        const item = {
          id: uuidv4(),
          source,
          target,
          sourceLang: json?.xliff?.file?.['@_source-language'] || 'en',
          targetLang: json?.xliff?.file?.['@_target-language'] || 'cs',
          confidence,
          sourceDatabase,
          timestamp: new Date().toISOString()
        };

        try {
          await container.items.create(item);
          successCount++;
        } catch (err: any) {
          if (err.code === 409) {
            skippedCount++;
            console.warn(`⚠️ Duplicate skipped: ${source}`);
          } else {
            console.error(`❌ Failed to insert: ${source}`, err.message);
          }
        }
      }
    }

    vscode.window.showInformationMessage(`✅ Exported ${successCount} translations. ⚠️ Skipped ${skippedCount} duplicates.`);
  } catch (err) {
    console.error(`Failed to parse ${filePath}:`, err);
    vscode.window.showErrorMessage('❌ Failed to export translations: ' + (err as any).message);
  }
}
