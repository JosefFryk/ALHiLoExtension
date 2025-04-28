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

export async function translateXLIFF(path: string, translateFn: (text: string) => Promise<string>) {
  const raw = fs.readFileSync(path, 'utf-8');
  const json = parseXLIFF(raw);

  const units = json.xliff.file.body['trans-unit'];

  for (const unit of units) {
    // If target exists and has state="needs-translation"
    if (unit.target && unit.target['@_state'] === 'needs-translation') {
      const sourceText = unit.source;
      if (sourceText) {
        const translated = await translateFn(sourceText);

        // Set target correctly
        unit.target = {
          '#text': translated,
          '@_state': 'translated'
        };
      }
    }
  }

  const newXliff = buildXLIFF(json);
  fs.writeFileSync(path, newXliff, 'utf-8');
}