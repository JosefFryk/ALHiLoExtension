/**
 * XLIFF Candidate Matcher
 * Finds matching XLIFF trans-units based on BC captured element context
 */

// Property ID constants from XLIFF
export const PROPERTY_CAPTION = '2879900210';
export const PROPERTY_TOOLTIP = '1295455071';

export interface ElementContext {
  elementType: string;     // Field, Action, Control, Column, Tab, Cue
  propertyType: string;    // Caption, ToolTip
  uiArea: string;          // ActionBar, ContentArea, List, FactBox, etc.
  pageId?: number;
}

export interface XliffCandidate {
  unitId: string;          // Full trans-unit ID
  source: string;          // Source text
  target: string;          // Target (translated) text
  objectType: string;      // Table, Page, TableExtension, PageExtension, Codeunit, etc.
  objectId: string;        // Object ID/hash
  elementType?: string;    // Field, Control, Action, NamedType
  elementId?: string;      // Element ID/hash
  propertyId: string;      // 2879900210 (Caption) or 1295455071 (ToolTip)
  note?: string;           // Developer note with readable names
  confidence: number;      // Match confidence score
  matchSource?: string;    // Which DOM text field matched (translatedText, innerText, etc.)
  matchedText?: string;    // Raw text that was matched
}

export interface DomMatchContext extends ElementContext {
  translatedText?: string;
  innerText?: string;
  titleAttribute?: string;
  ariaLabel?: string;
  placeholder?: string;
  htmlTag?: string;
  ariaRole?: string;
  dataAttributes?: string;
  isToolTip?: boolean;
}

interface TextCandidate {
  text: string;
  normalized: string;
  weight: number;
  source: string;
}

/**
 * Parse XLIFF trans-unit ID into components
 * Examples:
 *   "Table 2599318640 - Property 2879900210"
 *   "Page 501793530 - Control 188556375 - Property 1295455071"
 *   "TableExtension 1994964448 - Field 4142376596 - Property 2879900210"
 */
export function parseTransUnitId(id: string): {
  objectType: string;
  objectId: string;
  elementType?: string;
  elementId?: string;
  propertyId: string;
} | null {
  // Pattern: ObjectType ObjectId [- ElementType ElementId] - Property PropertyId
  const fullPattern = /^(\w+)\s+(\d+)\s+-\s+(\w+)\s+(\d+)\s+-\s+Property\s+(\d+)$/;
  const simplePattern = /^(\w+)\s+(\d+)\s+-\s+Property\s+(\d+)$/;

  let match = id.match(fullPattern);
  if (match) {
    return {
      objectType: match[1],
      objectId: match[2],
      elementType: match[3],
      elementId: match[4],
      propertyId: match[5]
    };
  }

  match = id.match(simplePattern);
  if (match) {
    return {
      objectType: match[1],
      objectId: match[2],
      propertyId: match[3]
    };
  }

  return null;
}

/**
 * Find all XLIFF candidates matching the given target text and element context
 */
export function findXliffCandidates(
  xliffContent: string,
  targetText: string,
  context: ElementContext
): XliffCandidate[] {
  if (!targetText) return [];

  const textCandidates = collectTextCandidates([
    { text: targetText, weight: 1.0, source: 'targetText' }
  ]);

  return findXliffCandidatesInternal(xliffContent, textCandidates, context);
}

/**
 * Find XLIFF candidates using DOM-derived text fields.
 */
export function findXliffCandidatesFromDom(
  xliffContent: string,
  context: DomMatchContext
): XliffCandidate[] {
  const textCandidates = collectTextCandidates([
    { text: context.translatedText, weight: 1.0, source: 'translatedText' },
    { text: context.innerText, weight: 0.9, source: 'innerText' },
    { text: context.titleAttribute, weight: 0.8, source: 'titleAttribute' },
    { text: context.ariaLabel, weight: 0.8, source: 'ariaLabel' },
    { text: context.placeholder, weight: 0.7, source: 'placeholder' }
  ]);

  if (!textCandidates.length) return [];

  return findXliffCandidatesInternal(xliffContent, textCandidates, context);
}

/**
 * Check if XLIFF element type matches BC element type
 */
