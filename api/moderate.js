import {
  createFreeAiJson,
  createResponseWithFallback,
  fallbackModeration,
  getOpenAI,
  getOpenRouterKey,
  json,
  parseJsonText
} from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const { text = "" } = req.body || {};
  const fallback = fallbackModeration(text);
  const openai = getOpenAI();
  const hasFreeAi = Boolean(getOpenRouterKey());

  if (!openai && !hasFreeAi) {
    return json(res, 200, { ...fallback, provider: "local", configured: false });
  }

  const system = "Turkce sosyal medya icerigini Savora topluluk kurallarina gore degerlendir. Hakaret, tehdit, taciz, cinsel icerik, nefret soylemi, siddet cagrisi, kisisel veri ifsasi, spam ve dolandiricilik risklerini yakala. Sadece gecerli JSON dondur.";
  const user = `Icerik: ${text}\n\nJSON semasi: {"blocked":boolean,"reason":"Temiz|Hakaret / taciz|Tehdit|Cinsel icerik|Nefret soylemi|Siddet|Spam / dolandiricilik|Kisisel bilgi paylasimi|Diger","message":"kisa kullanici mesaji","risk":0-100}`;

  try {
    if (hasFreeAi) {
      const result = await createFreeAiJson({ system, user });
      return json(res, 200, { ...result.parsed, provider: result.provider, configured: true, model: result.model });
    }

    const { response, model } = await createResponseWithFallback(openai, {
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });
    const parsed = parseJsonText(response.output_text);
    return json(res, 200, { ...parsed, provider: "openai", configured: true, model });
  } catch (error) {
    return json(res, 200, { ...fallback, provider: "fallback", configured: true, warning: error.message });
  }
}
