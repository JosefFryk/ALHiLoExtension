import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import axios from 'axios';

function buildBlobUrl(uploadUrl: string, fileName: string): string {
  const [baseUrl, sasParams] = uploadUrl.split('?');
  if (!baseUrl || !sasParams) {
    throw new Error('Invalid Azure upload URL. Must include ? and SAS token.');
  }
  return `${baseUrl.replace(/\/$/, '')}/${fileName}?${sasParams}`;
}

export async function exportTranslationDictionary() {
  const fileUri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    openLabel: 'Select a translated .xliff file'
  });

  if (!fileUri || fileUri.length === 0) return;

  const filePath = fileUri[0].fsPath;
  const parser = new XMLParser({ ignoreAttributes: false });
  const translationMap = new Map<string, string>();

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const json = parser.parse(raw);

    let units = json?.xliff?.file?.body?.['trans-unit'];

    // Fallback to nested group if needed
    if (!units && json?.xliff?.file?.body?.group?.['trans-unit']) {
      units = json.xliff.file.body.group['trans-unit'];
    }

    const unitArray = Array.isArray(units) ? units : units ? [units] : [];

    if (unitArray.length === 0) {
      vscode.window.showWarningMessage('No translation units found in the selected file.');
      return;
    }

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
        translationMap.set(source, target);
      }
    }

    const outputFileName = path.parse(filePath).name + '.json';
    const outputFolder = path.dirname(filePath);
    const outputPath = path.join(outputFolder, outputFileName);

    const resultObj: Record<string, string> = {};
    for (const [source, target] of translationMap.entries()) {
      resultObj[source] = target;
    }

    fs.writeFileSync(outputPath, JSON.stringify(resultObj, null, 2), 'utf-8');
    vscode.window.showInformationMessage(`✅ Exported ${translationMap.size} translations to ${outputFileName}`);

    const config = vscode.workspace.getConfiguration();
    const uploadUrl = config.get<string>('hiloTranslate.uploadUrl');
    const enableUpload = config.get<boolean>('hiloTranslate.enableUpload', true);

    if (enableUpload && uploadUrl) {
      const shouldUpload = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: `Upload ${outputFileName} to Azure Blob Storage and overwrite if exists?`
      });

      if (shouldUpload === 'Yes') {
        try {
          const blobUrl = buildBlobUrl(uploadUrl, outputFileName);
          const content = fs.readFileSync(outputPath);
          const res = await axios.put(blobUrl, content, {
            headers: {
              'x-ms-blob-type': 'BlockBlob',
              'Content-Type': 'application/json'
            }
          });

          if (res.status >= 200 && res.status < 300) {
            vscode.window.showInformationMessage(`✅ Uploaded ${outputFileName} to Azure Blob Storage.`);
          } else {
            vscode.window.showErrorMessage(`❌ Upload failed with status ${res.status}`);
          }
        } catch (err: any) {
          vscode.window.showErrorMessage('❌ Failed to upload: ' + (err.response?.data?.message || err.message));
        }
      }
    }
  } catch (err) {
    console.error(`Failed to parse ${filePath}:`, err);
    vscode.window.showErrorMessage('❌ Failed to export translations: ' + (err as any).message);
  }
}