function matchesElementType(xliffType: string | undefined, bcType: string): boolean {
  if (!xliffType) return false;

  const xliffLower = xliffType.toLowerCase();
  const bcLower = bcType.toLowerCase();

  // Direct match
  if (xliffLower === bcLower) return true;

  // XLIFF "Control" can match BC "Field" (page controls are often fields)
  if (xliffLower === 'control' && bcLower === 'field') return true;
  if (xliffLower === 'field' && bcLower === 'field') return true;

  // XLIFF "Action" matches BC "Action"
  if (xliffLower === 'action' && bcLower === 'action') return true;

  // Column matching
  if (xliffLower === 'column' && bcLower === 'column') return true;
  if (xliffLower === 'control' && bcLower === 'column') return true;

  return false;
}

/**
 * Get property name from ID
 */
export function getPropertyName(propertyId: string): string {
  switch (propertyId) {
    case PROPERTY_CAPTION: return 'Caption';
    case PROPERTY_TOOLTIP: return 'ToolTip';
    default: return `Property ${propertyId}`;
  }
}

/**
 * Format candidate for display
 */
export function formatCandidate(candidate: XliffCandidate): string {
  const property = getPropertyName(candidate.propertyId);
  const element = candidate.elementType ? `${candidate.elementType} ${candidate.elementId}` : '';
  return `${candidate.objectType} ${candidate.objectId}${element ? ' - ' + element : ''} - ${property} (${(candidate.confidence * 100).toFixed(0)}%)`;
}

// --- Helpers ---

function normalizeText(s: string): string {
  const raw = decodeXmlEntities(s ?? '');
  const noTags = raw.replace(/<[^>]+>/g, ' ');
  const noHotkeys = noTags.replace(/&(?=\w)/g, '');
  return noHotkeys.replace(/\s+/g, ' ').trim().toLowerCase();
}

