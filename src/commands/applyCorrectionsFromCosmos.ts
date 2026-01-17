import * as vscode from 'vscode';
import * as fs from 'fs';
import { CosmosClient } from '@azure/cosmos';
import { getCosmosConfig, isCosmosConfigured } from '../setup/configurationManager';
import { findXliffCandidatesFromDom, DomMatchContext } from '../xliff/xliffMatcher';
import { xmlEscape, xmlUnescape } from '../utils/stringUtils';

interface CorrectionItem {
  id?: string;
  source?: string;
  target?: string;
  elementContext?: unknown;
  translationType?: string;
}

interface UpdateStats {
  updated: number;
  unchanged: number;
  unmatched: number;
  conflicts: number;
  skipped: number;
}

export async function applyCorrectionsFromCosmos() {
  const client = await getCosmosClient();
  if (!client) return;

  const xliffPath = await pickXliffFile();
  if (!xliffPath) return;

  const dbId = await pickDatabase(client);
  if (!dbId) return;

  const containerId = await pickContainer(client, dbId);
  if (!containerId) return;

  const filterChoice = await vscode.window.showQuickPick(
    ['UserCorrection only', 'All items'],
    { placeHolder: 'Select correction filter' }
  );
  if (!filterChoice) return;

  const container = client.database(dbId).container(containerId);
  const query = buildQuery(filterChoice);

  let resources: CorrectionItem[] = [];
  try {
    const response = await container.items.query<CorrectionItem>(query).fetchAll();
    resources = response.resources || [];
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to read corrections: ${errorMessage}`);
    return;
  }

  if (resources.length === 0) {
    vscode.window.showInformationMessage('No corrections found in the selected container.');
    return;
  }

  const xliffContent = fs.readFileSync(xliffPath, 'utf8');
  const updates = new Map<string, { translated: string; source: string }>();

  const stats: UpdateStats = {
    updated: 0,
    unchanged: 0,
    unmatched: 0,
    conflicts: 0,
    skipped: 0
  };

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Applying corrections from Cosmos DB...',
      cancellable: false
    },
    async (progress) => {
      const total = resources.length;
      let processed = 0;

      for (const item of resources) {
        processed++;
        progress.report({ increment: 100 / total, message: `${processed}/${total}` });

        const source = toText(item.source);
        const target = toText(item.target);
        if (!source || !target) {
          stats.skipped++;
          continue;
        }

        const ctx = buildDomContext(item, source);
        const candidates = findXliffCandidatesFromDom(xliffContent, ctx);
        if (!candidates.length) {
          stats.unmatched++;
          continue;
        }

        for (const candidate of candidates) {
          const existing = updates.get(candidate.unitId);
          if (existing && existing.translated !== target) {
            stats.conflicts++;
            continue;
          }
          updates.set(candidate.unitId, { translated: target, source });
        }
      }
    }
  );

  if (updates.size === 0) {
    vscode.window.showInformationMessage('No matching XLIFF units found for the corrections.');
    return;
  }

  const result = applyUpdatesToXliff(xliffContent, updates);
  stats.updated = result.updated;
  stats.unchanged = result.unchanged;

  if (result.updated === 0) {
    vscode.window.showInformationMessage('All matching translations already match the corrected text.');
    return;
  }

  fs.writeFileSync(xliffPath, result.text, 'utf8');

  vscode.window.showInformationMessage(
    `Applied ${stats.updated} updates (${stats.unchanged} unchanged, ${stats.unmatched} unmatched, ` +
    `${stats.conflicts} conflicts, ${stats.skipped} skipped).`
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

async function pickDatabase(client: CosmosClient): Promise<string | null> {
  try {
    const response = await client.databases.readAll().fetchAll();
    const dbs = response.resources.map(db => db.id).filter(Boolean);
    if (dbs.length === 0) return null;
    const pick = await vscode.window.showQuickPick(dbs, { placeHolder: 'Select Cosmos DB database' });
    return pick ?? null;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const manual = await vscode.window.showInputBox({
      prompt: `Failed to list databases (${errorMessage}). Enter database name manually`,
      ignoreFocusOut: true
    });
    return manual ?? null;
  }
}

async function pickContainer(client: CosmosClient, dbId: string): Promise<string | null> {
  try {
    const response = await client.database(dbId).containers.readAll().fetchAll();
    const containers = response.resources.map(c => c.id).filter(Boolean);
    if (containers.length === 0) return null;
    const pick = await vscode.window.showQuickPick(containers, { placeHolder: 'Select Cosmos DB container' });
    return pick ?? null;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const manual = await vscode.window.showInputBox({
      prompt: `Failed to list containers (${errorMessage}). Enter container name manually`,
      ignoreFocusOut: true
    });
    return manual ?? null;
  }
}

function buildQuery(choice: string) {
  if (choice === 'UserCorrection only') {
    return {
      query: `SELECT c.id, c.source, c.target, c.elementContext, c.translationType
              FROM c
              WHERE IS_DEFINED(c.target)
                AND c.target != ""
                AND c.translationType = @type`,
      parameters: [{ name: '@type', value: 'UserCorrection' }]
    };
  }

  return {
    query: `SELECT c.id, c.source, c.target, c.elementContext, c.translationType
            FROM c
            WHERE IS_DEFINED(c.target) AND c.target != ""`
  };
}

function buildDomContext(item: CorrectionItem, source: string): DomMatchContext {
  let ctx: any = {};
  if (item.elementContext && typeof item.elementContext === 'object') {
    ctx = item.elementContext;
  } else if (typeof item.elementContext === 'string') {
    try {
      ctx = JSON.parse(item.elementContext);
    } catch {
      ctx = {};
    }
  }

  const isToolTipRaw = (ctx as { isToolTip?: unknown }).isToolTip;
  const isToolTip = typeof isToolTipRaw === 'boolean'
    ? isToolTipRaw
    : String(isToolTipRaw ?? '').toLowerCase() === 'true';

  const dataAttributes = normalizeDataAttributes(ctx.dataAttributes);

  return {
    elementType: toText(ctx.elementType),
    propertyType: toText(ctx.propertyType),
    uiArea: toText(ctx.uiArea),
    htmlTag: toText(ctx.htmlTag),
    ariaRole: toText(ctx.ariaRole),
    ariaLabel: toText(ctx.ariaLabel),
    titleAttribute: toText(ctx.titleAttribute),
    innerText: toText(ctx.innerText),
    placeholder: toText(ctx.placeholder),
    dataAttributes,
    isToolTip,
    translatedText: source
  };
}

function normalizeDataAttributes(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function applyUpdatesToXliff(
  content: string,
  updates: Map<string, { translated: string }>
): { text: string; updated: number; unchanged: number } {
  let updated = 0;
  let unchanged = 0;

  const unitRe = /<trans-unit\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<\/trans-unit>/gi;
  const text = content.replace(unitRe, (unit, unitId) => {
    const update = updates.get(unitId);
    if (!update) return unit;

    const replaced = updateUnitTarget(unit, update.translated);
    if (replaced === unit) {
      unchanged++;
    } else {
      updated++;
    }
    return replaced;
  });

  return { text, updated, unchanged };
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
      return unit;
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

function normalizeForCompare(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}
