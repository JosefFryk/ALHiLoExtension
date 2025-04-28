const API_TOKEN = 'YOUR_HUGGING_FACE_API_TOKEN';
const MODEL = 'Xenova/m2m100_418M'; // Replace with your model

export async function translateText(text: string, srcLang: string = 'en', tgtLang: string = 'cs'): Promise<string> {
  try {
    const response = await fetch(`https://api-inference.huggingface.co/models/${MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          src_lang: srcLang,
          tgt_lang: tgtLang,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error: string };
      throw new Error(error.error || 'Error from Hugging Face API');
    }

    const result = await response.json() as [{ translation_text: string }];
    return result[0].translation_text;

  } catch (error: any) {
    throw new Error(`Translation API failed: ${error.message || error}`);
  }
}