function decodeXmlEntities(s: string): string {
  const text = String(s ?? '');
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function findXliffCandidatesInternal(
  xliffContent: string,
  textCandidates: TextCandidate[],
  context: ElementContext & Partial<DomMatchContext>
): XliffCandidate[] {
  const candidates: XliffCandidate[] = [];
  const candidateMap = new Map<string, XliffCandidate>();

  const expectedPropertyId = getExpectedPropertyId(context);
  const contextElementTypes = getContextElementTypes(context);
  const targetLookup = new Map<string, TextCandidate>();

  for (const c of textCandidates) {
    targetLookup.set(c.normalized, c);
  }

  const unitRe = /<trans-unit\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<\/trans-unit>/gi;
  let match: RegExpExecArray | null;

  while ((match = unitRe.exec(xliffContent)) !== null) {
    const unit = match[0];
    const unitId = match[1];

    const targetMatch = unit.match(/<target\b[^>]*>([\s\S]*?)<\/target>/i);
    if (!targetMatch) continue;

    const unitTarget = normalizeText(targetMatch[1]);
    const textCandidate = targetLookup.get(unitTarget);
    if (!textCandidate) continue;

    const parsed = parseTransUnitId(unitId);
    if (!parsed) {
      continue;
    }

    if (expectedPropertyId && parsed.propertyId !== expectedPropertyId) {
      continue;
    }

    const sourceMatch = unit.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceMatch ? decodeXmlEntities(sourceMatch[1]) : '';

    const noteMatch = unit.match(/<note\b[^>]*from="Xliff Generator"[^>]*>([\s\S]*?)<\/note>/i);
    const note = noteMatch ? noteMatch[1].trim() : '';

    let confidence = 0.5 + (textCandidate.weight * 0.1);

    if (expectedPropertyId && parsed.propertyId === expectedPropertyId) {
      confidence += 0.2;
    }

    if (parsed.elementType && contextElementTypes.length > 0) {
      if (matchesAnyElementType(parsed.elementType, contextElementTypes)) {
        confidence += 0.15;
      }
    }

    if (context.uiArea === 'ActionBar' && parsed.elementType === 'Action') {
      confidence += 0.05;
    }
    if (context.uiArea === 'List' && parsed.elementType === 'Column') {
      confidence += 0.05;
    }
    if ((context.uiArea === 'ContentArea' || context.uiArea === 'Group' || context.uiArea === 'FieldGroup') &&
        (parsed.elementType === 'Field' || parsed.elementType === 'Control')) {
      confidence += 0.05;
    }
    if (context.ariaRole === 'columnheader' && parsed.elementType === 'Column') {
      confidence += 0.05;
    }
    if (context.htmlTag === 'button' && parsed.elementType === 'Action') {
      confidence += 0.05;
    }
    if (context.htmlTag === 'input' && (parsed.elementType === 'Field' || parsed.elementType === 'Control')) {
      confidence += 0.05;
    }

    const candidate: XliffCandidate = {
      unitId,
      source,
      target: unitTarget,
      objectType: parsed.objectType,
      objectId: parsed.objectId,
      elementType: parsed.elementType,
      elementId: parsed.elementId,
      propertyId: parsed.propertyId,
      note,
      confidence: Math.min(1.0, confidence),
      matchSource: textCandidate.source,
      matchedText: textCandidate.text
    };

    const existing = candidateMap.get(unitId);
    if (!existing || existing.confidence < candidate.confidence) {
      candidateMap.set(unitId, candidate);
    }
  }

  for (const c of candidateMap.values()) {
    candidates.push(c);
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

function matchesAnyElementType(xliffType: string, bcTypes: string[]): boolean {
  for (const bcType of bcTypes) {
    if (matchesElementType(xliffType, bcType)) return true;
  }
  return false;
}

function getExpectedPropertyId(context: ElementContext & Partial<DomMatchContext>): string | null {
  if (typeof context.isToolTip === 'boolean') {
    return context.isToolTip ? PROPERTY_TOOLTIP : PROPERTY_CAPTION;
  }

  const prop = (context.propertyType ?? '').toString().trim().toLowerCase();
  if (prop === 'tooltip') return PROPERTY_TOOLTIP;
  if (prop === 'caption') return PROPERTY_CAPTION;
  return null;
}

function getContextElementTypes(context: ElementContext & Partial<DomMatchContext>): string[] {
  const types = new Set<string>();

  if (context.elementType) {
    types.add(context.elementType);
  }

  if (context.uiArea === 'ActionBar') types.add('Action');
  if (context.uiArea === 'List') types.add('Column');
  if (context.uiArea === 'ContentArea' || context.uiArea === 'Group' || context.uiArea === 'FieldGroup') {
    types.add('Field');
    types.add('Control');
  }

  if (context.htmlTag) {
    const tag = context.htmlTag.toLowerCase();
    if (tag === 'button') types.add('Action');
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      types.add('Field');
      types.add('Control');
    }
  }

  if (context.ariaRole) {
    const role = context.ariaRole.toLowerCase();
    if (role === 'columnheader') types.add('Column');
    if (role === 'button') types.add('Action');
  }

  const flags = parseContextFlags(context.dataAttributes);
  if (flags) {
    if (flags.inActionBar) types.add('Action');
    if (flags.inGrid) types.add('Column');
    if (flags.inFieldGroup || flags.inContentArea) {
      types.add('Field');
      types.add('Control');
    }
  }

  return Array.from(types);
}

function parseContextFlags(dataAttributes?: string): {
  inActionBar?: boolean;
  inGrid?: boolean;
  inFieldGroup?: boolean;
  inContentArea?: boolean;
} | null {
  if (!dataAttributes) return null;
  try {
    const parsed = JSON.parse(dataAttributes);
    const flags = parsed?._contextFlags;
    if (!flags || typeof flags !== 'object') return null;
    return {
      inActionBar: Boolean(flags.inActionBar),
      inGrid: Boolean(flags.inGrid),
      inFieldGroup: Boolean(flags.inFieldGroup),
      inContentArea: Boolean(flags.inContentArea)
    };
  } catch {
    return null;
  }
}

function collectTextCandidates(entries: Array<{ text?: string; weight: number; source: string }>): TextCandidate[] {
  const map = new Map<string, TextCandidate>();
  for (const entry of entries) {
    const raw = String(entry.text ?? '').trim();
    if (!raw) continue;
    const normalized = normalizeText(raw);
    if (!normalized) continue;
    const existing = map.get(normalized);
    if (!existing || entry.weight > existing.weight) {
      map.set(normalized, {
        text: raw,
        normalized,
        weight: entry.weight,
        source: entry.source
      });
    }
  }
  return Array.from(map.values());
}
