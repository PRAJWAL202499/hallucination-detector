const { callLLM } = require("./llm");

const FALLBACK = {
  verdict: "NOT_ADDRESS",
  type: null,
  confidence: 0,
  reasoning: "No sources found",
};

const PARSE_FAIL = {
  verdict: "NOT_ADDRESS",
  type: null,
  confidence: 0,
  reasoning: "Could not parse LLM response",
};

/**
 * Build the prompt sent to the LLM for verdict scoring.
 *
 * @param {string} claim
 * @param {Array<{ title: string, url: string, snippet: string }>} searchResults
 * @returns {string}
 */
function buildPrompt(claim, searchResults) {
  const sources = searchResults
    .map((r, i) => `[${i + 1}] ${r.snippet} (${r.url})`)
    .join("\n");

  return `You are a fact-checking assistant. Given a claim and web search results, determine whether the sources support, contradict, or do not address the claim.

Claim: "${claim}"

Search Results:
${sources}

Respond ONLY with valid JSON — no markdown, no backticks, no explanation:
{
  "verdict": "SUPPORT" | "CONTRADICT" | "NOT_ADDRESS",
  "type": "Temporal Drift" | "Entity Confusion" | "Citation Fabrication" | "Statistical Distortion" | "Complete Fabrication" | null,
  "confidence": <integer 0-100>,
  "reasoning": "<one sentence explanation>"
}

Rules:
- verdict "SUPPORT": sources clearly confirm the claim
- verdict "CONTRADICT": sources clearly refute the claim — set "type" to the most fitting hallucination category
- verdict "NOT_ADDRESS": sources do not have enough information
- "type" must be null when verdict is "SUPPORT" or "NOT_ADDRESS"
- confidence reflects how certain the evidence is (0 = none, 100 = definitive)`;
}

/**
 * Score a factual claim against web search results using an LLM.
 *
 * @param {string} claim
 * @param {Array<{ title: string, url: string, snippet: string }>} searchResults
 * @returns {Promise<{
 *   verdict: "SUPPORT"|"CONTRADICT"|"NOT_ADDRESS",
 *   type: string|null,
 *   confidence: number,
 *   reasoning: string
 * }>}
 */
async function scoreVerdict(claim, searchResults) {
  // 1. No sources — return fallback immediately
  if (!searchResults || searchResults.length === 0) {
    return FALLBACK;
  }

  // 2. Build prompt and call LLM
  const prompt = buildPrompt(claim, searchResults);
  const raw = await callLLM(prompt);

  // 3. Strip markdown code fences the model may still emit
  const cleaned = raw
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .trim();

  // 4. Parse JSON safely
  try {
    const parsed = JSON.parse(cleaned);

    const validVerdicts = ["SUPPORT", "CONTRADICT", "NOT_ADDRESS"];
    const validTypes = [
      "Temporal Drift",
      "Entity Confusion",
      "Citation Fabrication",
      "Statistical Distortion",
      "Complete Fabrication",
      null,
    ];

    return {
      verdict: validVerdicts.includes(parsed.verdict)
        ? parsed.verdict
        : "NOT_ADDRESS",
      type: validTypes.includes(parsed.type) ? parsed.type : null,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(100, Math.max(0, Math.round(parsed.confidence)))
          : 0,
      reasoning:
        typeof parsed.reasoning === "string"
          ? parsed.reasoning
          : "No reasoning provided",
    };
  } catch {
    console.warn("verdict: failed to parse LLM response:", raw);
    return PARSE_FAIL;
  }
}

module.exports = { scoreVerdict };
