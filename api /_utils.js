
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
