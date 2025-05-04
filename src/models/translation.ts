import axios from 'axios';
import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
dotenv.config();

const NUMBER_OF_RETRIES = 3;
const TIMEOUT = 5000;

interface AzureOptions {
  apiKey: string;
  apiVersion: string;
  endpoint: string;
  deployment: string;
}


const translateText = async (text: string,sourceLang: string, targetLang: string, retries = NUMBER_OF_RETRIES) : Promise<{ translated: string, confidence: number }> => {
    // Get API URL and API Key from VS Code settings
    const config = vscode.workspace.getConfiguration();
    const apiKey = config.get<string>('hiloTranslate.apiKey');
    const apiEndpoint = config.get<string>('hiloTranslate.apiEndpoint');
    const modelName = config.get<string>('hiloTranslate.modelName');
    const deployment = config.get<string>('hiloTranslate.deployment');
    const apiVersion = config.get<string>('hiloTranslate.apiVersion');

    // Validate input
    if (!text || typeof text !== 'string') {
        throw new Error('Invalid input: Text must be a non-empty string');
    }

    if (!apiKey || !apiEndpoint || !modelName || !deployment || !apiVersion) {
      throw new Error('API Key, API Endpoint, Model Name, Deployment, or API Version not properly configured');
  }

  const options: AzureOptions = {
    apiKey,
    apiVersion,
    endpoint: apiEndpoint,
    deployment
};

 // Define a strict prompt
 const systemPrompt = `You are a professional Business Central translator. Only return the translated text in plain language. Do not add quotation marks, markdown, asterisks, or any explanation. Reply ONLY with the pure translation text.`;
 const userPrompt = `Translate the following text from ${sourceLang} to ${targetLang}:\n\n"${text}"`;
 
try {
  // Make API request to Azure OpenAI
  const response = await axios.post(
      `${options.endpoint}/openai/deployments/${options.deployment}/chat/completions?api-version=${options.apiVersion}`,
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        logprobs: true
      },
      {
          headers: {
            'Content-Type': 'application/json',
            'api-key': options.apiKey
          }
      }
  );

    // Extract and clean the translated text
    const rawTranslation = response.data.choices[0]?.message?.content || '';
    const cleanedTranslation = cleanTranslation(rawTranslation);

    const tokenLogProbs = response.data.choices[0]?.logprobs?.content || [];
    const probabilities = tokenLogProbs.map((t: any) => typeof t.logprob === 'number' ? Math.exp(t.logprob) : 0);
    const averageConfidence = probabilities.length > 0
      ? parseFloat((probabilities.reduce((a: number, b: number) => a + b, 0) / probabilities.length).toFixed(2))
      : 0.7;

    return {
      translated: cleanedTranslation,
      confidence: averageConfidence
    };
} catch (error) {
  // Handle API errors with retries
  const errorMessage = (error as any).response?.data?.error?.message || (error as any).message;
  if (retries > 0 && errorMessage.includes('model loading')) {
      console.log("Model is loading, retrying in 5 seconds...");
      await new Promise(resolve => setTimeout(resolve, TIMEOUT));
      return translateText(text, sourceLang, targetLang, retries - 1);
  }
  throw new Error(`Translation failed: ${errorMessage}`);
}
};

function cleanTranslation(text: string): string {
  return text
    .replace(/^["'“”«»„“]|["'“”«»„“]$/g, '') // Remove leading/trailing quotes
    .replace(/[*_]/g, '')                     // Remove markdown like **bold** or _italic_
    .replace(/&quot;/g, '"')                  // Decode &quot; to real quotes
    .trim();                                  // Trim whitespace
}

export { translateText };