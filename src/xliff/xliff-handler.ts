import * as fs from 'fs';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export function parseXLIFF(content: string) {
  const parser = new XMLParser({ ignoreAttributes: false });
  return parser.parse(content);
}

export function buildXLIFF(json: any) {
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true, suppressEmptyNode: true });
  return builder.build(json);
}

export async function translateXLIFF(path: string, translateFn: (text: string) => Promise<{ translated: string; confidence: number }>) {
  const raw = fs.readFileSync(path, 'utf-8');
  const json = parseXLIFF(raw);

  const units = json.xliff.file.body['trans-unit'];

  for (const unit of units) {
    if (unit.target && unit.target['@_state'] === 'needs-translation') {
      const sourceText = unit.source;
      if (sourceText) {
        const { translated, confidence } = await translateFn(sourceText);
  
        unit.target = {
          '#text': translated,
          '@_state': 'translated',
          '@_confidence': confidence.toFixed(2) // store as string with 2 decimals
        };
      }
    }
  }
  const newXliff = buildXLIFF(json);
  fs.writeFileSync(path, newXliff, 'utf-8');
}