import { CosmosClient } from '@azure/cosmos';
import * as vscode from 'vscode';
import { logCosmosUsage } from '../models/usageLoger';

const getCosmosClient = () => {
  const config = vscode.workspace.getConfiguration();
  const cosmosEndpoint = config.get<string>('hiloTranslate.cosmosEndpoint');
  const cosmosKey = config.get<string>('hiloTranslate.cosmosKey');

  if (!cosmosEndpoint || !cosmosKey) {
    throw new Error('Cosmos DB configuration is missing.');
  }

  return new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
};

// Exact match query — returns single translation
export async function lookupExactTranslation(source: string, sourceLang: string): Promise<{ translated: string, confidence: number } | null> {
  const client = getCosmosClient();
  const db = client.database('translations');
  const { resources: containers } = await db.containers.readAll().fetchAll();
  
  let bestMatch: { translated: string, confidence: number } | null = null;

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
      if (response.resources.length > 0) {
        const match = response.resources[0];
        logCosmosUsage(`Exact match from '${containerDef.id}': matched "${match.source}"`, response.requestCharge);

        if (!bestMatch || match.confidence > bestMatch.confidence) {
          bestMatch = {
            translated: match.target,
            confidence: parseFloat((match.confidence || 0.9).toFixed(2))
          };
        }
      }
    } catch (err: any) {
      console.warn(`Exact match query failed in '${containerDef.id}': ${err.message}`);
    }
  }

  return bestMatch;
}

// Fuzzy partial match — used for enrichment / low-confidence back-checking
export async function lookupFuzzyExamples(source: string, sourceLang: string): Promise<{ source: string, target: string }[]> {
  const client = getCosmosClient();
  const db = client.database('translations');
  const { resources: containers } = await db.containers.readAll().fetchAll();

  const fuzzyExamples: { source: string, target: string }[] = [];
  const seenSources = new Set<string>();
  const words = source.split(/\s+/).filter(w => w.length > 1);

  for (const word of words) {
    const wordExamples: { source: string, target: string, confidence: number }[] = [];

    for (const containerDef of containers) {
      const container = db.container(containerDef.id);

      const query = {
        query: `
          SELECT TOP 3 c.source, c.target, c.confidence
          FROM c
          WHERE CONTAINS(LOWER(c.source), @term)
            AND c.sourceLang = @sourceLang
            AND LENGTH(c.source) <= 80
          ORDER BY c.confidence DESC`,
        parameters: [
          { name: '@term', value: word.toLowerCase() },
          { name: '@sourceLang', value: sourceLang }
        ]
      };

      try {
        const response = await container.items.query(query).fetchAll();
        const matchedWords = response.resources.map(item => `"${item.source}"`).join(', ');
        logCosmosUsage(
          `Fuzzy match from '${containerDef.id}' using word "${word}": matched [${matchedWords}]`,
          response.requestCharge
        );

        for (const item of response.resources) {
          const confidence = parseFloat((item.confidence || 0.9).toFixed(2)); 
          wordExamples.push({ source: item.source, target: item.target, confidence });
        }
      } catch (err) {
        console.warn(`Fuzzy match query failed in '${containerDef.id}' for word "${word}": ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Filter and select top 3 most relevant per word
    const filteredWordExamples = wordExamples.filter(item => {
      const isTooLong = item.source.length > 80 || item.source.split(/\s+/).length > 8;
      const isLikelyTooltip = /[.,;]/.test(item.source) && item.source.length > 60;
      return !isTooLong && !isLikelyTooltip;
    });

    // Sort by confidence DESC and take top 3
    filteredWordExamples.sort((a, b) => b.confidence - a.confidence);
    const top3PerWord = filteredWordExamples.slice(0, 3);

    // Add to overall, dedup
    for (const example of top3PerWord) {
      if (!seenSources.has(example.source)) {
        fuzzyExamples.push({ source: example.source, target: example.target });
        seenSources.add(example.source);
      }
    }
  }

  return fuzzyExamples;
}