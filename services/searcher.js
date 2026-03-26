const axios = require("axios");

const SERPER_URL = "https://google.serper.dev/search";

/** Simple in-memory cache: query string → result array */
const cache = new Map();

/**
 * Search the web using Serper.dev (Google Search API).
 * Results are cached in memory for the lifetime of the process.
 *
 * @param {string} query
 * @returns {Promise<Array<{ title: string, url: string, snippet: string }>>}
 */
async function search(query) {
  if (!query || !query.trim()) return [];

  const key = query.trim().toLowerCase();

  // 1. Return cached result if available
  if (cache.has(key)) {
    return cache.get(key);
  }

  // 2. Call Serper.dev API
  try {
    const res = await axios.post(
      SERPER_URL,
      { q: query.trim(), num: 5 },
      {
        headers: {
          "X-API-KEY": process.env.SERPER_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15_000,
      }
    );

    const organic = res.data?.organic ?? [];

    // 3. Extract title, url, snippet
    const results = organic.map((item) => ({
      title: item.title ?? "",
      url: item.link ?? "",
      snippet: item.snippet ?? "",
    }));

    // 4. Cache before returning
    cache.set(key, results);
    return results;
  } catch (err) {
    console.warn(
      `searcher: Serper API failed for query "${query}" —`,
      err.response?.status ?? err.message
    );
    return [];
  }
}

module.exports = { search };
