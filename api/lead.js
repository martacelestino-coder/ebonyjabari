// /api/lead.js
// Recebe nome + WhatsApp do navegador e cria a pessoa + lead no Pipedrive.
// O token do Pipedrive fica escondido no servidor (env var), nunca no navegador.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const token = process.env.PIPEDRIVE_API_TOKEN;
  const domain = process.env.PIPEDRIVE_DOMAIN; // ex: "ebonyenglish" se a URL é ebonyenglish.pipedrive.com

  if (!token || !domain) {
    return res.status(200).json({ ok: false, skipped: true });
  }

  try {
    const { name, whatsapp } = req.body;
    if (!name || !whatsapp) {
      return res.status(400).json({ error: "Nome e WhatsApp são obrigatórios." });
    }

    const base = `https://${domain}.pipedrive.com/api/v1`;

    const personRes = await fetch(`${base}/persons?api_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone: [{ value: whatsapp, primary: true, label: "WhatsApp" }],
      }),
    });
    const person = await personRes.json();
    const personId = person?.data?.id;

    if (personId) {
      await fetch(`${base}/leads?api_token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Ebony Meeting — ${name}`,
          person_id: personId,
        }),
      });
    }

    return res.status(200).json({ ok: true, personId: personId || null });
  } catch (err) {
    console.error("Pipedrive error:", err);
    return res.status(200).json({ ok: false, error: "Falha ao registrar no Pipedrive." });
  }
}
