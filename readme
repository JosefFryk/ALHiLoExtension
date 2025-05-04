# AL HiLo Translation Extension for VS Code

This extension provides AI-powered and database-assisted translation tools for Business Central XLIFF localization files. It integrates with Azure OpenAI and Cosmos DB to provide fast, reliable, and context-aware translations.

## ✅ Features Implemented

* 🔄 **Translate XLIFF files** using Azure OpenAI GPT (with Business Central-specific prompts)
* 🔍 **Check for existing translations** in Cosmos DB before calling the AI
* 📁 **Import translated XLIFF files** and export as structured `.json` dictionaries
* ☁️ **Upload translation dictionaries** to Azure Blob Storage (optional)
* 🧠 **Store translations** in Azure Cosmos DB with metadata:

  * `id` from XLIFF `<trans-unit>`
  * `source`, `target`, `sourceLang`, `targetLang`
  * `translationType` (e.g. Microsoft, AITranslated)
  * `sourceDatabase` from the XLIFF `<file original="...">`
  * `confidence` level
* 🚫 Prevent duplicate inserts using `id`-based logic
* 📦 Auto-creates Cosmos DB containers per translation source
* 📊 Progress bar UI for long-running operations
* 📎 VS Code settings for OpenAI, Blob, and Cosmos credentials

---

## 🔜 Roadmap

* [ ] 🔄 **Pre-fill translations** from Cosmos DB before sending to AI
* [ ] 📉 **Estimate token/cost usage** when translating via Azure OpenAI
* [ ] 💬 Add **confidence scoring & fallback logic** for AI-generated translations
* [ ] 🔍 Add **search command** to lookup existing translations
* [ ] 🧪 Add **dry-run/test mode** for exports
* [ ] 📥 **Backfill database** from legacy `.xliff` files
* [ ] 📦 Export translations from DB back into `.xliff` format
* [ ] 🛡️ Optional encryption or secure storage of keys
* [ ] 🌍 Add language support toggle in settings
* [ ] 🖊️ **Translate only user-selected text** instead of entire file  
* [ ] 🧮 **Add `confidence` attribute to translated `<target>` tags** based on AI or DB value
---

## 🔧 Configuration Settings (`package.json`)

```json
"hiloTranslate.apiKey": "<Azure OpenAI API key>",
"hiloTranslate.apiEndpoint": "https://<your-endpoint>.openai.azure.com/",
"hiloTranslate.modelName": "gpt-4o",
"hiloTranslate.deployment": "gpt-4o",
"hiloTranslate.apiVersion": "2024-04-01-preview",
"hiloTranslate.uploadUrl": "<SAS Blob URL>",
"hiloTranslate.enableUpload": true,
"hiloTranslate.cosmosEndpoint": "<Cosmos DB URI>",
"hiloTranslate.cosmosKey": "<Cosmos DB Key>"
```

---

## 🧠 AI Prompt Example

The prompt sent to Azure OpenAI is tailored for Business Central:

```
You are a Business Central translator. Please translate the following text to [targetLang], keeping correct terminology and formatting:
"[text]"
```

---

## 🗃️ Cosmos DB Schema Example

```json
{
  "id": "Page123-Property456",
  "source": "E-shop Setup Card",
  "target": "Karta nastavení e-shopu",
  "sourceLang": "en",
  "targetLang": "cs",
  "confidence": 0.9,
  "translationType": "OurDB",
  "sourceDatabase": "MyAppModule",
  "timestamp": "2025-05-02T14:00:00Z",
  "partitionKey": "en::E-shop Setup Card"
}
```

---

## 🚀 Getting Started

1. Open `.xliff` file in VS Code
2. Run `Translate XLIFF` from the command palette
3. Export your translated `.xliff` to Cosmos DB or Blob as needed

---

## 🧪 Developer Notes

* Cosmos DB containers are auto-created per `sourceDatabase` value
* Partition key is a composite: `sourceLang::source` (via a single `/partitionKey`)
* ID is taken from the `<trans-unit id="...">` attribute
* Duplicate detection is handled via Cosmos DB `id` uniqueness

---

