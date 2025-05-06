import * as vscode from 'vscode';

const output = vscode.window.createOutputChannel('HiLo Translate');

let totalTokens = 0;
let totalRU = 0;

export function logCosmosUsage(context: string, ru: number | string) {
  const numericRU = typeof ru === 'string' ? parseFloat(ru) : ru;
  totalRU += numericRU || 0;
  output.appendLine(`[COSMOS] ${context} — RU charge: ${numericRU}`);
}

export function logAiUsage(context: string, text: string, translated: string, usage?: { prompt_tokens: number, completion_tokens: number, total_tokens: number }) {
  output.appendLine(`[AI] ${context}`);
  output.appendLine(`     Input: "${text}"`);
  output.appendLine(`     Output: "${translated}"`);
  if (usage) {
    totalTokens += usage.total_tokens;
    output.appendLine(`     Tokens: ${usage.total_tokens} (Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens})`);
  } else {
    output.appendLine('     Tokens: not reported');
  }
}

function estimateAzureAICost(tokens: number): number {
  const costPerThousand = 0.01;
  return parseFloat(((tokens / 1000) * costPerThousand).toFixed(4));
}

function estimateCosmosCost(ru: number): number {
  const costPer1000RU = 0.008;
  return parseFloat(((ru / 1000) * costPer1000RU).toFixed(4));
}

export function showUsageLog() {
  output.appendLine(`\n--- Usage Summary ---`);
  output.appendLine(`Total Azure AI tokens: ${totalTokens} → ~$${estimateAzureAICost(totalTokens)}`);
  output.appendLine(`Total Cosmos DB RU: ${totalRU.toFixed(2)} → ~$${estimateCosmosCost(totalRU)}`);
  output.show(true);
}

export function resetUsageStats() {
  totalTokens = 0;
  totalRU = 0;
}
