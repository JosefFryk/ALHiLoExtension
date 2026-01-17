import axios from 'axios';
import * as vscode from 'vscode';
import { lookupExactTranslation, lookupFuzzyExamples } from '../xliff/dbHandlers';
import { logAiUsage } from '../models/usageLoger';
import { getAIConfig, isAIConfigured } from '../setup/configurationManager';

const NUMBER_OF_RETRIES = 3;
const TIMEOUT = 5000;
const LOW_CONFIDENCE_THRESHOLD = 0.70;

interface AzureConfig {
  apiKey: string;
  apiEndpoint: string;
  deployment: string;
  apiVersion: string;
}

const translateText = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  numOptions = 1,
  retries = NUMBER_OF_RETRIES
): Promise<{ translated: string, confidence: number, source: string }[]> => {

  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: Text must be a non-empty string');
  }

  // Check if AI is configured
  const isConfigured = await isAIConfigured();
  if (!isConfigured) {
    const action = await vscode.window.showErrorMessage(
      'HiLo Translator is not configured. Please run setup first.',
      'Setup Now'
    );
    if (action === 'Setup Now') {
      await vscode.commands.executeCommand('hiloTranslator.setup');
    }
    throw new Error('Translation not configured. Please run HiLo: Configure API Keys command.');
  }

  // Get AI configuration from SecretStorage
  const config = await getAIConfig();
  if (!config) {
    throw new Error('Failed to retrieve API configuration.');
  }

  const { apiKey, apiEndpoint, deployment, apiVersion } = config;

  // 1. Try exact match from DB
  const exact = await lookupExactTranslation(text, sourceLang);
  if (exact) {
    logAiUsage('[CACHE] Found in Cosmos DB', text, exact.translated, undefined);
    return [{ translated: exact.translated, confidence: exact.confidence, source: 'cosmos' }];
  }

  // 2. Call AI (initial request without fuzzy examples)
  const initialResult = await callAITranslation(text, sourceLang, targetLang, numOptions, config);
  const lowConfidence = initialResult.some(r => r.confidence < LOW_CONFIDENCE_THRESHOLD);

  if (!lowConfidence || retries <= 0 || text.length > 80) {
    return initialResult;
  }

  // 3. Back-check: gather fuzzy examples for a refined prompt
  const examples = await lookupFuzzyExamples(text, sourceLang);
  const examplesText = examples.length
    ? examples.map(e => `- ${e.source} → ${e.target}`).join('\n')
    : '';

  const enrichedPrompt = examplesText
    ? `The following example translations contain some of the same words as the input phrase. Use them as context, but do not translate word-by-word. Focus on the most natural and accurate full phrase translation.\n\n${examplesText}\n\n`
    : '';

  return await callAITranslation(text, sourceLang, targetLang, numOptions, config, enrichedPrompt);
};

