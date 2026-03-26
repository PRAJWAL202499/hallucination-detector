const express = require("express");
const { extractClaims } = require("../services/extractor");
const { search } = require("../services/searcher");
const { scoreVerdict } = require("../services/verdict");
const { summarize } = require("../services/summary");

const router = express.Router();

router.post("/", async (req, res) => {
  const { text } = req.body;

  // 1. Validate input
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }

  try {
    // 2. Extract claims, cap at 5
    const allClaims = await extractClaims(text);
    const claims = allClaims.slice(0, 5);

    // 3. Search + score each claim sequentially with 500ms delay
    const claimResults = [];
    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      const searchResults = await search(claim);
      const { verdict, type, confidence, reasoning } = await scoreVerdict(
        claim,
        searchResults
      );
      const sources = searchResults.map((r) => r.url);
      claimResults.push({ claim, verdict, type, confidence, reasoning, sources });

      if (i < claims.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // 4. Summarize across all verdicts
    const summary = summarize(claimResults);

    // 5. Return final response
    return res.json({
      original_text: text,
      claims: claimResults,
      summary,
    });
  } catch (err) {
    console.error("verify route error:", err);
    return res.status(500).json({
      error: "Verification failed",
      details: err.message,
    });
  }
});

module.exports = router;
