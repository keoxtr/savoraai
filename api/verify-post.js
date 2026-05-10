import {
  createFreeAiJson,
  createResponseWithFallback,
  getOpenAI,
  getOpenRouterKey,
  getSupabaseAdmin,
  json,
  parseJsonText,
  searchWeb
} from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const { text = "", link = "", topic = "Gundem", postId = null } = req.body || {};
  const openai = getOpenAI();
  const hasFreeAi = Boolean(getOpenRouterKey());

  if (!openai && !hasFreeAi) {
    return json(res, 200, {
      configured: false,
      provider: "demo",
      label: "Inceleme gerekli",
      type: "mixed",
      confidence: 64,
      truth: "Gercek ucretsiz AI icin Vercel ortam degiskenlerine OPENROUTER_API_KEY eklenmeli.",
      sources: ["Demo dogrulama"]
    });
  }

  const sources = await searchWeb(`${text} ${topic}`.trim());
  const system = "Savora icin Turkce fact-check sonucu uret. Populerligi degil kaniti esas al. Cevabi sadece JSON olarak dondur.";
  const user = JSON.stringify({
    claim: text,
    link,
    topic,
    sources,
    schema: {
      type: "true|mixed|false",
      label: "Dogru|Kismen dogru|Yanlis / yaniltici|Baglam disi|Inceleme gerekli",
      confidence: "0-100 sayi",
      truth: "Kullanicinin anlayacagi kisa Turkce aciklama",
      sources: ["kaynak basligi veya domain listesi"]
    }
  });

  try {
    if (hasFreeAi) {
      const result = await createFreeAiJson({ system, user });
      return json(res, 200, {
        ...result.parsed,
        configured: true,
        provider: result.provider,
        model: result.model,
        rawSources: sources
      });
    }

    const { response, model } = await createResponseWithFallback(openai, {
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });
    const parsed = parseJsonText(response.output_text);

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
      model,
      rawSources: sources
    });
  } catch (error) {
    return json(res, 500, { error: "Verification failed", message: error.message });
  }
}
