// /api/lead.js
// Cria OU reaproveita a pessoa no Pipedrive (deduplicação por email, depois WhatsApp).
// Retorna o personId para o navegador usar no resumo (summary.js).

function cleanPhone(p) {
  return (p || "").replace(/\D/g, ""); // só dígitos
}
function cleanEmail(e) {
  return (e || "").trim().toLowerCase();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const token = process.env.PIPEDRIVE_API_TOKEN;
  const domain = process.env.PIPEDRIVE_DOMAIN;

  if (!token || !domain) {
    return res.status(200).json({ ok: false, skipped: true });
  }

  try {
    const { name, whatsapp, email } = req.body;
    if (!name || !whatsapp) {
      return res.status(400).json({ error: "Nome e WhatsApp são obrigatórios." });
    }

    const base = `https://${domain}.pipedrive.com/api/v1`;
    const phone = cleanPhone(whatsapp);
    const mail = cleanEmail(email);

    // 1) Tenta achar pessoa existente — primeiro por email, depois por telefone
    let personId = null;

    async function searchPerson(term, fields) {
      if (!term) return null;
      const url = `${base}/persons/search?term=${encodeURIComponent(term)}&fields=${fields}&exact_match=true&api_token=${token}`;
      const r = await fetch(url);
      const j = await r.json();
      const items = j?.data?.items;
      if (items && items.length > 0) return items[0].item.id;
      return null;
    }

    if (mail) personId = await searchPerson(mail, "email");
    if (!personId && phone) personId = await searchPerson(phone, "phone");

    // 2) Se não existe, cria nova pessoa
    if (!personId) {
      const createBody = {
        name,
        phone: [{ value: phone, primary: true, label: "WhatsApp" }],
      };
      if (mail) createBody.email = [{ value: mail, primary: true, label: "work" }];

      const personRes = await fetch(`${base}/persons?api_token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      });
      const person = await personRes.json();
      personId = person?.data?.id;

      // 3) Cria o lead vinculado (só para pessoa nova)
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
    }

    return res.status(200).json({ ok: true, personId: personId || null });
  } catch (err) {
    console.error("Pipedrive error:", err);
    return res.status(200).json({ ok: false, error: "Falha ao registrar no Pipedrive." });
  }
}
