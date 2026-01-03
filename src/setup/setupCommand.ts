import * as vscode from 'vscode';
import {
  SecretKey,
  setSecret,
  getSecret,
  applyCompanyDefaults,
  hasCompanyDefaults,
  clearAllSecrets,
  isAIConfigured,
  isCosmosConfigured,
} from './configurationManager';

interface SetupOption {
  label: string;
  description: string;
  action: 'company' | 'own' | 'reconfigure' | 'clear';
}

/**
 * Main setup command - shows quick pick for configuration options
 */
export async function runSetupCommand(): Promise<void> {
  const aiConfigured = await isAIConfigured();
  const cosmosConfigured = await isCosmosConfigured();

  const options: SetupOption[] = [];

  if (hasCompanyDefaults()) {
    options.push({
      label: '$(organization) Use Company Keys',
      description: 'Use pre-configured company API keys',
      action: 'company',
    });
  }

  options.push({
    label: '$(key) Enter My Own Keys',
    description: 'Configure your own Azure OpenAI and Cosmos DB keys',
    action: 'own',
  });

  if (aiConfigured || cosmosConfigured) {
    options.push({
      label: '$(gear) Reconfigure Keys',
      description: 'Update existing configuration',
      action: 'reconfigure',
    });
    options.push({
      label: '$(trash) Clear All Keys',
      description: 'Remove all stored API keys',
      action: 'clear',
    });
  }

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: 'How would you like to configure HiLo Translator?',
    title: 'HiLo Translator Setup',
  });

  if (!selected) {
    return;
  }

  switch (selected.action) {
    case 'company':
      await setupWithCompanyKeys();
      break;
    case 'own':
    case 'reconfigure':
      await setupWithOwnKeys();
      break;
    case 'clear':
      await clearConfiguration();
      break;
  }
}

/**
 * Apply company default keys
 */
async function setupWithCompanyKeys(): Promise<void> {
  await applyCompanyDefaults();
  vscode.window.showInformationMessage('HiLo Translator: Company keys configured successfully!');
}

/**
 * Clear all configuration
 */
async function clearConfiguration(): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    'Are you sure you want to remove all API keys?',
    { modal: true },
    'Yes, Clear All'
  );

  if (confirm === 'Yes, Clear All') {
    await clearAllSecrets();
    vscode.window.showInformationMessage('HiLo Translator: All keys have been removed.');
  }
}

/**
 * Setup with user's own keys using sequential input prompts
 */
async function setupWithOwnKeys(): Promise<void> {
  // Ask which services to configure
  const services = await vscode.window.showQuickPick(
    [
      { label: '$(cloud) Azure OpenAI (Required for translation)', picked: true, id: 'ai' },
      { label: '$(database) Azure Cosmos DB (Optional - for caching)', picked: false, id: 'cosmos' },
      { label: '$(cloud-upload) Azure Blob Storage (Optional - for export)', picked: false, id: 'blob' },
    ],
    {
      canPickMany: true,
      placeHolder: 'Select services to configure',
      title: 'Configure Services',
    }
  );

  if (!services || services.length === 0) {
    return;
  }

  const serviceIds = services.map(s => (s as { id: string }).id);

  // Configure Azure OpenAI
  if (serviceIds.includes('ai')) {
    const success = await configureAzureOpenAI();
    if (!success) {
      return;
    }
  }

  // Configure Cosmos DB
  if (serviceIds.includes('cosmos')) {
    const success = await configureCosmosDB();
    if (!success) {
      return;
    }
  }

  // Configure Blob Storage
  if (serviceIds.includes('blob')) {
    const success = await configureBlobStorage();
    if (!success) {
      return;
    }
  }

  vscode.window.showInformationMessage('HiLo Translator: Configuration saved successfully!');
}

/**
 * Configure Azure OpenAI settings
 */
