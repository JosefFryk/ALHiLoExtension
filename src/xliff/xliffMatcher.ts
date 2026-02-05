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

export interface MatchDiagnostics {
  searchedText: string;
  normalizedSearchText: string;
  textMatchCount: number;
  propertyFilteredCount: number;
  pageTableFilteredCount: number;
  finalMatchCount: number;
  sampleTextMatches: string[];  // First few notes of text-matched trans-units
  filterReason?: string;
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
  pageName?: string;
  pageId?: number;
  sourceTableId?: number;
  tableName?: string;
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
  const result = findXliffCandidatesFromDomWithDiagnostics(xliffContent, context);
  return result.candidates;
}

/**
 * Find XLIFF candidates with diagnostic information for debugging.
 */
export function findXliffCandidatesFromDomWithDiagnostics(
  xliffContent: string,
  context: DomMatchContext
): { candidates: XliffCandidate[]; diagnostics: MatchDiagnostics } {
  const textCandidates = collectTextCandidates([
    { text: context.translatedText, weight: 1.0, source: 'translatedText' },
    { text: context.innerText, weight: 0.9, source: 'innerText' },
    { text: context.titleAttribute, weight: 0.8, source: 'titleAttribute' },
    { text: context.ariaLabel, weight: 0.8, source: 'ariaLabel' },
    { text: context.placeholder, weight: 0.7, source: 'placeholder' }
  ]);

  const searchedText = context.translatedText || context.innerText || '';
  const normalizedSearchText = textCandidates.length > 0 ? textCandidates[0].normalized : '';

  if (!textCandidates.length) {
    return {
      candidates: [],
      diagnostics: {
        searchedText,
        normalizedSearchText: '',
        textMatchCount: 0,
        propertyFilteredCount: 0,
        pageTableFilteredCount: 0,
        finalMatchCount: 0,
        sampleTextMatches: [],
        filterReason: 'No text to search for'
      }
    };
  }

  return findXliffCandidatesInternalWithDiagnostics(xliffContent, textCandidates, context);
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

  // Column matching - columns can come from:
  // 1. Page Controls (Page X - Control Y)
  // 2. Table Fields (Table X - Field Y) - list pages inherit captions from source table
  if (bcLower === 'column') {
    if (xliffLower === 'column') return true;
    if (xliffLower === 'control') return true;
    if (xliffLower === 'field') return true;  // Table fields for list page columns
  }

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

    // Column matching: List page columns often inherit captions from Table fields
    // Give bonus confidence when BC elementType is Column and XLIFF is Table-Field
    const bcElementType = (context.elementType || '').toLowerCase();
    if (bcElementType === 'column') {
      const objType = parsed.objectType.toLowerCase();
      // Table or TableExtension fields are likely sources for list column captions
      if ((objType === 'table' || objType === 'tableextension') && parsed.elementType === 'Field') {
        confidence += 0.15;  // Strong bonus for Table Field matching Column
      }
      // Page Controls are also valid for columns (explicit caption override)
      if ((objType === 'page' || objType === 'pageextension') && parsed.elementType === 'Control') {
        confidence += 0.10;  // Moderate bonus for Page Control matching Column
      }
    }

    // Page/Table matching: FILTER to only match trans-units from the same page or its source table
    // Notes look like: "Page E-shop Setup List - Control BonusCode - Property Caption"
    // Or: "Table ItemParameterTemplate - Field Code - Property Caption"
    if ((context.pageName || context.tableName) && note) {
      const noteLower = note.toLowerCase();

      let isPageMatch = false;
      let isTableMatch = false;

      // Check page match if pageName is available
      if (context.pageName) {
        const pageNameLower = context.pageName.toLowerCase();
        isPageMatch = noteLower.startsWith(`page ${pageNameLower} -`) ||
                      noteLower.startsWith(`pageextension ${pageNameLower} -`);
      }

      // Check table match - prefer actual tableName from Cosmos if available
      if (context.tableName) {
        const tableNameLower = context.tableName.toLowerCase();
        // Try exact match first
        isTableMatch = noteLower.startsWith(`table ${tableNameLower} -`) ||
                       noteLower.startsWith(`tableextension ${tableNameLower} -`);

        // If no exact match, try extracting table name from note and comparing
        if (!isTableMatch) {
          const noteTableMatch = noteLower.match(/^(table|tableextension)\s+(.+?)\s+-\s+/);
          if (noteTableMatch) {
            const noteTableName = noteTableMatch[2];
            // Compare normalized versions (remove special chars, compare)
            const normalizedContext = tableNameLower.replace(/[^a-z0-9]/g, '');
            const normalizedNote = noteTableName.replace(/[^a-z0-9]/g, '');
            isTableMatch = normalizedContext === normalizedNote;
          }
        }
      } else if (context.pageName) {
        // Fallback: derive table name from page name
        const possibleTableName = deriveTableNameFromPage(context.pageName.toLowerCase());
        if (possibleTableName) {
          isTableMatch = noteLower.startsWith(`table ${possibleTableName} -`) ||
                         noteLower.startsWith(`tableextension ${possibleTableName} -`);
        }
      }

      // FILTER: Skip trans-units that don't match the page or its table
      if (!isPageMatch && !isTableMatch) {
        continue;  // Skip this trans-unit entirely
      }

      // Store match type for later priority filtering
      // Page matches get higher confidence (priority over table)
      if (isPageMatch) {
        confidence += 0.35;  // Higher confidence for page matches (priority)
      } else if (isTableMatch) {
        confidence += 0.15;  // Lower confidence for table matches (fallback)
      }
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

  // Priority filtering: Page matches take precedence over Table matches
  // If we have any Page/PageExtension matches, filter out Table/TableExtension matches
  const hasPageMatch = candidates.some(c =>
    c.objectType.toLowerCase() === 'page' || c.objectType.toLowerCase() === 'pageextension'
  );

  let finalCandidates = candidates;
  if (hasPageMatch) {
    finalCandidates = candidates.filter(c =>
      c.objectType.toLowerCase() === 'page' || c.objectType.toLowerCase() === 'pageextension'
    );
  }

  finalCandidates.sort((a, b) => b.confidence - a.confidence);
  return finalCandidates;
}

function findXliffCandidatesInternalWithDiagnostics(
  xliffContent: string,
  textCandidates: TextCandidate[],
  context: ElementContext & Partial<DomMatchContext>
): { candidates: XliffCandidate[]; diagnostics: MatchDiagnostics } {
  const candidates: XliffCandidate[] = [];
  const candidateMap = new Map<string, XliffCandidate>();

  const expectedPropertyId = getExpectedPropertyId(context);
  const contextElementTypes = getContextElementTypes(context);
  const targetLookup = new Map<string, TextCandidate>();

  // Diagnostics tracking
  let textMatchCount = 0;
  let propertyFilteredCount = 0;
  let pageTableFilteredCount = 0;
  const sampleTextMatches: string[] = [];

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

    // Text matched!
    textMatchCount++;

    const parsed = parseTransUnitId(unitId);
    if (!parsed) continue;

    const noteMatch = unit.match(/<note\b[^>]*from="Xliff Generator"[^>]*>([\s\S]*?)<\/note>/i);
    const note = noteMatch ? noteMatch[1].trim() : '';

    // Collect sample text matches for diagnostics (before filtering)
    if (sampleTextMatches.length < 5) {
      sampleTextMatches.push(note || unitId);
    }

    if (expectedPropertyId && parsed.propertyId !== expectedPropertyId) {
      propertyFilteredCount++;
      continue;
    }

    const sourceMatch = unit.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceMatch ? decodeXmlEntities(sourceMatch[1]) : '';

    let confidence = 0.5 + (textCandidate.weight * 0.1);

    if (expectedPropertyId && parsed.propertyId === expectedPropertyId) {
      confidence += 0.2;
    }

    if (parsed.elementType && contextElementTypes.length > 0) {
      if (matchesAnyElementType(parsed.elementType, contextElementTypes)) {
        confidence += 0.15;
      }
    }

    // Page/Table filtering (same logic as original)
    // Priority: Page matches first, then Table matches only if no Page match
    if ((context.pageName || context.tableName) && note) {
      const noteLower = note.toLowerCase();

      let isPageMatch = false;
      let isTableMatch = false;

      if (context.pageName) {
        const pageNameLower = context.pageName.toLowerCase();
        isPageMatch = noteLower.startsWith(`page ${pageNameLower} -`) ||
                      noteLower.startsWith(`pageextension ${pageNameLower} -`);
      }

      if (context.tableName) {
        const tableNameLower = context.tableName.toLowerCase();
        isTableMatch = noteLower.startsWith(`table ${tableNameLower} -`) ||
                       noteLower.startsWith(`tableextension ${tableNameLower} -`);

        if (!isTableMatch) {
          const noteTableMatch = noteLower.match(/^(table|tableextension)\s+(.+?)\s+-\s+/);
          if (noteTableMatch) {
            const noteTableName = noteTableMatch[2];
            const normalizedContext = tableNameLower.replace(/[^a-z0-9]/g, '');
            const normalizedNote = noteTableName.replace(/[^a-z0-9]/g, '');
            isTableMatch = normalizedContext === normalizedNote;
          }
        }
      } else if (context.pageName) {
        const possibleTableName = deriveTableNameFromPage(context.pageName.toLowerCase());
        if (possibleTableName) {
          isTableMatch = noteLower.startsWith(`table ${possibleTableName} -`) ||
                         noteLower.startsWith(`tableextension ${possibleTableName} -`);
        }
      }

      if (!isPageMatch && !isTableMatch) {
        pageTableFilteredCount++;
        continue;
      }

      // Store match type for later priority filtering
      if (isPageMatch) {
        confidence += 0.35;  // Higher confidence for page matches (priority)
      } else if (isTableMatch) {
        confidence += 0.15;  // Lower confidence for table matches (fallback)
      }
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

  // Priority filtering: Page matches take precedence over Table matches
  // If we have any Page/PageExtension matches, filter out Table/TableExtension matches
  const hasPageMatch = candidates.some(c =>
    c.objectType.toLowerCase() === 'page' || c.objectType.toLowerCase() === 'pageextension'
  );

  let finalCandidates = candidates;
  if (hasPageMatch) {
    finalCandidates = candidates.filter(c =>
      c.objectType.toLowerCase() === 'page' || c.objectType.toLowerCase() === 'pageextension'
    );
  }

  finalCandidates.sort((a, b) => b.confidence - a.confidence);

  let filterReason: string | undefined;
  if (textMatchCount === 0) {
    filterReason = 'No trans-units found with matching target text';
  } else if (propertyFilteredCount > 0 && finalCandidates.length === 0) {
    filterReason = `${propertyFilteredCount} trans-units filtered by property type (Caption vs ToolTip)`;
  } else if (pageTableFilteredCount > 0 && finalCandidates.length === 0) {
    filterReason = `${pageTableFilteredCount} trans-units filtered by page/table name mismatch`;
  }

  return {
    candidates: finalCandidates,
    diagnostics: {
      searchedText: textCandidates[0]?.text || '',
      normalizedSearchText: textCandidates[0]?.normalized || '',
      textMatchCount,
      propertyFilteredCount,
      pageTableFilteredCount,
      finalMatchCount: candidates.length,
      sampleTextMatches,
      filterReason
    }
  };
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

    // Column headers on list pages often inherit captions from Table fields
    // So when elementType is Column, also search for Field matches
    if (context.elementType.toLowerCase() === 'column') {
      types.add('Field');    // Table fields
      types.add('Control');  // Page controls (if caption overridden)
    }
  }

  if (context.uiArea === 'ActionBar') types.add('Action');
  if (context.uiArea === 'List') {
    types.add('Column');
    types.add('Field');    // List columns often come from Table fields
    types.add('Control');  // Or Page controls
  }
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
    if (role === 'columnheader') {
      types.add('Column');
      types.add('Field');    // Table fields for list columns
      types.add('Control');  // Page controls
    }
    if (role === 'button') types.add('Action');
  }

  const flags = parseContextFlags(context.dataAttributes);
  if (flags) {
    if (flags.inActionBar) types.add('Action');
    if (flags.inGrid) {
      types.add('Column');
      types.add('Field');    // Grid columns often from Table fields
      types.add('Control');
    }
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

/**
 * Derive possible table name from page name
 * Examples:
 *   "ItemParameterTemplateList" → "itemparametertemplate"
 *   "E-shop Setup List" → "e-shop setup"
 *   "CustomerCard" → "customer"
 *   "VendorCard" → "vendor"
 *   "DeliveryRoute" → "deliveryroute"
 */
function deriveTableNameFromPage(pageNameLower: string): string {
  // Remove common page suffixes
  const suffixes = ['list', 'card', 'subpage', 'subform', 'part', 'factbox', 'setup'];
  let tableName = pageNameLower;

  for (const suffix of suffixes) {
    // Remove suffix if at end (with optional space before)
    const pattern = new RegExp(`\\s*${suffix}$`, 'i');
    tableName = tableName.replace(pattern, '');
  }

  return tableName.trim();
}
