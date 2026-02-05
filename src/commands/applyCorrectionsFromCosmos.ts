import * as vscode from 'vscode';
import * as fs from 'fs';
import { CosmosClient } from '@azure/cosmos';
import { getCosmosConfig, isCosmosConfigured } from '../setup/configurationManager';
import { findXliffCandidatesFromDomWithDiagnostics, DomMatchContext, MatchDiagnostics } from '../xliff/xliffMatcher';
import { xmlEscape, xmlUnescape } from '../utils/stringUtils';

interface CorrectionItem {
  id?: string;
  source?: string;
  target?: string;
  elementContext?: unknown;
  translationType?: string;
  area?: string;
  pageId?: number;
  pageName?: string;
  timestamp?: string;
  sourceTableId?: number;
  tableName?: string;
}

interface SyncRecord {
  id: string;
  xliffFile: string;
  lastSyncTimestamp: string;
  lastSyncBy?: string;
  correctionsApplied?: number;
}

interface UpdateStats {
  updated: number;
  unchanged: number;
  unmatched: number;
  conflicts: number;
  skipped: number;
}

interface ReportItem {
  cosmosId: string;
  source: string;
  target: string;
  area?: string;
  pageName?: string;
  pageId?: number;
  tableName?: string;
  sourceTableId?: number;
  status: 'applied' | 'unchanged' | 'unmatched' | 'conflict' | 'skipped';
  matchedUnits: Array<{
    unitId: string;
    note?: string;
    confidence: number;
    previousTarget?: string;
  }>;
  reason?: string;
  diagnostics?: MatchDiagnostics;
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

  const container = client.database(dbId).container(containerId);

  // Get or create sync container and read last sync timestamp
  const syncContainer = await getOrCreateSyncContainer(client, dbId);
  const xliffFileName = xliffPath.substring(xliffPath.lastIndexOf(xliffPath.includes('/') ? '/' : '\\') + 1);
  const lastSync = await getLastSyncTimestamp(syncContainer, xliffFileName);

  // Ask user: use timestamp filter or fetch all
  let timestampFilter: string | undefined;
  if (lastSync) {
    const syncChoice = await vscode.window.showQuickPick(
      [
        `Only new corrections (since ${formatTimestamp(lastSync.lastSyncTimestamp)})`,
        'All corrections (ignore last sync)'
      ],
      { placeHolder: `Last sync: ${formatTimestamp(lastSync.lastSyncTimestamp)}` }
    );
    if (!syncChoice) return;
    if (syncChoice.startsWith('Only new')) {
      timestampFilter = lastSync.lastSyncTimestamp;
    }
  }

  const filterChoice = await vscode.window.showQuickPick(
    ['UserCorrection only', 'All items'],
    { placeHolder: 'Select correction filter' }
  );
  if (!filterChoice) return;

