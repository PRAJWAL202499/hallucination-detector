const axios = require("axios");

const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Tried in order — each has its own free-tier quota bucket
const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"];

/**
 * Call Google Gemini Flash API.
 * @param {string} prompt
 * @returns {Promise<string>} Generated text response.
 */
async function callGemini(prompt) {
  let lastErr;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${process.env.GEMINI_KEY}`;
      const res = await axios.post(
        url,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" }, timeout: 30_000 }
      );

      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error(`Empty response from ${model}`);
      return text;
    } catch (err) {
      const status = err.response?.status;
      // Only continue to next model on quota/rate-limit errors
      if (status === 429 || status === 503) {
        console.warn(`Gemini model ${model} quota hit (${status}), trying next…`);
        lastErr = err;
        continue;
      }
      throw err; // surface auth/bad-request errors immediately
    }
  }

  throw lastErr; // all Gemini models exhausted
}

/**
 * Fallback: Call Groq (llama-3.3-70b-versatile) via its OpenAI-compatible API.
 * @param {string} prompt
 * @returns {Promise<string>} Generated text response.
 */
async function callGroq(prompt) {
  const res = await axios.post(
    GROQ_API_URL,
    {
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_KEY}`,
      },
      timeout: 30_000,
    }
  );

  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from Groq");
  return text;
}

/**
 * Call an LLM with the given prompt.
 * Tries Groq (Llama) first; falls back to Gemini on failure.
 *
 * @param {string} prompt
 * @returns {Promise<string>} The LLM's text response.
 */
async function callLLM(prompt) {
  try {
    return await callGroq(prompt);
  } catch (err) {
    const status = err.response?.status;
    console.warn(
      `Groq failed (${status ?? err.message}). Falling back to Gemini…`
    );
    return await callGemini(prompt);
  }
}

module.exports = { callLLM };
