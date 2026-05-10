import { getSupabaseAdmin, json } from "./_utils.js";

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return json(res, 200, {
      configured: false,
      posts: [],
      message: "Supabase ortam değişkenleri tanımlanınca paylaşımlar kalıcı kaydedilecek."
    });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return json(res, 500, { error: error.message });
    }

    return json(res, 200, { configured: true, posts: data });
  }

  if (req.method === "POST") {
    const { author, handle, text, topic, link, imageUrl } = req.body || {};
    const { data, error } = await supabase
      .from("posts")
      .insert({ author, handle, text, topic, link, image_url: imageUrl })
      .select()
      .single();

    if (error) {
      return json(res, 500, { error: error.message });
    }

    return json(res, 200, { configured: true, post: data });
  }

  return json(res, 405, { error: "Method not allowed" });
}