async function callAITranslation(
  text: string,
  sourceLang: string,
  targetLang: string,
  numOptions: number,
  config: AzureConfig,
  examples: string = ''
): Promise<{ translated: string, confidence: number, source: string }[]> {

  const { apiKey, apiEndpoint, deployment, apiVersion } = config;

  const promptHeader = `You are a professional Business Central translator. Only return the translated text in plain language. Do not add quotation marks, markdown, asterisks, or any explanation. Reply ONLY with the pure translation text.`;
  const promptRequest = `Translate the following phrase from ${sourceLang} to ${targetLang}. Provide ${numOptions} high-quality translation option(s).\n\nPhrase: "${text}"`;
  const fullPrompt = `${promptHeader}\n\n${examples}${promptRequest}`;

  try {
    const response = await axios.post(
      `${apiEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
      {
        messages: [
          { role: "system", content: promptHeader },
          { role: "user", content: examples + promptRequest }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        logprobs: true
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        }
      }
    );

    const choices = response.data.choices as { message?: { content: string }; logprobs?: unknown }[];
    const results = choices.map((choice) => {
      const rawTranslation = choice.message?.content || '';
      const cleanedTranslation = cleanTranslation(rawTranslation);

      const tokenLogprobs = extractTokenLogProbs(choice);
      const logprobConfidence = calculateLogprobConfidence(tokenLogprobs);
      const placeholderScore = calculatePlaceholderScore(text, cleanedTranslation);
      const combinedConfidence = clampConfidence(
        logprobConfidence * (0.85 + (0.15 * placeholderScore))
      );

      return {
        translated: cleanedTranslation,
        confidence: combinedConfidence,
        source: 'aiTranslator'
      };
    });

    const agreementScores = calculateAgreementScores(results.map(r => r.translated));
    for (let i = 0; i < results.length; i++) {
      const agreement = agreementScores[i] ?? 1;
      results[i].confidence = clampConfidence(results[i].confidence * (0.8 + (0.2 * agreement)));
    }


    logAiUsage('Azure AI translation', text, results.map(r => r.translated).join(' | '), response.data.usage, fullPrompt);
    return results;

  } catch (error) {
    const axiosError = error as { response?: { data?: { error?: { message?: string } } }, message?: string };
    const errorMessage = axiosError.response?.data?.error?.message || axiosError.message || 'Unknown error';
    if (errorMessage.includes('model loading')) {
      console.log("Model is loading, retrying...");
      await new Promise(resolve => setTimeout(resolve, TIMEOUT));
      return callAITranslation(text, sourceLang, targetLang, numOptions, config, examples);
    }
    throw new Error(`Translation failed: ${errorMessage}`);
  }
}

function cleanTranslation(text: string): string {
  return text
    .replace(/^['\"""«»„"]|['\"""«»„"]$/g, '')
    .replace(/[*_]/g, '')
    .replace(/&quot;/g, '"')
    .trim();
}

function extractTokenLogProbs(choice: { logprobs?: unknown }): number[] {
  const logprobs = choice.logprobs as { content?: Array<{ logprob?: number }>; token_logprobs?: number[] } | undefined;
  if (!logprobs) {
    return [];
  }

  if (Array.isArray(logprobs.content)) {
    return logprobs.content
      .map(t => (typeof t.logprob === 'number' ? t.logprob : undefined))
      .filter((v): v is number => typeof v === 'number');
  }

  if (Array.isArray(logprobs.token_logprobs)) {
    return logprobs.token_logprobs.filter((v): v is number => typeof v === 'number');
  }

  return [];
}

function calculateLogprobConfidence(logprobs: number[], defaultValue = 0.7): number {
  if (logprobs.length === 0) {
    return defaultValue;
  }

  const probabilities = logprobs.map(lp => Math.exp(lp));
  const avgProb = probabilities.reduce((a, b) => a + b, 0) / probabilities.length;
  const minProb = Math.min(...probabilities);
  const combined = (avgProb * 0.7) + (minProb * 0.3);
  return clampConfidence(combined);
}

function calculatePlaceholderScore(source: string, target: string): number {
  const placeholders = extractPlaceholders(source);
  if (placeholders.length === 0) {
    return 1;
  }

  let matched = 0;
  for (const p of placeholders) {
    if (target.includes(p)) {
      matched++;
    }
  }

  return matched / placeholders.length;
}

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/(%\d+|%\w|\{\d+\}|\{[A-Za-z0-9_]+\}|\[[A-Za-z0-9_]+\])/g);
  return matches ?? [];
}

function calculateAgreementScores(translations: string[]): number[] {
  if (translations.length <= 1) {
    return translations.map(() => 1);
  }

  const normalized = translations.map(t => normalizeForAgreement(t));
  const tokenSets = normalized.map(t => new Set(t.split(/\s+/).filter(Boolean)));
  const scores: number[] = [];

  for (let i = 0; i < tokenSets.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = 0; j < tokenSets.length; j++) {
      if (i === j) continue;
      sum += jaccard(tokenSets[i], tokenSets[j]);
      count++;
    }
    scores.push(count > 0 ? sum / count : 1);
  }

  return scores;
}

function normalizeForAgreement(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function clampConfidence(value: number): number {
  if (!isFinite(value)) return 0.7;
  return Math.min(0.99, Math.max(0, parseFloat(value.toFixed(2))));
}

export { translateText };