  const query = buildQuery(filterChoice, undefined, timestampFilter);

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
    const msg = timestampFilter
      ? 'No new corrections found since last sync.'
      : 'No corrections found in the selected container.';
    vscode.window.showInformationMessage(msg);
    return;
  }

  const xliffContent = fs.readFileSync(xliffPath, 'utf8');
  const updates = new Map<string, { translated: string; source: string; cosmosId: string }>();
  const reportItems: ReportItem[] = [];

  const stats: UpdateStats = {
    updated: 0,
    unchanged: 0,
    unmatched: 0,
    conflicts: 0,
    skipped: 0
  };

  // Pre-extract existing targets for the report
  const existingTargets = extractExistingTargets(xliffContent);

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

        const cosmosId = toText(item.id);
        const source = toText(item.source);
        const target = toText(item.target);

        const reportItem: ReportItem = {
          cosmosId,
          source,
          target,
          area: item.area,
          pageName: item.pageName,
          pageId: item.pageId,
          tableName: item.tableName,
          sourceTableId: item.sourceTableId,
          status: 'unmatched',
          matchedUnits: []
        };

        if (!source || !target) {
          stats.skipped++;
          reportItem.status = 'skipped';
          reportItem.reason = !source ? 'Empty source text' : 'Empty target text';
          reportItems.push(reportItem);
          continue;
        }

        const ctx = buildDomContext(item, source);
        // Find ALL matching trans-units - this includes both Table fields and Page controls
        // when the captured element is a Column (list pages often inherit captions from tables)
        const { candidates, diagnostics } = findXliffCandidatesFromDomWithDiagnostics(xliffContent, ctx);
        reportItem.diagnostics = diagnostics;

        if (!candidates.length) {
          stats.unmatched++;
          reportItem.status = 'unmatched';
          reportItem.reason = diagnostics.filterReason || 'No matching XLIFF trans-units found';
          reportItems.push(reportItem);
          continue;
        }

        let hasConflict = false;
        // Apply correction to ALL matching trans-units (e.g., both Table field and Page control)
        for (const candidate of candidates) {
          const existing = updates.get(candidate.unitId);
          if (existing && existing.translated !== target) {
            stats.conflicts++;
            hasConflict = true;
            reportItem.matchedUnits.push({
              unitId: candidate.unitId,
              note: candidate.note,
              confidence: candidate.confidence,
              previousTarget: existingTargets.get(candidate.unitId)
            });
            continue;
          }
          updates.set(candidate.unitId, { translated: target, source, cosmosId });
          reportItem.matchedUnits.push({
            unitId: candidate.unitId,
            note: candidate.note,
            confidence: candidate.confidence,
            previousTarget: existingTargets.get(candidate.unitId)
          });
        }

        if (hasConflict) {
          reportItem.status = 'conflict';
          reportItem.reason = 'Different correction already exists for same trans-unit';
        } else {
          reportItem.status = 'applied';
        }
        reportItems.push(reportItem);
      }
    }
  );

  if (updates.size === 0) {
    // Generate report even if no updates
    const reportPath = await generateReport(xliffPath, reportItems, stats);
    vscode.window.showInformationMessage(
      `No matching XLIFF units found for the corrections. Report saved to: ${reportPath}`
    );
    return;
  }

  const result = applyUpdatesToXliff(xliffContent, updates);
  stats.updated = result.updated;
  stats.unchanged = result.unchanged;

  // Update report items with actual applied/unchanged status
  updateReportItemsWithResults(reportItems, result.updatedUnits, result.unchangedUnits);

  if (result.updated > 0) {
    fs.writeFileSync(xliffPath, result.text, 'utf8');
  }

  // Update sync timestamp in Cosmos
  const appliedCount = reportItems.filter(r => r.status === 'applied' || r.status === 'unchanged').length;
  await updateSyncTimestamp(syncContainer, xliffFileName, appliedCount);

  // Generate report file
  const reportPath = await generateReport(xliffPath, reportItems, stats);

  const action = await vscode.window.showInformationMessage(
    `Applied ${stats.updated} updates (${stats.unchanged} unchanged, ${stats.unmatched} unmatched, ` +
    `${stats.conflicts} conflicts, ${stats.skipped} skipped). Report saved.`,
    'Open Report'
  );

  if (action === 'Open Report') {
    const doc = await vscode.workspace.openTextDocument(reportPath);
    await vscode.window.showTextDocument(doc);
  }
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

async function pickArea(container: ReturnType<ReturnType<CosmosClient['database']>['container']>): Promise<string | null | undefined> {
  // Fetch distinct areas from the container
  const areaQuery = {
    query: `SELECT DISTINCT VALUE c.area FROM c WHERE IS_DEFINED(c.area) AND c.area != ""`
  };

  let areas: string[] = [];
  try {
    const response = await container.items.query<string>(areaQuery).fetchAll();
    areas = (response.resources || []).filter(Boolean).sort();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    vscode.window.showWarningMessage(`Failed to fetch areas: ${errorMessage}. Proceeding without area filter.`);
    return undefined; // undefined means no area filter (all areas)
  }

  if (areas.length === 0) {
    return undefined; // No areas found, proceed without filter
  }

  const options = ['All areas', ...areas];
  const pick = await vscode.window.showQuickPick(options, {
    placeHolder: 'Select area to apply corrections from'
  });

  if (!pick) return null; // User cancelled
  if (pick === 'All areas') return undefined; // No filter
  return pick; // Selected area
}

