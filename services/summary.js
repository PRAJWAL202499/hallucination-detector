/**
 * Aggregate an array of verdict objects into a summary report.
 *
 * @param {Array<{
 *   verdict: "SUPPORT"|"CONTRADICT"|"NOT_ADDRESS",
 *   type: string|null,
 *   confidence: number,
 *   reasoning: string
 * }>} verdicts
 * @returns {{
 *   trust_score: number,
 *   deception_gap: number,
 *   overall_label: "TRUSTWORTHY"|"MIXED"|"UNRELIABLE",
 *   hallucination_types: string[]
 * }}
 */
function summarize(verdicts) {
  if (!verdicts || verdicts.length === 0) {
    return {
      trust_score: 0,
      deception_gap: 0,
      overall_label: "UNRELIABLE",
      hallucination_types: [],
    };
  }

  const total = verdicts.length;

  // 1. trust_score — % of claims supported
  const supportCount = verdicts.filter((v) => v.verdict === "SUPPORT").length;
  const trust_score = Math.round((supportCount / total) * 100);

  // 2. deception_gap — avg confidence minus trust_score, floor at 0
  const avgConfidence =
    verdicts.reduce((sum, v) => sum + (v.confidence ?? 0), 0) / total;
  const deception_gap = Math.max(0, Math.round(avgConfidence - trust_score));

  // 3. overall_label
  let overall_label;
  if (trust_score >= 75) overall_label = "TRUSTWORTHY";
  else if (trust_score >= 45) overall_label = "MIXED";
  else overall_label = "UNRELIABLE";

  // 4. hallucination_types — unique non-null types
  const hallucination_types = [
    ...new Set(verdicts.map((v) => v.type).filter((t) => t !== null && t !== undefined)),
  ];

  return { trust_score, deception_gap, overall_label, hallucination_types };
}

module.exports = { summarize };
