import * as vscode from 'vscode';

/**
 * Keys stored in VS Code SecretStorage
 */
export enum SecretKey {
  ApiKey = 'hiloTranslate.apiKey',
  ApiEndpoint = 'hiloTranslate.apiEndpoint',
  Deployment = 'hiloTranslate.deployment',
  ApiVersion = 'hiloTranslate.apiVersion',
  CosmosEndpoint = 'hiloTranslate.cosmosEndpoint',
  CosmosKey = 'hiloTranslate.cosmosKey',
  UploadUrl = 'hiloTranslate.uploadUrl',
}

/**
 * Company default keys - these are bundled with the extension
 * for team members who don't have their own keys
 */
const COMPANY_DEFAULTS: Record<SecretKey, string> = {
  [SecretKey.ApiKey]: '', // Will be set by your company
  [SecretKey.ApiEndpoint]: '',
  [SecretKey.Deployment]: 'gpt-4o',
  [SecretKey.ApiVersion]: '2024-12-01-preview',
  [SecretKey.CosmosEndpoint]: '',
  [SecretKey.CosmosKey]: '',
  [SecretKey.UploadUrl]: '',
};

let secretStorage: vscode.SecretStorage | undefined;

/**
 * Initialize the configuration manager with the extension context
 */
export function initConfigManager(context: vscode.ExtensionContext): void {
  secretStorage = context.secrets;
}

/**
 * Get a secret value from SecretStorage
 */
export async function getSecret(key: SecretKey): Promise<string | undefined> {
  if (!secretStorage) {
    throw new Error('ConfigurationManager not initialized. Call initConfigManager first.');
  }
  return await secretStorage.get(key);
}

/**
 * Store a secret value in SecretStorage
 */
export async function setSecret(key: SecretKey, value: string): Promise<void> {
  if (!secretStorage) {
    throw new Error('ConfigurationManager not initialized. Call initConfigManager first.');
  }
  await secretStorage.store(key, value);
}

/**
 * Delete a secret from SecretStorage
 */
export async function deleteSecret(key: SecretKey): Promise<void> {
  if (!secretStorage) {
    throw new Error('ConfigurationManager not initialized. Call initConfigManager first.');
  }
  await secretStorage.delete(key);
}

/**
 * Check if all required Azure OpenAI keys are configured
 */
export async function isAIConfigured(): Promise<boolean> {
  const apiKey = await getSecret(SecretKey.ApiKey);
  const apiEndpoint = await getSecret(SecretKey.ApiEndpoint);
  const deployment = await getSecret(SecretKey.Deployment);
  return Boolean(apiKey && apiEndpoint && deployment);
}

/**
 * Check if Cosmos DB is configured
 */
export async function isCosmosConfigured(): Promise<boolean> {
  const endpoint = await getSecret(SecretKey.CosmosEndpoint);
  const key = await getSecret(SecretKey.CosmosKey);
  return Boolean(endpoint && key);
}

/**
 * Check if any configuration exists
 */
export async function hasAnyConfiguration(): Promise<boolean> {
  const aiConfigured = await isAIConfigured();
  return aiConfigured;
}

/**
 * Get all Azure OpenAI configuration
 */
export async function getAIConfig(): Promise<{
  apiKey: string;
  apiEndpoint: string;
  deployment: string;
  apiVersion: string;
} | null> {
  const apiKey = await getSecret(SecretKey.ApiKey);
  const apiEndpoint = await getSecret(SecretKey.ApiEndpoint);
  const deployment = await getSecret(SecretKey.Deployment);
  const apiVersion = await getSecret(SecretKey.ApiVersion) || '2024-12-01-preview';

  if (!apiKey || !apiEndpoint || !deployment) {
    return null;
  }

  return { apiKey, apiEndpoint, deployment, apiVersion };
}

/**
 * Get Cosmos DB configuration
 */
export async function getCosmosConfig(): Promise<{
  endpoint: string;
  key: string;
} | null> {
  const endpoint = await getSecret(SecretKey.CosmosEndpoint);
  const key = await getSecret(SecretKey.CosmosKey);

  if (!endpoint || !key) {
    return null;
  }

  return { endpoint, key };
}

/**
 * Get upload URL for blob storage
 */
export async function getUploadUrl(): Promise<string | undefined> {
  return await getSecret(SecretKey.UploadUrl);
}

/**
 * Apply company default keys
 */
export async function applyCompanyDefaults(): Promise<void> {
  for (const [key, value] of Object.entries(COMPANY_DEFAULTS)) {
    if (value) {
      await setSecret(key as SecretKey, value);
    }
  }
}

/**
 * Clear all stored secrets
 */
export async function clearAllSecrets(): Promise<void> {
  for (const key of Object.values(SecretKey)) {
    await deleteSecret(key);
  }
}

/**
 * Set company defaults - call this to configure your company's keys
 * This should be called during build/deployment for your team
 */
export function setCompanyDefaults(defaults: Partial<Record<SecretKey, string>>): void {
  for (const [key, value] of Object.entries(defaults)) {
    if (value) {
      COMPANY_DEFAULTS[key as SecretKey] = value;
    }
  }
}

/**
 * Check if company defaults are available
 */
export function hasCompanyDefaults(): boolean {
  return Boolean(COMPANY_DEFAULTS[SecretKey.ApiKey] && COMPANY_DEFAULTS[SecretKey.ApiEndpoint]);
}
