import * as vscode from 'vscode';
import * as fs from 'fs';
import { CosmosClient } from '@azure/cosmos';
import { getCosmosConfig, isCosmosConfigured } from '../setup/configurationManager';
import { xmlEscape, xmlUnescape } from '../utils/stringUtils';

interface CorrectionItem {
  id?: string;
  source?: string;
  target?: string;
}

interface UpdateStats {
  updated: number;
  unchanged: number;
  unmatched: number;
  skipped: number;
}

// Convert sanitized Cosmos ID back to original (| -> /)
function desanitizeCosmosId(id: string): string {
  return id.replace(/\|/g, '/');
}

// Output channel for logging
let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('HiLo Translate');
  }
  return outputChannel;
}

export async function applyExcelCorrections() {
  const client = await getCosmosClient();
  if (!client) return;

  const xliffPath = await pickXliffFile();
  if (!xliffPath) return;

  // Hardcoded to corrections/activa_correction_excel
  const dbId = 'corrections';
  const containerId = 'activa_correction_excel';

  const container = client.database(dbId).container(containerId);

  let resources: CorrectionItem[] = [];
  try {
    const query = {
      query: `SELECT c.id, c.source, c.target
              FROM c
              WHERE IS_DEFINED(c.target) AND c.target != ""`
    };
    const response = await container.items.query<CorrectionItem>(query).fetchAll();
    resources = response.resources || [];
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to read corrections: ${errorMessage}`);
    return;
  }

  if (resources.length === 0) {
    vscode.window.showInformationMessage('No corrections found in activa_correction_excel container.');
    return;
  }

  vscode.window.showInformationMessage(`Found ${resources.length} corrections. Applying to XLIFF...`);

  const xliffContent = fs.readFileSync(xliffPath, 'utf8');

  // Build a map of source (English) -> target (corrected Czech)
  const correctionBySource = new Map<string, string>();
  // Build a map of trans-unit ID -> target (convert | back to /)
  const correctionById = new Map<string, string>();

  for (const item of resources) {
    const source = toText(item.source);
    const target = toText(item.target);
    const id = toText(item.id);

    if (source && target) {
      correctionBySource.set(normalizeForCompare(source), target);
    }
    if (id && target) {
      // Convert | back to / for matching with XLIFF trans-unit IDs
      const originalId = desanitizeCosmosId(id);
      correctionById.set(originalId, target);
    }
  }

  const stats: UpdateStats = {
    updated: 0,
    unchanged: 0,
    unmatched: 0,
    skipped: 0
  };

  const unmatchedSources: string[] = [];
  const unchangedItems: { line: number; source: string }[] = [];

  // Apply corrections by matching ID first, then source text
  const result = applyCorrectionsToXliff(xliffContent, correctionBySource, correctionById, stats, unmatchedSources, unchangedItems);

  if (result.updated === 0) {
    vscode.window.showInformationMessage('No matching translations found or all already match.');
    return;
  }

  fs.writeFileSync(xliffPath, result.text, 'utf8');

  // Always show output channel with summary
  const channel = getOutputChannel();
  channel.appendLine('');
  channel.appendLine('=== APPLY EXCEL CORRECTIONS SUMMARY ===');
  channel.appendLine(`Updated: ${stats.updated}`);
  channel.appendLine(`Unchanged: ${stats.unchanged}`);
  channel.appendLine(`Unmatched: ${stats.unmatched}`);

  // Log unchanged items with file:line links
  if (unchangedItems.length > 0) {
    channel.appendLine('');
    channel.appendLine('--- UNCHANGED (already correct) ---');
    for (const item of unchangedItems.slice(0, 100)) {
      channel.appendLine(`  ${xliffPath}:${item.line}  "${item.source.substring(0, 50)}${item.source.length > 50 ? '...' : ''}"`);
    }
    if (unchangedItems.length > 100) {
      channel.appendLine(`  ... and ${unchangedItems.length - 100} more`);
    }
  }

  // Log unmatched to output channel
  if (unmatchedSources.length > 0) {
    channel.appendLine('');
    channel.appendLine('--- UNMATCHED (source not found in XLIFF) ---');
    for (const src of unmatchedSources.slice(0, 100)) {
      channel.appendLine(`  - "${src.substring(0, 60)}${src.length > 60 ? '...' : ''}"`);
    }
    if (unmatchedSources.length > 100) {
      channel.appendLine(`  ... and ${unmatchedSources.length - 100} more`);
    }
  }

  channel.appendLine('=========================================');
  channel.show();

  vscode.window.showInformationMessage(
    `Applied ${stats.updated} corrections (${stats.unchanged} unchanged, ${stats.unmatched} unmatched). See Output for details.`
  );
}

async function getCosmosClient(): Promise<CosmosClient | null> {
  const isConfigured = await isCosmosConfigured();
  if (!isConfigured) {
    const action = await vscode.window.showErrorMessage(
      'Cosmos DB is not configured. Please run setup first.',
      'Setup Now'
    );
    if (action === 'Setup Now') {
      await vscode.commands.executeCommand('hiloTranslator.setup');
    }
    return null;
  }

  const config = await getCosmosConfig();
  if (!config) {
    vscode.window.showErrorMessage('Failed to retrieve Cosmos DB configuration.');
    return null;
  }

  return new CosmosClient({ endpoint: config.endpoint, key: config.key });
}

async function pickXliffFile(): Promise<string | null> {
  const active = vscode.window.activeTextEditor?.document;
  if (active && (active.fileName.endsWith('.xlf') || active.fileName.endsWith('.xliff'))) {
    const choice = await vscode.window.showQuickPick(
      ['Use active file', 'Choose another file'],
      { placeHolder: 'Select XLIFF file to update' }
    );
    if (!choice) return null;
    if (choice === 'Use active file') return active.fileName;
  }

  const fileUri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    openLabel: 'Select a .xlf/.xliff file'
  });
  if (!fileUri || fileUri.length === 0) return null;
  return fileUri[0].fsPath;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function normalizeForCompare(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function applyCorrectionsToXliff(
  content: string,
  correctionBySource: Map<string, string>,
  correctionById: Map<string, string>,
  stats: UpdateStats,
  unmatchedSources: string[],
  unchangedItems: { line: number; source: string }[]
): { text: string; updated: number } {
  const matchedSources = new Set<string>();
  const matchedIds = new Set<string>();

  const unitRe = /<trans-unit\b[^>]*>[\s\S]*?<\/trans-unit>/gi;

  // Pre-calculate line numbers for each position
  const lineNumbers: number[] = [];
  let lineNum = 1;
  for (let i = 0; i < content.length; i++) {
    lineNumbers[i] = lineNum;
    if (content[i] === '\n') {
      lineNum++;
    }
  }

  const text = content.replace(unitRe, (unit, offset) => {
    // Get line number from offset
    const currentLine = lineNumbers[offset] || 1;

    // Extract trans-unit ID
    const idMatch = unit.match(/<trans-unit\b[^>]*\bid="([^"]+)"/i);
    const unitId = idMatch ? idMatch[1] : '';

    // Extract source text from the unit
    const sourceMatch = unit.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);
    if (!sourceMatch) {
      return unit;
    }

    const sourceText = xmlUnescape(sourceMatch[1] ?? '');
    const normalizedSource = normalizeForCompare(sourceText);

    // Try matching by ID first (| converted back to /)
    let correction = correctionById.get(unitId);
    let matchedBy = '';
    if (correction) {
      matchedIds.add(unitId);
      matchedBy = 'ID';
    } else {
      // Fall back to matching by source text
      correction = correctionBySource.get(normalizedSource);
      if (correction) {
        matchedSources.add(normalizedSource);
        matchedBy = 'source';
      }
    }

    if (!correction) {
      return unit;
    }

    // Update the target
    const replaced = updateUnitTarget(unit, correction);
    if (replaced === unit) {
      // Track unchanged items with line number
      unchangedItems.push({ line: currentLine, source: sourceText });
      stats.unchanged++;
    } else {
      stats.updated++;
    }
    return replaced;
  });

  // Find unmatched corrections (by source text)
  for (const [source] of correctionBySource) {
    if (!matchedSources.has(source) && !matchedIds.has(source)) {
      stats.unmatched++;
      unmatchedSources.push(source);
    }
  }

  return { text, updated: stats.updated };
}

function updateUnitTarget(unit: string, translated: string): string {
  const targetRe = /<target\b[^>]*>([\s\S]*?)<\/target>/i;
  const targetSelfClosingRe = /<target\b[^>]*\/>/i;
  const sourceRe = /<source\b[^>]*>[\s\S]*?<\/source>/i;

  const safeTranslated = xmlEscape(String(translated ?? ''));
  const targetTag = `<target state="translated" confidence="1.00" translationSource="userCorrection">${safeTranslated}</target>`;

  const existingTarget = unit.match(targetRe);
  if (existingTarget) {
    const current = normalizeForCompare(xmlUnescape(existingTarget[1] ?? ''));
    if (current === normalizeForCompare(translated)) {
      return unit; // Already matches
    }
    return unit.replace(targetRe, targetTag);
  }

  if (targetSelfClosingRe.test(unit)) {
    return unit.replace(targetSelfClosingRe, targetTag);
  }

  const indent = detectIndent(unit);
  if (sourceRe.test(unit)) {
    return unit.replace(sourceRe, (match) => `${match}\n${indent}${targetTag}`);
  }

  return unit;
}

function detectIndent(unit: string): string {
  const match = unit.match(/\n(\s*)<source\b/i) || unit.match(/\n(\s*)<target\b/i);
  return match ? match[1] : '    ';
}