async function configureAzureOpenAI(): Promise<boolean> {
  // API Endpoint
  const currentEndpoint = await getSecret(SecretKey.ApiEndpoint);
  const endpoint = await vscode.window.showInputBox({
    title: 'Azure OpenAI Endpoint (1/4)',
    prompt: 'Enter your Azure OpenAI endpoint URL',
    placeHolder: 'https://your-resource.openai.azure.com/',
    value: currentEndpoint || '',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value) {
        return 'Endpoint is required';
      }
      if (!value.startsWith('https://')) {
        return 'Endpoint must start with https://';
      }
      return null;
    },
  });

  if (endpoint === undefined) {
    return false; // User cancelled
  }

  // API Key
  const currentKey = await getSecret(SecretKey.ApiKey);
  const apiKey = await vscode.window.showInputBox({
    title: 'Azure OpenAI API Key (2/4)',
    prompt: 'Enter your Azure OpenAI API key',
    placeHolder: 'Your API key',
    value: currentKey || '',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value) {
        return 'API key is required';
      }
      return null;
    },
  });

  if (apiKey === undefined) {
    return false;
  }

  // Deployment name
  const currentDeployment = await getSecret(SecretKey.Deployment);
  const deployment = await vscode.window.showInputBox({
    title: 'Deployment Name (3/4)',
    prompt: 'Enter your model deployment name',
    placeHolder: 'gpt-4o',
    value: currentDeployment || 'gpt-4o',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value) {
        return 'Deployment name is required';
      }
      return null;
    },
  });

  if (deployment === undefined) {
    return false;
  }

  // API Version
  const currentVersion = await getSecret(SecretKey.ApiVersion);
  const apiVersion = await vscode.window.showInputBox({
    title: 'API Version (4/4)',
    prompt: 'Enter the API version',
    placeHolder: '2024-12-01-preview',
    value: currentVersion || '2024-12-01-preview',
    ignoreFocusOut: true,
  });

  if (apiVersion === undefined) {
    return false;
  }

  // Save all Azure OpenAI settings
  await setSecret(SecretKey.ApiEndpoint, endpoint);
  await setSecret(SecretKey.ApiKey, apiKey);
  await setSecret(SecretKey.Deployment, deployment);
  await setSecret(SecretKey.ApiVersion, apiVersion || '2024-12-01-preview');

  return true;
}

/**
 * Configure Cosmos DB settings
 */
async function configureCosmosDB(): Promise<boolean> {
  // Cosmos Endpoint
  const currentEndpoint = await getSecret(SecretKey.CosmosEndpoint);
  const endpoint = await vscode.window.showInputBox({
    title: 'Cosmos DB Endpoint (1/2)',
    prompt: 'Enter your Azure Cosmos DB endpoint URL',
    placeHolder: 'https://your-account.documents.azure.com:443/',
    value: currentEndpoint || '',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value) {
        return 'Endpoint is required';
      }
      if (!value.startsWith('https://')) {
        return 'Endpoint must start with https://';
      }
      return null;
    },
  });

  if (endpoint === undefined) {
    return false;
  }

  // Cosmos Key
  const currentKey = await getSecret(SecretKey.CosmosKey);
  const cosmosKey = await vscode.window.showInputBox({
    title: 'Cosmos DB Key (2/2)',
    prompt: 'Enter your Azure Cosmos DB account key',
    placeHolder: 'Your Cosmos DB key',
    value: currentKey || '',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value) {
        return 'Cosmos DB key is required';
      }
      return null;
    },
  });

  if (cosmosKey === undefined) {
    return false;
  }

  // Save Cosmos DB settings
  await setSecret(SecretKey.CosmosEndpoint, endpoint);
  await setSecret(SecretKey.CosmosKey, cosmosKey);

  return true;
}

/**
 * Configure Blob Storage settings
 */
async function configureBlobStorage(): Promise<boolean> {
  const currentUrl = await getSecret(SecretKey.UploadUrl);
  const uploadUrl = await vscode.window.showInputBox({
    title: 'Blob Storage SAS URL',
    prompt: 'Enter your Azure Blob Storage SAS URL for uploads',
    placeHolder: 'https://your-storage.blob.core.windows.net/container?sv=...',
    value: currentUrl || '',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value) {
        return 'SAS URL is required';
      }
      if (!value.startsWith('https://') || !value.includes('blob.core.windows.net')) {
        return 'Please enter a valid Azure Blob Storage SAS URL';
      }
      return null;
    },
  });

  if (uploadUrl === undefined) {
    return false;
  }

  await setSecret(SecretKey.UploadUrl, uploadUrl);
  return true;
}

/**
 * Show first-run setup prompt if not configured
 */
export async function checkFirstRunSetup(): Promise<void> {
  const isConfigured = await isAIConfigured();

  if (!isConfigured) {
    const action = await vscode.window.showInformationMessage(
      'HiLo Translator needs to be configured before use.',
      'Setup Now',
      'Later'
    );

    if (action === 'Setup Now') {
      await runSetupCommand();
    }
  }
}

/**
 * Show configuration status
 */
export async function showConfigStatus(): Promise<void> {
  const aiConfigured = await isAIConfigured();
  const cosmosConfigured = await isCosmosConfigured();

  const status = [
    `Azure OpenAI: ${aiConfigured ? 'Configured' : 'Not configured'}`,
    `Cosmos DB: ${cosmosConfigured ? 'Configured' : 'Not configured'}`,
  ].join('\n');

  const action = await vscode.window.showInformationMessage(
    status,
    'Reconfigure'
  );

  if (action === 'Reconfigure') {
    await runSetupCommand();
  }
}
