const { callLLM } = require("./llm");

const CHUNK_SIZE = 1000;
const MAX_CLAIMS = 10;

const EXTRACT_PROMPT = `Extract only specific, independently verifiable factual claims \
from this text. Skip opinions, feelings, and vague statements. \
Return ONLY a valid JSON array of strings, no explanation, no markdown, no backticks.`;

/**
 * Split text into chunks of at most CHUNK_SIZE characters,
 * preferring to break at sentence boundaries (. ! ?).
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoChunks(text) {
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + CHUNK_SIZE;

    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }

    // Walk backwards to find the nearest sentence-ending punctuation
    let breakPoint = -1;
    for (let i = end; i > start; i--) {
      if (".!?".includes(text[i])) {
        breakPoint = i + 1; // include the punctuation
        break;
      }
    }

    // If no sentence boundary found, hard-cut at CHUNK_SIZE
    end = breakPoint !== -1 ? breakPoint : end;
    chunks.push(text.slice(start, end).trim());
    start = end;
  }

  return chunks.filter(Boolean);
}

/**
 * Ask the LLM to extract factual claims from a single chunk.
 * Returns an array of claim strings (empty array on parse failure).
 *
 * @param {string} chunk
 * @returns {Promise<string[]>}
 */
async function extractClaimsFromChunk(chunk) {
  const prompt = `${EXTRACT_PROMPT}\n\nText:\n${chunk}`;
  const raw = await callLLM(prompt);

  try {
    // Strip any accidental markdown fences the model may still emit
    const cleaned = raw.replace(/```[a-z]*\n?/gi, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((c) => typeof c === "string" && c.trim().length > 0);
    }
  } catch {
    console.warn("extractor: failed to parse LLM response as JSON:", raw);
  }

  return [];
}

/**
 * Score a claim by specificity (longer + contains numbers/proper nouns = higher).
 * Used to rank claims when capping at MAX_CLAIMS.
 *
 * @param {string} claim
 * @returns {number}
 */
function specificityScore(claim) {
  let score = claim.length; // longer tends to be more specific
  if (/\d/.test(claim)) score += 50; // contains numbers
  if (/[A-Z]/.test(claim.slice(1))) score += 20; // contains proper nouns
  return score;
}

/**
 * Extract specific, verifiable factual claims from the given text.
 *
 * Steps:
 *  1. Split long text into sentence-aware chunks of 1 000 chars.
 *  2. Run LLM extraction on each chunk in parallel.
 *  3. Merge results and remove exact duplicates (case-insensitive).
 *  4. Filter out obvious opinions / vague statements.
 *  5. Cap at MAX_CLAIMS, keeping the most specific ones.
 *
 * @param {string} text
 * @returns {Promise<string[]>}
 */
async function extractClaims(text) {
  if (!text || !text.trim()) return [];

  // 1. Chunk
  const chunks = splitIntoChunks(text.trim());

  // 2. Extract per chunk (parallel)
  const perChunkClaims = await Promise.all(
    chunks.map((chunk) => extractClaimsFromChunk(chunk))
  );

  // 3. Merge & deduplicate (case-insensitive)
  const seen = new Set();
  const merged = [];
  for (const claims of perChunkClaims) {
    for (const claim of claims) {
      const key = claim.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(claim.trim());
      }
    }
  }

  // 4. Filter opinions / vague language
  const OPINION_PATTERNS = [
    /\b(i think|i believe|in my opinion|it seems|it appears|maybe|perhaps|probably|might|could be|i feel|some say|many believe|people think)\b/i,
    /\b(good|bad|great|terrible|best|worst|wonderful|awful|beautiful|ugly|amazing|horrible)\b/i,
    /\b(should|ought to|must|need to)\b/i, // normative claims
  ];

  const VAGUE_PATTERNS = [
    /^.{0,15}$/, // suspiciously short
    /\b(something|somehow|somewhere|someone|anyone|everything|nothing)\b/i,
    /\b(a lot|many|some|few|most|often|usually|sometimes|rarely)\b/i,
  ];

  const filtered = merged.filter((claim) => {
    const isOpinion = OPINION_PATTERNS.some((re) => re.test(claim));
    const isVague = VAGUE_PATTERNS.some((re) => re.test(claim));
    return !isOpinion && !isVague;
  });

  // 5. Cap at MAX_CLAIMS by specificity score
  const sorted = filtered.sort(
    (a, b) => specificityScore(b) - specificityScore(a)
  );
  return sorted.slice(0, MAX_CLAIMS);
}

module.exports = { extractClaims };
