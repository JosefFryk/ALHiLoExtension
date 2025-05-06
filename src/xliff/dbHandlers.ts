import { CosmosClient } from '@azure/cosmos';
import * as vscode from 'vscode';
import { logCosmosUsage } from '../models/usageLoger';

export async function lookupTranslation(source: string, sourceLang: string): Promise<{ translated: string, confidence: number, examples: { source: string, target: string }[] } | null> {
  const config = vscode.workspace.getConfiguration();
  const cosmosEndpoint = config.get<string>('hiloTranslate.cosmosEndpoint');
  const cosmosKey = config.get<string>('hiloTranslate.cosmosKey');

  if (!cosmosEndpoint || !cosmosKey) {
    console.warn('Cosmos DB config missing');
    return null;
  }

  const client = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
  const db = client.database('translations');
  const { resources: containers } = await db.containers.readAll().fetchAll();

  const allMatches: { translated: string, confidence: number, containerId: string }[] = [];

  for (const containerDef of containers) {
    const container = db.container(containerDef.id);

    const query = {
      query: `SELECT TOP 1 c.source, c.target, c.confidence 
              FROM c 
              WHERE c.source = @source AND c.sourceLang = @sourceLang
              ORDER BY c.confidence DESC`,
      parameters: [
        { name: '@source', value: source },
        { name: '@sourceLang', value: sourceLang }
      ]
    };

    try {
      const response = await container.items.query(query).fetchAll();
      logCosmosUsage(`Exact match from '${containerDef.id}'`, response.requestCharge);

      if (response.resources.length > 0) {
        allMatches.push({
          translated: response.resources[0].target,
          confidence: parseFloat((response.resources[0].confidence || 0.9).toFixed(2)),
          containerId: containerDef.id
        });
      }
    } catch (queryErr: any) {
      console.warn(`Query failed in container '${containerDef.id}': ${queryErr.message}`);
    }
  }

  if (allMatches.length > 0) {
    const bestMatch = allMatches.sort((a, b) => b.confidence - a.confidence)[0];
    return {
      translated: bestMatch.translated,
      confidence: bestMatch.confidence,
      examples: []
    };
  }

  // Fallback: collect fuzzy matches from all containers
  const fuzzyExamples: { source: string, target: string }[] = [];
  const seenSources = new Set<string>();

  for (const containerDef of containers) {
    const container = db.container(containerDef.id);

    const query = {
      query: 'SELECT TOP 5 c.source, c.target FROM c WHERE CONTAINS(LOWER(c.source), @term) AND c.sourceLang = @sourceLang',
      parameters: [
        { name: '@term', value: source.toLowerCase().split(' ')[0] },
        { name: '@sourceLang', value: sourceLang }
      ]
    };

    try {
      const response = await container.items.query(query).fetchAll();
      logCosmosUsage(`Fuzzy match from '${containerDef.id}'`, response.requestCharge);

      const similar = response.resources;
      for (const item of similar) {
        if (!seenSources.has(item.source)) {
          fuzzyExamples.push({ source: item.source, target: item.target });
          seenSources.add(item.source);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        console.warn(`Fuzzy match query failed in '${containerDef.id}': ${err.message}`);
      } else {
        console.warn(`Fuzzy match query failed in '${containerDef.id}': Unknown error`);
      }
    }
  }

  const topExamples = fuzzyExamples.slice(0, 5);
  return topExamples.length > 0 ? { translated: '', confidence: 0, examples: topExamples } : null;
}
