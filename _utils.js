import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY || "";
}

export function getModelCandidates() {
  return [
    process.env.OPENAI_MODEL,
    "gpt-5-mini",
    "gpt-4o-mini"
  ].filter((model, index, models) => model && models.indexOf(model) === index);
}

export async function createResponseWithFallback(openai, payload) {
  let lastError = null;

  for (const model of getModelCandidates()) {
    try {
      const response = await openai.responses.create({ ...payload, model });
      return { response, model };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export function parseJsonText(text = "{}") {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error("AI JSON yaniti okunamadi.");
  }
}

async function getOpenRouterFreeModels({ image = false } = {}) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models");

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.data || [])
      .filter((model) => {
        const isFree = model.id?.endsWith(":free");
        const modalities = model.architecture?.input_modalities || [];
        return isFree && (!image || modalities.includes("image"));
      })
      .map((model) => model.id)
      .slice(0, 12);
  } catch {
    return [];
  }
}

async function requestOpenRouterJson({ apiKey, model, system, content }) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://savoraai.com",
      "X-Title": "SavoraAI"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${system}\nReturn only valid JSON. Do not add markdown.` },
        { role: "user", content }
      ],
      temperature: 0.2
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || data.message || "Ucretsiz AI saglayicisi yanit vermedi.");
  }

  const text = data.choices?.[0]?.message?.content || "{}";
  return {
    parsed: parseJsonText(text),
    model: data.model || model,
    provider: "openrouter-free"
  };
}

export async function createFreeAiJson({ system, user, image = "" }) {
  const apiKey = getOpenRouterKey();

  if (!apiKey) {
    return null;
  }

  const content = image
    ? [
        { type: "text", text: user },
        { type: "image_url", image_url: { url: image } }
      ]
    : user;

  const dynamicFreeModels = await getOpenRouterFreeModels({ image: Boolean(image) });
  const models = [
    process.env.OPENROUTER_MODEL,
    "openrouter/free",
    ...dynamicFreeModels
  ].filter((model, index, list) => model && list.indexOf(model) === index);

  let lastError = null;

  for (const model of models) {
    try {
      return await requestOpenRouterJson({ apiKey, model, system, content });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Ucretsiz AI modelleri su anda yanit vermedi.");
}

export function getSupabaseAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function searchWeb(query) {
  if (!process.env.TAVILY_API_KEY || !query) {
    return [];
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`
    },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      max_results: 5,
      include_answer: false
    })
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return (data.results || []).map((result) => ({
    title: result.title,
    url: result.url,
    content: result.content
  }));
}

export function fallbackModeration(text = "") {
  const lowered = text.toLocaleLowerCase("tr-TR");
  const rules = [
    { type: "Hakaret / taciz", words: ["aptal", "salak", "gerizekali", "pislik"] },
    { type: "Tehdit", words: ["oldururum", "gebertirim", "seni bitiririm", "tehdit"] },
    { type: "Cinsel icerik", words: ["porn", "porno", "ciplak", "cinsel"] },
    { type: "Nefret soylemi", words: ["irkci", "nefret", "defolun"] },
    { type: "Spam / dolandiricilik", words: ["bedava para", "kesin kazanc", "iban gonder", "tikla kazan"] }
  ];
  const match = rules.find((rule) => rule.words.some((word) => lowered.includes(word)));

  if (!match) {
    return {
      blocked: false,
      reason: "Temiz",
      message: "Icerik topluluk kurallarina uygun gorunuyor."
    };
  }

  return {
    blocked: true,
    reason: match.type,
    message: `Bu icerik ${match.type.toLocaleLowerCase("tr-TR")} riski tasidigi icin yayinlanmadi.`
  };
}
