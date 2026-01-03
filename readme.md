# HiLo Translator for Business Central

AI-powered XLIFF translation extension for Microsoft Dynamics 365 Business Central localization workflows.

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/forey-apps.HiLo-case)](https://marketplace.visualstudio.com/items?itemName=forey-apps.HiLo-case)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

HiLo Translator streamlines the localization process for Business Central applications by providing:

- **AI-Powered Translation** using Azure OpenAI GPT-4o
- **Intelligent Caching** with Azure Cosmos DB to reduce costs and improve consistency
- **XLIFF File Support** for standard Business Central translation workflows
- **Confidence Scoring** to identify translations that may need review
- **Case Correction Tools** for AL code formatting

## Features

### AI Translation

Translate XLIFF files using Azure OpenAI with Business Central-specific prompts for accurate terminology.

- Batch translate entire XLIFF files
- Translate individual units with cursor selection (`Alt+R`)
- Multiple translation options for ambiguous phrases
- Confidence scores based on AI token probabilities

### Smart Caching

Three-tier caching strategy minimizes API costs and ensures consistency:

1. **File Cache** - Reuses existing translations from the open document
2. **Database Cache** - Queries Azure Cosmos DB for exact matches
3. **AI Translation** - Calls Azure OpenAI only when no cache hit

### Case Correction

Maintain consistent casing in AL code with configurable reference lists.

- Convert selected text to lowercase
- Apply case corrections across entire documents
- Build custom reference lists for your coding standards

### Export Capabilities

- Export translations to JSON dictionary files
- Upload to Azure Blob Storage
- Store in Azure Cosmos DB with full metadata

## Requirements

- Visual Studio Code 1.74.0 or higher
- Azure OpenAI Service subscription (for AI translation)
- Azure Cosmos DB account (optional, for caching)
- Azure Blob Storage (optional, for export uploads)

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "HiLo Translator"
4. Click **Install**

### From VSIX File

1. Download the `.vsix` file from [Releases](https://github.com/JosefFryk/ALHiLoExtension/releases)
2. Open VS Code
3. Go to Extensions (`Ctrl+Shift+X`)
4. Click the `...` menu and select **Install from VSIX...**
5. Select the downloaded file

## Getting Started

### Initial Setup

On first launch, HiLo Translator will prompt you to configure your API keys.

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run **HiLo: Configure API Keys**
3. Choose **Enter My Own Keys** or **Use Company Keys**
4. Follow the prompts to enter your credentials

### Configuration Options

| Service | Required | Description |
|---------|----------|-------------|
| Azure OpenAI | Yes | Required for AI translation |
| Azure Cosmos DB | No | Enables translation caching |
| Azure Blob Storage | No | Enables export uploads |

### Azure OpenAI Setup

To use AI translation, you need an Azure OpenAI Service resource:

1. Create an [Azure OpenAI Service](https://portal.azure.com/#create/Microsoft.CognitiveServicesOpenAI) resource in Azure Portal
2. Deploy a GPT-4o model (or compatible model)
3. Copy your endpoint URL and API key from the Azure Portal
4. Run **HiLo: Configure API Keys** in VS Code and enter your credentials

**Required information:**
- Endpoint URL (e.g., `https://your-resource.openai.azure.com/`)
- API Key
- Deployment name (e.g., `gpt-4o`)
- API Version (e.g., `2024-12-01-preview`)

## Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| **Translate by AI** | - | Translate all pending units in XLIFF file |
| **Translate Selected Text with AI** | `Alt+R` | Translate unit under cursor |
| **Convert to Lowercase** | `Ctrl+Alt+L` | Convert selection to lowercase |
| **Correct Case in Document** | - | Apply case corrections from reference list |
| **Add Word to Reference List** | `Ctrl+Alt+T` | Add word to case correction dictionary |
| **Export Translations from XLIFF to JSON** | - | Export translations to JSON file |
| **Export Translations to Azure Cosmos DB** | - | Upload translations to database |
| **HiLo: Configure API Keys** | - | Open setup wizard |
| **HiLo: Show Configuration Status** | - | View current configuration |

## Usage

### Translating XLIFF Files

#### Batch Translation

1. Open your `.xliff` file in VS Code
2. Open Command Palette (`Ctrl+Shift+P`)
3. Run **Translate by AI**
4. Wait for the progress bar to complete

The extension will:
- Find all `<trans-unit>` elements with `state="needs-translation"`
- Check for existing translations in the file and database
- Call Azure OpenAI for uncached translations
- Update the file with translations and confidence scores

#### Single Unit Translation

1. Place cursor inside a `<trans-unit>` element
2. Press `Alt+R` or run **Translate Selected Text with AI**
3. If existing translations are found, choose one or request AI proposals
4. Select from the translation options

### Understanding Confidence Scores

Translations include a confidence score (0.0 - 1.0):

| Score | Meaning | Action |
|-------|---------|--------|
| 0.90+ | High confidence | Usually accurate |
| 0.70 - 0.89 | Medium confidence | Review recommended |
| < 0.70 | Low confidence | Manual review required |

Low-confidence translations automatically trigger a second AI call with fuzzy examples from the database for improved accuracy.

### Case Correction

#### Setting Up Reference List

1. Select a word with incorrect casing
2. Press `Ctrl+Alt+T`
3. Enter the original word and correct casing
4. The word is added to your global reference list

#### Applying Corrections

1. Open an AL file
2. Run **Correct Case in Document**
3. All words matching your reference list are corrected

### Exporting Translations

#### Export to JSON

1. Run **Export Translations from XLIFF to JSON**
2. Select your translated `.xliff` file
3. A `.json` file is created in the same directory
4. Optionally upload to Azure Blob Storage

#### Export to Cosmos DB

1. Run **Export Translations to Azure Cosmos DB**
2. Select translation type (Microsoft, OurDB, AITranslated, None)
3. Select your translated `.xliff` file
4. Translations are uploaded with metadata

## Extension Settings

Configure these settings in VS Code Settings (`Ctrl+,`):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `caseCorrector.referenceList` | object | See below | Word mappings for case correction |
| `hiloTranslate.enableUpload` | boolean | `true` | Auto-upload JSON exports to Blob Storage |

### Default Reference List

```json
{
  "FindSet()": "Findset()",
  "begin": "begin",
  "end": "end",
  "if": "if",
  "else": "else",
  "then": "then",
  "var": "var",
  "not": "not",
  "repeat": "repeat",
  "until": "until"
}
```

## Security

### Credential Storage

All API keys and secrets are stored using VS Code's [SecretStorage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage), which provides:

- Encrypted storage on the local machine
- Isolation from other extensions
- No plain-text exposure in settings files
- Credentials are never committed to source control

### Best Practices

- Never commit API keys to version control
- Use separate Azure resources for development and production
- Rotate API keys periodically
- Review Cosmos DB access policies
- Use the principle of least privilege for Azure service principals

## Cosmos DB Schema

When storing translations in Cosmos DB, the following schema is used:

```json
{
  "id": "Page123-Property456",
  "source": "E-shop Setup Card",
  "target": "Karta nastaveni e-shopu",
  "sourceLang": "en",
  "targetLang": "cs",
  "confidence": 0.92,
  "translationType": "AITranslated",
  "sourceDatabase": "MyAppModule",
  "timestamp": "2025-05-02T14:00:00Z"
}
```

- Containers are auto-created per `sourceDatabase` value
- Partition key is the `source` field
- ID is taken from the `<trans-unit id="...">` attribute
- Duplicate detection is handled via Cosmos DB `id` uniqueness

## Troubleshooting

### Common Issues

#### "HiLo Translator is not configured"

Run **HiLo: Configure API Keys** to set up your credentials.

#### "Translation failed: model loading"

Azure OpenAI is warming up the model. The extension will automatically retry.

#### "Cosmos DB configuration is missing"

Cosmos DB is optional. Translations will work without it, but caching is disabled.

#### Translations have low confidence

- Verify the source language is correct
- Check if the phrase contains domain-specific terminology
- Consider adding reference translations to your Cosmos DB

#### Connection errors

- Verify your Azure endpoints are correct
- Check that your API keys are valid and not expired
- Ensure your Azure services are running and accessible

### Logs and Diagnostics

1. Open Output panel (`Ctrl+Shift+U`)
2. Select **HiLo Translate** from the dropdown
3. View translation logs, API usage, and cost estimates

## Cost Estimation

The extension tracks API usage and provides cost estimates:

| Service | Estimated Cost |
|---------|----------------|
| Azure OpenAI GPT-4o | ~$0.01 per 1000 tokens |
| Azure Cosmos DB | ~$0.008 per 1000 RU |

View usage statistics in the **HiLo Translate** output channel.

## Architecture

```
src/
├── extension.ts                  # Extension entry point
├── setup/
│   ├── configurationManager.ts   # SecretStorage management
│   └── setupCommand.ts           # Setup wizard
├── commands/
│   ├── translationCommands.ts    # AI translation commands
│   ├── textCorrectionCommands.ts # Case correction commands
│   ├── exportTranslationDictionary.ts
│   └── exportTranslationToDB.ts
├── xliff/
│   ├── xliff-handler.ts          # XLIFF parsing
│   ├── fileTranslationHandler.ts # File-based lookups
│   └── dbHandlers.ts             # Cosmos DB queries
└── models/
    ├── translation.ts            # AI translation logic
    ├── usageLoger.ts             # Cost tracking
    └── confidenceAnalyzer.ts     # Confidence scoring
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/JosefFryk/ALHiLoExtension.git
cd ALHiLoExtension

# Install dependencies
npm install

# Compile
npm run compile

# Run in development
# Press F5 in VS Code to launch Extension Development Host
```

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for full version history.

### 0.1.8 (Latest)

- Added secure credential storage using VS Code SecretStorage
- New setup wizard for API key configuration
- First-run detection with setup prompt
- Improved confidence calculation algorithm
- Removed hardcoded credentials from settings

### 0.1.7

- Fixed version deployment issues
- Production testing improvements

### 0.1.6

- Implemented database search functionality
- Added cost usage tracking
- Prompt examples from database to AI

## Roadmap

- [ ] Dry-run/test mode for exports
- [ ] Backfill database from legacy `.xliff` files
- [ ] Export translations from DB back into `.xliff` format
- [ ] Language support toggle in settings
- [ ] Batch operations with parallel processing

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/JosefFryk/ALHiLoExtension/issues)
- **Discussions**: [GitHub Discussions](https://github.com/JosefFryk/ALHiLoExtension/discussions)
- **Repository**: [GitHub](https://github.com/JosefFryk/ALHiLoExtension)

---

**Publisher**: [forey-apps](https://github.com/JosefFryk)

Made for the Business Central community
