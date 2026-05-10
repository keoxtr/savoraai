import { createResponseWithFallback, fallbackModeration, getOpenAI, json } from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const { text = "" } = req.body || {};
  const fallback = fallbackModeration(text);
  const openai = getOpenAI();

  if (!openai) {
    return json(res, 200, { ...fallback, provider: "local", configured: false });
  }

  try {
    const { response, model } = await createResponseWithFallback(openai, {
      input: [
        {
          role: "system",
          content: "Türkçe sosyal medya içeriğini Savora topluluk kurallarına göre değerlendir. Hakaret, tehdit, taciz, cinsel içerik, nefret söylemi, şiddet çağrısı, kişisel veri ifşası, spam ve dolandırıcılık risklerini yakala. Sadece geçerli JSON döndür."
        },
        {
          role: "user",
          content: `İçerik: ${text}\n\nJSON şeması: {"blocked":boolean,"reason":"Temiz|Hakaret / taciz|Tehdit|Cinsel içerik|Nefret söylemi|Şiddet|Spam / dolandırıcılık|Kişisel bilgi paylaşımı|Diğer","message":"kısa kullanıcı mesajı","risk":0-100}`
        }
      ]
    });
    const parsed = JSON.parse(response.output_text);
    return json(res, 200, { ...parsed, provider: "openai", configured: true, model });
  } catch (error) {
    return json(res, 200, { ...fallback, provider: "fallback", configured: true, warning: error.message });
  }
}
