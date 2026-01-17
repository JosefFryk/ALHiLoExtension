import { CosmosClient } from '@azure/cosmos';
import { logCosmosUsage } from '../models/usageLoger';
import { getCosmosConfig, isCosmosConfigured } from '../setup/configurationManager';

let cosmosClient: CosmosClient | null = null;
let containerIdCache: string[] | null = null;

const MAX_FUZZY_TERMS = 4;
const MAX_FUZZY_EXAMPLES = 10;
const MAX_PER_WORD = 2;
const MIN_WORD_LEN = 3;
const MIN_ACRONYM_LEN = 2;
const STOPWORDS = new Set([
  'code',
  'name',
  'number',
  'no',
  'setup',
  'entry',
  'type',
  'value',
  'line',
  'document',
  'status',
  'date'
]);

const getCosmosClient = async (): Promise<CosmosClient | null> => {
  // Check if Cosmos is configured
  const isConfigured = await isCosmosConfigured();
  if (!isConfigured) {
    return null;
  }

  // Return cached client if available
  if (cosmosClient) {
    return cosmosClient;
  }

  // Get configuration from SecretStorage
  const config = await getCosmosConfig();
  if (!config) {
    return null;
  }

  cosmosClient = new CosmosClient({ endpoint: config.endpoint, key: config.key });
  return cosmosClient;
};

const getContainerIds = async (db: ReturnType<CosmosClient['database']>): Promise<string[]> => {
  if (containerIdCache) {
    return containerIdCache;
  }

  const { resources } = await db.containers.readAll().fetchAll();
  containerIdCache = resources.map(container => container.id).filter(Boolean);
  return containerIdCache;
};

/**
 * Reset the cached Cosmos client (useful when configuration changes)
 */
export function resetCosmosClient(): void {
  cosmosClient = null;
  containerIdCache = null;
}

// Exact match query — returns single translation
export async function lookupExactTranslation(source: string, sourceLang: string): Promise<{ translated: string, confidence: number } | null> {
  const client = await getCosmosClient();
  if (!client) {
    // Cosmos DB not configured, skip lookup
    return null;
  }

  const db = client.database('translations');
  const containerIds = await getContainerIds(db);

  let bestMatch: { translated: string, confidence: number } | null = null;

  for (const containerId of containerIds) {
    const container = db.container(containerId);

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
      const response = await container.items
        .query(query, { partitionKey: source })
        .fetchAll();
      if (response.resources.length > 0) {
        const match = response.resources[0];
        logCosmosUsage(`Exact match from '${containerId}': matched "${match.source}"`, response.requestCharge);

        if (!bestMatch || match.confidence > bestMatch.confidence) {
          bestMatch = {
            translated: match.target,
            confidence: parseFloat((match.confidence || 0.9).toFixed(2))
          };
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.warn(`Exact match query failed in '${containerId}': ${errorMessage}`);
    }
  }

  return bestMatch;
}

// Fuzzy partial match — used for enrichment / low-confidence back-checking
export async function lookupFuzzyExamples(source: string, sourceLang: string): Promise<{ source: string, target: string }[]> {
  const client = await getCosmosClient();
  if (!client) {
    // Cosmos DB not configured, return empty array
    return [];
  }

  const db = client.database('translations');
  const containerIds = await getContainerIds(db);

  const fuzzyExamples: { source: string, target: string }[] = [];
  const seenSources = new Set<string>();
  const words = getSearchTerms(source);
  if (words.length === 0) {
    return [];
  }

  for (const word of words) {
    if (fuzzyExamples.length >= MAX_FUZZY_EXAMPLES) break;
    const wordExamples: { source: string, target: string, confidence: number }[] = [];

    for (const containerId of containerIds) {
      const container = db.container(containerId);

      const query = {
        query: `
          SELECT TOP 2 c.source, c.target, c.confidence
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
          `Fuzzy match from '${containerId}' using word "${word}": matched [${matchedWords}]`,
          response.requestCharge
        );

        for (const item of response.resources) {
          const confidence = parseFloat((item.confidence || 0.9).toFixed(2));
          wordExamples.push({ source: item.source, target: item.target, confidence });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.warn(`Fuzzy match query failed in '${containerId}' for word "${word}": ${errorMessage}`);
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
    const topPerWord = filteredWordExamples.slice(0, MAX_PER_WORD);

    // Add to overall, dedup
    for (const example of topPerWord) {
      if (fuzzyExamples.length >= MAX_FUZZY_EXAMPLES) break;
      if (!seenSources.has(example.source)) {
        fuzzyExamples.push({ source: example.source, target: example.target });
        seenSources.add(example.source);
      }
    }
  }

  return fuzzyExamples;
}

function getSearchTerms(text: string): string[] {
  const tokens = text.split(/\s+/).map(sanitizeToken).filter(Boolean);
  if (tokens.length === 0) return [];

  const acronymTokens = tokens
    .filter(t => t.length >= MIN_ACRONYM_LEN && /^[A-Z0-9]+$/.test(t));

  const uniqueAcronyms = Array.from(new Set(acronymTokens));
  if (uniqueAcronyms.length > 0) {
    return uniqueAcronyms.slice(0, MAX_FUZZY_TERMS);
  }

  const candidates = tokens
    .map(t => t.toLowerCase())
    .filter(t => t.length >= MIN_WORD_LEN && !STOPWORDS.has(t));

  const uniqueCandidates = Array.from(new Set(candidates));
  uniqueCandidates.sort((a, b) => b.length - a.length);
  return uniqueCandidates.slice(0, MAX_FUZZY_TERMS);
}

function sanitizeToken(token: string): string {
  return token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
}
