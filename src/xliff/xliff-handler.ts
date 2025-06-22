import * as fs from 'fs';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import * as vscode from 'vscode';

export function parseXLIFF(content: string) {
  const parser = new XMLParser({ ignoreAttributes: false });
  return parser.parse(content);
}

export function buildXLIFF(json: any) {
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true, suppressEmptyNode: true });
  return builder.build(json);
}

export async function translateXLIFF(
  path: string,
  translateFn: (text: string) => Promise<{ translated: string; confidence: number; source: string }>,
  progress?: vscode.Progress<{ message?: string; increment?: number }>
) {
  const raw = fs.readFileSync(path, 'utf-8');
  const json = parseXLIFF(raw);

  const fileNode = Array.isArray(json.xliff.file) ? json.xliff.file[0] : json.xliff.file;
  const groupNode = fileNode?.body?.group;

  const unitsRaw = groupNode?.['trans-unit'];
  const units = Array.isArray(unitsRaw) ? unitsRaw : unitsRaw ? [unitsRaw] : [];

  if (units.length === 0) {
    vscode.window.showWarningMessage('⚠️ No valid <trans-unit> elements found. Skipping translation.');
    return;
  }

  let translatedCount = 0;
  const total = units.length;
  let processed = 0;

  for (const unit of units) {
    const sourceText = unit.source;

    if (!sourceText || (typeof sourceText === 'string' && sourceText.trim() === '')) {
      continue;
    }

    if (unit.target && unit.target['@_state'] === 'needs-translation') {
      const { translated, confidence, source } = await translateFn(sourceText);

      unit.target = {
        '#text': translated,
        '@_state': 'translated',
        '@_confidence': confidence.toFixed(2),
        '@_translationSource': source
      };

      translatedCount++;
    }

    processed++;
    if (progress) {
      progress.report({
        increment: 100 / total,
        message: `${processed}/${total} translated`
      });
    }
  }

  const newXliff = buildXLIFF(json);
  fs.writeFileSync(path, newXliff, 'utf-8');

  vscode.window.showInformationMessage(`✅ Translation complete: ${translatedCount} unit(s) translated.`);
}