export interface TokenLogProb {
  token: string;
  logprob: number;
}

export interface WordConfidence {
  word: string;
  confidence: number;
}

/**
 * Estimate word-level confidence from a list of tokens with logprobs.
 * Uses leading spaces to detect word boundaries (OpenAI tokenizer style).
 */
export function computeWordConfidences(tokens: TokenLogProb[], fullText: string): WordConfidence[] {
  const wordsWithConfidence: WordConfidence[] = [];

  let currentWord = '';
  let currentProbs: number[] = [];

  for (const tokenInfo of tokens) {
    const token = tokenInfo.token;
    const prob = typeof tokenInfo.logprob === 'number' ? Math.exp(tokenInfo.logprob) : 0.7;

    const startsNewWord = token.startsWith(' ') || currentWord === '';

    if (startsNewWord && currentWord) {
      const avgConfidence = currentProbs.reduce((a, b) => a + b, 0) / currentProbs.length;
      wordsWithConfidence.push({
        word: currentWord.trim(),
        confidence: parseFloat(avgConfidence.toFixed(2))
      });

      currentWord = token;
      currentProbs = [prob];
    } else {
      currentWord += token;
      currentProbs.push(prob);
    }
  }

  if (currentWord) {
    const avgConfidence = currentProbs.reduce((a, b) => a + b, 0) / currentProbs.length;
    wordsWithConfidence.push({
      word: currentWord.trim(),
      confidence: parseFloat(avgConfidence.toFixed(2))
    });
  }

  return wordsWithConfidence;
}