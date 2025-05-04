import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { CosmosClient, PartitionKeyBuilder } from '@azure/cosmos';

export async function exportTranslationToDB() {
  const translationType = await vscode.window.showQuickPick(
    ['None', 'Microsoft', 'OurDB', 'AITranslated'],
    { placeHolder: 'Select the translation type' }
  );

  if (!translationType) return;

  let confidence = 0.7;
  switch (translationType) {
    case 'Microsoft':
      confidence = 1.0;
      break;
    case 'OurDB':
      confidence = 0.9;
      break;
    case 'AITranslated':
      confidence = 0.8; // TODO: refine AI confidence later
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

    let sourceDatabase = json?.xliff?.file?.['@_original'] || 'Unknown';
    sourceDatabase = sourceDatabase.trim().replace(/\s+/g, '');

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
    const dbResponse = await client.databases.createIfNotExists({ id: 'translations' });
    const db = dbResponse.database;

    const containerDef = {
      id: sourceDatabase,
      partitionKey: {
        paths: ['/source']
      },
      PartitionKeyBuilder
    };

    const { container } = await db.containers.createIfNotExists(containerDef);

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting translations to Cosmos DB...',
      cancellable: false
    }, async (progress) => {
      let successCount = 0;
      let skippedCount = 0;
      const total = unitArray.length;
      let processed = 0;

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
        const xliffId = unit['@_id']?.trim();

        if (source && target && state === 'translated' && xliffId) {
          try {
            const existing = await container.items
              .query({
                query: 'SELECT * FROM c WHERE c.id = @id',
                parameters: [{ name: '@id', value: xliffId }]
              })
              .fetchAll();

            if (existing.resources.length > 0) {
              skippedCount++;
            } else {
              const item = {
                id: xliffId,
                source,
                target,
                sourceLang: json?.xliff?.file?.['@_source-language'] || 'en',
                targetLang: json?.xliff?.file?.['@_target-language'] || 'cs',
                confidence,
                sourceDatabase,
                translationType,
                timestamp: new Date().toISOString()
              };
              await container.items.create(item);
              successCount++;
            }
          } catch (err: any) {
            console.error(`❌ Failed to insert or check: ${source}`, err.message);
          }
        }

        processed++;
        progress.report({ increment: (100 / total), message: `${processed}/${total}` });
      }

      vscode.window.showInformationMessage(`✅ Exported ${successCount} translations. ⚠️ Skipped ${skippedCount} duplicates.`);
    });
  } catch (err) {
    console.error(`Failed to parse ${filePath}:`, err);
    vscode.window.showErrorMessage('❌ Failed to export translations: ' + (err as any).message);
  }
}
