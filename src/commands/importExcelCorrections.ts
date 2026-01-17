import * as vscode from 'vscode';
import * as XLSX from 'xlsx';
import { CosmosClient } from '@azure/cosmos';
import { getCosmosConfig, isCosmosConfigured } from '../setup/configurationManager';

// Output channel for logging
let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('HiLo Translate');
  }
  return outputChannel;
}

interface ExcelCorrection {
  excelRow: number;
  element: string;
  sourceEn: string;
  currentTranslation: string;
  translationSource: string;
  activaCorrection: string;
}

// Cosmos DB doesn't allow / or \ in document IDs
function sanitizeCosmosId(id: string): string {
  return id.replace(/[/\\]/g, '|');
}

export async function importExcelCorrections() {
  // Check if Cosmos DB is configured
  const isConfigured = await isCosmosConfigured();
  if (!isConfigured) {
    const action = await vscode.window.showErrorMessage(
      'Cosmos DB is not configured. Please run setup first.',
      'Setup Now'
    );
    if (action === 'Setup Now') {
      await vscode.commands.executeCommand('hiloTranslator.setup');
    }
    return;
  }

  // Open file picker for Excel file
  const fileUri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'Excel Files': ['xlsx', 'xls']
    },
    openLabel: 'Select Excel file with corrections'
  });

  if (!fileUri || fileUri.length === 0) {
    return;
  }

  const filePath = fileUri[0].fsPath;

  try {
    // Read Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON array (skip header row)
    const rawData: (string | undefined)[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: undefined
    });

    if (rawData.length < 2) {
      vscode.window.showWarningMessage('Excel file appears to be empty or has no data rows.');
      return;
    }

    // Parse corrections (skip header row)
    const corrections: ExcelCorrection[] = [];
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const activaCorrection = row[4]?.toString().trim();

      // Only include rows with corrections in column 5
      if (activaCorrection) {
        corrections.push({
          excelRow: i + 1, // Excel rows are 1-indexed, +1 for header
          element: row[0]?.toString().trim() || '',
          sourceEn: row[1]?.toString().trim() || '',
          currentTranslation: row[2]?.toString().trim() || '',
          translationSource: row[3]?.toString().trim() || '',
          activaCorrection
        });
      }
    }

    if (corrections.length === 0) {
      vscode.window.showWarningMessage('No corrections found in column 5 (Překlad ACTIVA).');
      return;
    }

    // Confirm with user
    const confirm = await vscode.window.showInformationMessage(
      `Found ${corrections.length} corrections. Import to Cosmos DB "corrections/activa_correction_excel"?`,
      'Import',
      'Cancel'
    );

    if (confirm !== 'Import') {
      return;
    }

    // Get Cosmos config
    const cosmosConfig = await getCosmosConfig();
    if (!cosmosConfig) {
      vscode.window.showErrorMessage('Failed to retrieve Cosmos DB configuration.');
      return;
    }

    // Connect to Cosmos DB
    const client = new CosmosClient({ endpoint: cosmosConfig.endpoint, key: cosmosConfig.key });
    const dbResponse = await client.databases.createIfNotExists({ id: 'corrections' });
    const db = dbResponse.database;

    const containerDef = {
      id: 'activa_correction_excel',
      partitionKey: {
        paths: ['/source']
      }
    };

    const { container } = await db.containers.createIfNotExists(containerDef);

    // Import with progress
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Importing Excel corrections to Cosmos DB...',
      cancellable: false
    }, async (progress) => {
      let successCount = 0;
      let errorCount = 0;
      const failedRows: { excelRow: number; element: string; error: string }[] = [];
      const total = corrections.length;

      for (let i = 0; i < corrections.length; i++) {
        const correction = corrections[i];

        try {
          const item = {
            id: sanitizeCosmosId(correction.element),
            source: correction.sourceEn,
            target: correction.activaCorrection,
            sourceLang: 'en',
            targetLang: 'cs-CZ',
            confidence: 1.0,
            sourceDatabase: 'activa_correction_excel',
            translationType: 'UserCorrection',
            timestamp: new Date().toISOString()
          };

          // Upsert (overwrite if exists)
          await container.items.upsert(item);
          successCount++;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          failedRows.push({
            excelRow: correction.excelRow,
            element: correction.element,
            error: errorMessage
          });
          errorCount++;
        }

        progress.report({
          increment: (100 / total),
          message: `${i + 1}/${total}`
        });
      }

      // Log failed rows to output channel
      if (failedRows.length > 0) {
        const channel = getOutputChannel();
        channel.appendLine('=== FAILED IMPORTS ===');
        for (const failed of failedRows) {
          channel.appendLine(`Row ${failed.excelRow}: ${failed.element}`);
          channel.appendLine(`  Error: ${failed.error}`);
        }
        channel.appendLine('======================');
        channel.show(); // Show the output channel
      }

      if (errorCount > 0) {
        vscode.window.showWarningMessage(
          `Imported ${successCount} corrections. ${errorCount} failed. See Output > "HiLo Translate" for details.`
        );
      } else {
        vscode.window.showInformationMessage(
          `Successfully imported ${successCount} corrections to Cosmos DB.`
        );
      }
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const channel = getOutputChannel();
    channel.appendLine(`Failed to import Excel corrections: ${errorMessage}`);
    channel.show();
    vscode.window.showErrorMessage('Failed to import corrections: ' + errorMessage);
  }
}


// upravit kdyz preklad obsahuje lomitko