function buildQuery(choice: string, area?: string, sinceTimestamp?: string) {
  const parameters: Array<{ name: string; value: string }> = [];
  let whereClause = 'WHERE IS_DEFINED(c.target) AND c.target != ""';

  if (choice === 'UserCorrection only') {
    whereClause += ' AND c.translationType = @type';
    parameters.push({ name: '@type', value: 'UserCorrection' });
  }

  if (area) {
    whereClause += ' AND c.area = @area';
    parameters.push({ name: '@area', value: area });
  }

  if (sinceTimestamp) {
    whereClause += ' AND c.timestamp > @sinceTimestamp';
    parameters.push({ name: '@sinceTimestamp', value: sinceTimestamp });
  }

  return {
    query: `SELECT c.id, c.source, c.target, c.elementContext, c.translationType, c.area, c.pageId, c.pageName, c.timestamp, c.sourceTableId, c.tableName
            FROM c
            ${whereClause}
            ORDER BY c.timestamp ASC`,
    parameters: parameters.length > 0 ? parameters : undefined
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
    translatedText: source,
    pageName: toText(item.pageName),
    pageId: item.pageId,
    sourceTableId: item.sourceTableId,
    tableName: toText(item.tableName)
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
  updates: Map<string, { translated: string; cosmosId?: string }>
): { text: string; updated: number; unchanged: number; updatedUnits: Set<string>; unchangedUnits: Set<string> } {
  let updated = 0;
  let unchanged = 0;
  const updatedUnits = new Set<string>();
  const unchangedUnits = new Set<string>();

  const unitRe = /<trans-unit\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<\/trans-unit>/gi;
  const text = content.replace(unitRe, (unit, unitId) => {
    const update = updates.get(unitId);
    if (!update) return unit;

    const replaced = updateUnitTarget(unit, update.translated);
    if (replaced === unit) {
      unchanged++;
      unchangedUnits.add(unitId);
    } else {
      updated++;
      updatedUnits.add(unitId);
    }
    return replaced;
  });

  return { text, updated, unchanged, updatedUnits, unchangedUnits };
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

function extractExistingTargets(xliffContent: string): Map<string, string> {
  const targets = new Map<string, string>();
  const unitRe = /<trans-unit\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/trans-unit>/gi;
  let match: RegExpExecArray | null;

  while ((match = unitRe.exec(xliffContent)) !== null) {
    const unitId = match[1];
    const unitContent = match[2];
    const targetMatch = unitContent.match(/<target\b[^>]*>([\s\S]*?)<\/target>/i);
    if (targetMatch) {
      targets.set(unitId, xmlUnescape(targetMatch[1]));
    }
  }

  return targets;
}

function updateReportItemsWithResults(
  reportItems: ReportItem[],
  updatedUnits: Set<string>,
  unchangedUnits: Set<string>
): void {
  for (const item of reportItems) {
    if (item.status !== 'applied') continue;

    // Check if any of the matched units were actually updated
    let hasUpdated = false;
    let hasUnchanged = false;

    for (const mu of item.matchedUnits) {
      if (updatedUnits.has(mu.unitId)) {
        hasUpdated = true;
      }
      if (unchangedUnits.has(mu.unitId)) {
        hasUnchanged = true;
      }
    }

    if (!hasUpdated && hasUnchanged) {
      item.status = 'unchanged';
      item.reason = 'Target already matches correction';
    }
  }
}

async function generateReport(
  xliffPath: string,
  reportItems: ReportItem[],
  stats: UpdateStats
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const xliffDir = xliffPath.substring(0, xliffPath.lastIndexOf(fs.existsSync(xliffPath) ? (xliffPath.includes('/') ? '/' : '\\') : '/'));
  const xliffName = xliffPath.substring(xliffPath.lastIndexOf(xliffPath.includes('/') ? '/' : '\\') + 1).replace(/\.[^.]+$/, '');
  const reportPath = `${xliffDir}${xliffPath.includes('/') ? '/' : '\\'}correction-report-${xliffName}-${timestamp}.json`;

  const report = {
    generatedAt: new Date().toISOString(),
    xliffFile: xliffPath,
    summary: {
      totalCorrections: reportItems.length,
      applied: reportItems.filter(r => r.status === 'applied').length,
      unchanged: reportItems.filter(r => r.status === 'unchanged').length,
      unmatched: reportItems.filter(r => r.status === 'unmatched').length,
      conflicts: reportItems.filter(r => r.status === 'conflict').length,
      skipped: reportItems.filter(r => r.status === 'skipped').length,
      xliffUpdated: stats.updated,
      xliffUnchanged: stats.unchanged
    },
    corrections: reportItems.map(item => ({
      cosmosId: item.cosmosId,
      status: item.status,
      source: item.source,
      target: item.target,
      area: item.area,
      pageName: item.pageName,
      pageId: item.pageId,
      tableName: item.tableName,
      sourceTableId: item.sourceTableId,
      reason: item.reason,
      diagnostics: item.diagnostics ? {
        searchedText: item.diagnostics.searchedText,
        normalizedSearchText: item.diagnostics.normalizedSearchText,
        textMatchCount: item.diagnostics.textMatchCount,
        propertyFilteredCount: item.diagnostics.propertyFilteredCount,
        pageTableFilteredCount: item.diagnostics.pageTableFilteredCount,
        finalMatchCount: item.diagnostics.finalMatchCount,
        sampleTextMatches: item.diagnostics.sampleTextMatches,
        filterReason: item.diagnostics.filterReason
      } : undefined,
      matchedUnits: item.matchedUnits.map(mu => ({
        unitId: mu.unitId,
        note: mu.note,
        confidence: Math.round(mu.confidence * 100) + '%',
        previousTarget: mu.previousTarget
      }))
    }))
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return reportPath;
}

// Sync container management
const SYNC_CONTAINER_ID = 'translation_sync';

async function getOrCreateSyncContainer(
  client: CosmosClient,
  dbId: string
): Promise<ReturnType<ReturnType<CosmosClient['database']>['container']>> {
  const database = client.database(dbId);

  try {
    // Try to create the container (will succeed if doesn't exist)
    await database.containers.createIfNotExists({
      id: SYNC_CONTAINER_ID,
      partitionKey: { paths: ['/xliffFile'] }
    });
  } catch (err) {
    // Container might already exist, continue
  }

  return database.container(SYNC_CONTAINER_ID);
}

async function getLastSyncTimestamp(
  syncContainer: ReturnType<ReturnType<CosmosClient['database']>['container']>,
  xliffFileName: string
): Promise<SyncRecord | null> {
  const syncId = `sync-${xliffFileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  try {
    const { resource } = await syncContainer.item(syncId, xliffFileName).read<SyncRecord>();
    return resource || null;
  } catch (err) {
    // Document doesn't exist yet
    return null;
  }
}

async function updateSyncTimestamp(
  syncContainer: ReturnType<ReturnType<CosmosClient['database']>['container']>,
  xliffFileName: string,
  correctionsApplied: number
): Promise<void> {
  const syncId = `sync-${xliffFileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const timestamp = new Date().toISOString();

  const syncRecord: SyncRecord = {
    id: syncId,
    xliffFile: xliffFileName,
    lastSyncTimestamp: timestamp,
    correctionsApplied
  };

  try {
    await syncContainer.items.upsert(syncRecord);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    vscode.window.showWarningMessage(`Failed to update sync timestamp: ${errorMessage}`);
  }
}

function formatTimestamp(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleString();
  } catch {
    return isoTimestamp;
  }
}
