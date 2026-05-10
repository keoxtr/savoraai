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

    throw new Error("AI JSON yanıtı okunamadı.");
  }
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

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://savoraai.com",
      "X-Title": "SavoraAI"
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
      messages: [
        { role: "system", content: system },
        { role: "user", content }
      ],
      response_format: { type: "json_object" }
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || data.message || "Ücretsiz AI sağlayıcısı yanıt vermedi.");
  }

  const text = data.choices?.[0]?.message?.content || "{}";
  return {
    parsed: parseJsonText(text),
    model: data.model || process.env.OPENROUTER_MODEL || "openrouter/free",
    provider: "openrouter-free"
  };
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
    { type: "Hakaret / taciz", words: ["aptal", "salak", "gerizekalı", "pislik"] },
    { type: "Tehdit", words: ["öldürürüm", "gebertirim", "seni bitiririm", "tehdit"] },
    { type: "Cinsel içerik", words: ["porn", "porno", "çıplak", "cinsel"] },
    { type: "Nefret söylemi", words: ["ırkçı", "nefret", "defolun"] },
    { type: "Spam / dolandırıcılık", words: ["bedava para", "kesin kazanç", "iban gönder", "tıkla kazan"] }
  ];
  const match = rules.find((rule) => rule.words.some((word) => lowered.includes(word)));

  if (!match) {
    return {
      blocked: false,
      reason: "Temiz",
      message: "İçerik topluluk kurallarına uygun görünüyor."
    };
  }

  return {
    blocked: true,
    reason: match.type,
    message: `Bu içerik ${match.type.toLocaleLowerCase("tr-TR")} riski taşıdığı için yayınlanmadı.`
  };
}
