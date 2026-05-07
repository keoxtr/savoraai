import { getOpenAI, getSupabaseAdmin, json, searchWeb } from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const { text = "", link = "", topic = "Gündem", postId = null } = req.body || {};
  const openai = getOpenAI();

  if (!openai) {
    return json(res, 200, {
      configured: false,
      provider: "demo",
      label: "İnceleme gerekli",
      type: "mixed",
      confidence: 64,
      truth: "OpenAI API anahtarı henüz tanımlanmadığı için gerçek AI doğrulaması çalışmadı. Vercel ortam değişkenlerine OPENAI_API_KEY eklenmeli.",
      sources: ["Demo doğrulama"]
    });
  }

  const sources = await searchWeb(`${text} ${topic}`.trim());

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: "Savora için Türkçe fact-check sonucu üret. Popülerliği değil kanıtı esas al. Cevabı sadece JSON olarak döndür."
        },
        {
          role: "user",
          content: JSON.stringify({
            claim: text,
            link,
            topic,
            sources,
            schema: {
              type: "true|mixed|false",
              label: "Doğru|Kısmen doğru|Yanlış / yanıltıcı|Bağlam dışı|İnceleme gerekli",
              confidence: "0-100 sayı",
              truth: "Kullanıcının anlayacağı kısa Türkçe açıklama",
              sources: ["kaynak başlığı veya domain listesi"]
            }
          })
        }
      ]
    });
    const parsed = JSON.parse(response.output_text);

    const supabase = getSupabaseAdmin();
    if (supabase && postId) {
      await supabase.from("verifications").insert({
        post_id: postId,
        result: parsed,
        sources,
        created_at: new Date().toISOString()
      });
    }

    return json(res, 200, {
      ...parsed,
      configured: true,
      provider: "openai",
      rawSources: sources
    });
  } catch (error) {
    return json(res, 500, { error: "Verification failed", message: error.message });
  }
}
