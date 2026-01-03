import * as vscode from 'vscode';

/**
 * Finds the first <trans-unit> with matching <source> and target state="needs-translation"
 * and replaces it with the new translation.
 */
export async function applyFirstTranslation(
  sourceText: string,
  translatedText: string,
  confidence = 0.90,
  translationSource: string = 'aiTranslator'
): Promise<boolean> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return false;

  const document = editor.document;
  const raw = document.getText();
  const needle = normXml(sourceText).toLowerCase();

  let changed = false;
  let alreadyReplaced = false;

  const newText = raw.replace(/<trans-unit\b[^>]*>[\s\S]*?<\/trans-unit>/gi, (unit) => {
    if (alreadyReplaced) return unit;

    const src = captureInner(unit, /<source\b[^>]*>([\s\S]*?)<\/source>/i);
    if (!src || normXml(src).toLowerCase() !== needle) return unit;

    const targetTagRe = /<target\b([^>]*)>([\s\S]*?)<\/target>|<target\b([^>]*)\/>/i;
    const m = unit.match(targetTagRe);
    if (!m) return unit;

    const attrsRaw = (m[1] ?? m[3] ?? '').trim();

    if (!/state\s*=\s*"needs-translation"/i.test(attrsRaw)) return unit;

    let newAttrs = upsertAttr(attrsRaw, 'state', 'translated');
    newAttrs = upsertAttr(newAttrs, 'confidence', to2(confidence));
    newAttrs = upsertAttr(newAttrs, 'translationSource', translationSource);

    const escaped = xmlEscape(translatedText);
    const newTarget = `<target ${newAttrs}>${escaped}</target>`;
    const replacedUnit = unit.replace(targetTagRe, newTarget);

    if (replacedUnit !== unit) {
      changed = true;
      alreadyReplaced = true;
    }
    return replacedUnit;
  });

  if (!changed) return false;

  await editor.edit((eb) => {
    eb.replace(
      new vscode.Range(document.positionAt(0), document.positionAt(raw.length)),
      newText
    );
  });

  return true;
}

/**
 * Returns translations from the currently open file if a <target> exists for the given <source>.
 */
export async function lookupExistingTranslationsInOpenFile(
  sourceText: string
): Promise<Array<{ translated: string; confidence: number; unitId?: string }>> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return [];
  const text = editor.document.getText();
  const needle = normXml(sourceText).toLowerCase();

  const results: Array<{ translated: string; confidence: number; unitId?: string }> = [];
  const seen = new Set<string>();

  const units = text.match(/<trans-unit\b[^>]*>[\s\S]*?<\/trans-unit>/gi) || [];
  for (const unit of units) {
    const src = captureInner(unit, /<source\b[^>]*>([\s\S]*?)<\/source>/i);
    if (!src || normXml(src).toLowerCase() !== needle) continue;

    // only take targets that actually have text (state may be translated or anything else)
    const tgtMatch = unit.match(/<target\b([^>]*)>([\s\S]*?)<\/target>/i);
    if (!tgtMatch) continue;

    const attrsRaw = (tgtMatch[1] ?? '').trim();
    const tgtText = normXml(tgtMatch[2], false);
    if (!tgtText) continue;

    const confMatch = attrsRaw.match(/\bconfidence\s*=\s*"([^"]+)"/i);
    const conf = confMatch ? Number(confMatch[1]) : 0.9;

    const idMatch = unit.match(/<trans-unit\b[^>]*\bid="([^"]+)"/i);
    const unitId = idMatch ? idMatch[1] : undefined;

    const key = tgtText.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({ translated: tgtText, confidence: isFinite(conf) ? conf : 0.9, unitId });
  }

  return results;
}

// Builds an index of translations from the given XLIFF text.
export function buildOpenFileTranslationIndex(text: string): Map<string, { translated: string; confidence: number; unitId?: string }> {
  const index = new Map<string, { translated: string; confidence: number; unitId?: string }>();

  const unitRe = /<trans-unit\b[^>]*>[\s\S]*?<\/trans-unit>/gi;
  let m: RegExpExecArray | null;

  while ((m = unitRe.exec(text)) !== null) {
    const unit = m[0];

    const src = captureInner(unit, /<source\b[^>]*>([\s\S]*?)<\/source>/i);
    if (!src) continue;

    const tgtMatch = unit.match(/<target\b([^>]*)>([\s\S]*?)<\/target>/i);
    if (!tgtMatch) continue;

    const attrsRaw = (tgtMatch[1] ?? '').trim();
    const tgtText = normXml(tgtMatch[2], false);
    if (!tgtText) continue;

    const confMatch = attrsRaw.match(/\bconfidence\s*=\s*"([^"]+)"/i);
    const conf = confMatch ? Number(confMatch[1]) : 0.9;

    const idMatch = unit.match(/<trans-unit\b[^>]*\bid="([^"]+)"/i);
    const unitId = idMatch ? idMatch[1] : undefined;

    const key = normXml(src).toLowerCase();
    const prev = index.get(key);
    const confSafe = isFinite(conf) ? conf : 0.9;

    // keep the best match (highest confidence)
    if (!prev || confSafe > prev.confidence) {
      index.set(key, { translated: tgtText, confidence: confSafe, unitId });
    }
  }

  return index;
}

// --- NEW: O(1) lookup using the index ---
export function lookupExistingTranslationFromIndex(
  index: Map<string, { translated: string; confidence: number; unitId?: string }>,
  sourceText: string
): { translated: string; confidence: number; unitId?: string } | null {
  const needle = normXml(sourceText).toLowerCase();
  return index.get(needle) ?? null;
}

/* -------- helpers -------- */

function captureInner(haystack: string, re: RegExp): string | null {
  const m = haystack.match(re);
  if (!m) return null;
  return stripCdata(m[1]);
}
function stripCdata(s: string): string {
  const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  return m ? m[1] : s;
}
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
function normXml(s: string, forCompare: boolean = true): string {
  const decoded = decodeXmlEntities(stripCdata(s));
  const collapsed = decoded.replace(/\s+/g, ' ').trim();
  return forCompare ? collapsed : collapsed;
}
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function upsertAttr(attrs: string, name: string, value: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*"[^"]*"`, 'i');
  if (re.test(attrs)) return attrs.replace(re, `${name}="${value}"`);
  return (attrs ? `${attrs} ` : '') + `${name}="${value}"`;
}
function to2(n: number): string {
  return (isFinite(n) ? n : 0).toFixed(2);
}

