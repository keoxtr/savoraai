import { createResponseWithFallback, getOpenAI, json } from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const { image = "", text = "" } = req.body || {};
  const openai = getOpenAI();

  if (!openai || !image) {
    return json(res, 200, {
      configured: Boolean(openai),
      provider: "demo",
      summary: "Görsel analizi için OPENAI_API_KEY ve görsel verisi gerekir.",
      extractedText: "",
      risk: "İnceleme gerekli"
    });
  }

  try {
    const { response, model } = await createResponseWithFallback(openai, {
      input: [
        {
          role: "system",
          content: "Görseldeki yazıları, bağlamı ve iddia riskini Türkçe analiz et. Sadece JSON döndür."
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: `Paylaşım metni: ${text}\nJSON şeması: {"summary":"kısa analiz","extractedText":"görselde okunan yazılar","risk":"Temiz|Bağlam dışı|Manipülasyon şüphesi|İnceleme gerekli"}` },
            { type: "input_image", image_url: image }
          ]
        }
      ]
    });

    return json(res, 200, {
      ...JSON.parse(response.output_text),
      configured: true,
      provider: "openai",
      model
    });
  } catch (error) {
    return json(res, 500, { error: "Image analysis failed", message: error.message });
  }
}
