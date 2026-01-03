# Changelog

All notable changes to the HiLo Translator extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Dry-run/test mode for exports
- Backfill database from legacy `.xliff` files
- Export translations from DB back into `.xliff` format
- Language support toggle in settings
- Batch operations with parallel processing

## [0.1.8] - 2025-01-02

### Added
- **Secure Credential Storage**: All API keys now stored using VS Code's SecretStorage API
- **Setup Wizard**: New `HiLo: Configure API Keys` command with guided prompts
- **First-Run Detection**: Automatic setup prompt when extension is not configured
- **Configuration Status**: New `HiLo: Show Configuration Status` command

### Changed
- Improved confidence calculation algorithm (weighted average + minimum probability)
- Removed all hardcoded credentials from `package.json`
- Azure OpenAI, Cosmos DB, and Blob Storage credentials now managed through SecretStorage
- Better error handling with typed error objects

### Fixed
- Confidence score now uses combined calculation instead of just minimum probability
- Type safety improvements across the codebase

### Security
- API keys no longer stored in plain text settings
- Credentials encrypted using VS Code's native secret storage

## [0.1.7] - 2024-12-12

### Fixed
- Version deployment issues
- Production testing improvements

## [0.1.6] - 2024-12-12

### Added
- Database search functionality for existing translations
- Cost usage tracking and estimation
- Prompt enrichment with examples from database

### Changed
- Improved AI prompts with fuzzy examples for low-confidence translations

## [0.1.5] - 2024-06-22

### Added
- Selection-based translation (`Alt+R` keybinding)
- Multiple translation options for ambiguous phrases

### Changed
- Development version for testing improvements

## [0.1.4] - 2024-06-22

### Fixed
- Production stability improvements
- Tested and verified in production environment

## [0.1.3] - 2024-06-03

### Added
- Initial public release
- AI-powered XLIFF translation using Azure OpenAI
- Cosmos DB integration for translation caching
- Export to JSON dictionary
- Upload to Azure Blob Storage
- Case correction tools for AL code
- Confidence scoring for translations
- Progress bar UI for batch operations

### Features
- Translate XLIFF files using Azure OpenAI GPT-4o
- Check for existing translations in Cosmos DB before AI calls
- Import translated XLIFF files and export as JSON
- Store translations with metadata in Cosmos DB
- Auto-create Cosmos DB containers per translation source
- Prevent duplicate inserts using ID-based logic

## [0.1.0] - 2024-05-01

### Added
- Initial development version
- Basic case correction functionality
- Reference list management

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 0.1.8 | 2025-01-02 | Secure credential storage, setup wizard |
| 0.1.7 | 2024-12-12 | Production fixes |
| 0.1.6 | 2024-12-12 | Database search, cost tracking |
| 0.1.5 | 2024-06-22 | Selection-based translation |
| 0.1.4 | 2024-06-22 | Production stability |
| 0.1.3 | 2024-06-03 | Initial public release |

[Unreleased]: https://github.com/JosefFryk/ALHiLoExtension/compare/v0.1.8...HEAD
[0.1.8]: https://github.com/JosefFryk/ALHiLoExtension/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/JosefFryk/ALHiLoExtension/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/JosefFryk/ALHiLoExtension/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/JosefFryk/ALHiLoExtension/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/JosefFryk/ALHiLoExtension/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/JosefFryk/ALHiLoExtension/releases/tag/v0.1.3
