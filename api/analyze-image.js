import {
  createFreeAiJson,
  createResponseWithFallback,
  getOpenAI,
  getOpenRouterKey,
  json,
  parseJsonText
} from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const { image = "", text = "" } = req.body || {};
  const openai = getOpenAI();
  const hasFreeAi = Boolean(getOpenRouterKey());

  if ((!openai && !hasFreeAi) || !image) {
    return json(res, 200, {
      configured: Boolean(openai || hasFreeAi),
      provider: "demo",
      summary: "Gorsel analizi icin OPENROUTER_API_KEY ve gorsel verisi gerekir.",
      extractedText: "",
      risk: "Inceleme gerekli"
    });
  }

  const system = "Gorseldeki yazilari, baglami ve iddia riskini Turkce analiz et. Sadece JSON dondur.";
  const user = `Paylasim metni: ${text}\nJSON semasi: {"summary":"kisa analiz","extractedText":"gorselde okunan yazilar","risk":"Temiz|Baglam disi|Manipulasyon suphesi|Inceleme gerekli"}`;

  try {
    if (hasFreeAi) {
      const result = await createFreeAiJson({ system, user, image });
      return json(res, 200, {
        ...result.parsed,
        configured: true,
        provider: result.provider,
        model: result.model
      });
    }

    const { response, model } = await createResponseWithFallback(openai, {
      input: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "input_text", text: user },
            { type: "input_image", image_url: image }
          ]
        }
      ]
    });

    return json(res, 200, {
      ...parseJsonText(response.output_text),
      configured: true,
      provider: "openai",
      model
    });
  } catch (error) {
    return json(res, 500, { error: "Image analysis failed", message: error.message });
  }
}
