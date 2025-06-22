import axios from 'axios';
import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import { lookupTranslation } from '../xliff/dbHandlers';
import { logAiUsage, showUsageLog } from '../models/usageLoger';
dotenv.config();

const NUMBER_OF_RETRIES = 3;
const TIMEOUT = 5000;

interface AzureOptions {
  apiKey: string;
  apiVersion: string;
  endpoint: string;
  deployment: string;
}

const translateText = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  numOptions = 1,
  retries = NUMBER_OF_RETRIES
): Promise<{ translated: string, confidence: number, source: string }[]> => {
  const config = vscode.workspace.getConfiguration();
  const apiKey = config.get<string>('hiloTranslate.apiKey');
  const apiEndpoint = config.get<string>('hiloTranslate.apiEndpoint');
  const modelName = config.get<string>('hiloTranslate.modelName');
  const deployment = config.get<string>('hiloTranslate.deployment');
  const apiVersion = config.get<string>('hiloTranslate.apiVersion');

  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: Text must be a non-empty string');
  }

  if (!apiKey || !apiEndpoint || !modelName || !deployment || !apiVersion) {
    throw new Error('API Key, API Endpoint, Model Name, Deployment, or API Version not properly configured');
  }

  const cached = await lookupTranslation(text, sourceLang);
  if (cached?.translated) {
    logAiUsage('[CACHE] Found in Cosmos DB', text, cached.translated, undefined);
    return [{ translated: cached.translated, confidence: cached.confidence, source: 'cosmos' }];
  }

  interface TranslationExample {
    source: string;
    target: string;
  }

  const examplesText = cached?.examples?.length
      ? cached.examples.map((e: TranslationExample) => `- ${e.source} → ${e.target}`).join('\n')
      : '';

  const promptHeader = `You are a professional Business Central translator. Only return the translated text in plain language. Do not add quotation marks, markdown, asterisks, or any explanation. Reply ONLY with the pure translation text.`;
  const promptExamples = examplesText ? `Here are some previous translations for context:\n${examplesText}\n\n` : '';
  const promptRequest = `Translate the following text from ${sourceLang} to ${targetLang} and provide ${numOptions} translation options:\n\n"${text}"`;

  const options: AzureOptions = {
    apiKey,
    apiVersion,
    endpoint: apiEndpoint,
    deployment
  };

  try {
    const response = await axios.post(
      `${options.endpoint}/openai/deployments/${options.deployment}/chat/completions?api-version=${options.apiVersion}`,
      {
        messages: [
          { role: "system", content: promptHeader },
          { role: "user", content: promptExamples + promptRequest }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        logprobs: true
        // n: numOptions
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': options.apiKey
        }
      }
    );

    

    const results = (response.data.choices as { message?: { content: string } }[]).map((choice) => {
      const rawTranslation = choice.message?.content || '';
      const cleanedTranslation = cleanTranslation(rawTranslation);

      const tokenLogProbs = response.data.choices[0]?.logprobs?.content || [];
      const probabilities = tokenLogProbs.map((t: any) => typeof t.logprob === 'number' ? Math.exp(t.logprob) : 0);

      const avgProb = probabilities.length > 0
      ? probabilities.reduce((a: number, b: number) => a + b, 0) / probabilities.length
      : 0.7;

    const minProb = probabilities.length > 0
      ? Math.min(...probabilities)
      : 0.7;

      const combinedConfidence = parseFloat(((avgProb * 0.7) + (minProb * 0.3)).toFixed(2));
      
      return {
        translated: cleanedTranslation,
        confidence: combinedConfidence, 
        source: 'aiTranslator'
      };
    });

    logAiUsage('Azure AI translation', text, results.map((r: { translated: string }) => r.translated).join(' | '), response.data.usage);

    return results;

  } catch (error) {
    const errorMessage = (error as any).response?.data?.error?.message || (error as any).message;
    if (retries > 0 && errorMessage.includes('model loading')) {
      console.log("Model is loading, retrying in 5 seconds...");
      await new Promise(resolve => setTimeout(resolve, TIMEOUT));
      return translateText(text, sourceLang, targetLang, numOptions, retries - 1);
    }
    throw new Error(`Translation failed: ${errorMessage}`);
  }
};


function cleanTranslation(text: string): string {
  return text
    .replace(/^['\"“”«»„“]|['\"“”«»„“]$/g, '')
    .replace(/[*_]/g, '')
    .replace(/&quot;/g, '"')
    .trim();
}

export { translateText };
