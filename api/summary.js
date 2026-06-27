// /api/summary.js
// Recebe a conversa + o personId do lead, pede à IA um resumo no formato do
// Playbook de Vendas da Ebony, e grava como NOTA no lead/pessoa do Pipedrive.

const SUMMARY_PROMPT = `Você é um analista de vendas da Ebony English. Recebeu a transcrição de uma conversa entre a assistente Jabari e um possível aluno interessado em intercâmbio em Cape Town.

Sua tarefa: produzir um BRIEFING DE PASSAGEM DE BASTÃO para a Juliana (consultora de vendas), ancorado no Playbook de Vendas da Ebony, cujo princípio é "conduzir, não convencer". A Jabari já fez parte do trabalho consultivo — seu resumo deve dizer à Juliana o que a conversa já revelou, para ela continuar de onde parou.

Escreva em português do Brasil, OBJETIVO e escaneável (a Juliana lê em 30 segundos). Use exatamente esta estrutura, preenchendo só o que a conversa revelou (se algo não apareceu, escreva "não captado"):

NÍVEL DE INGLÊS (estimado): [nível CEFR + 1 frase de evidência]

MOMENTO / CONTEXTO (Etapa Diagnóstico): [por que busca inglês/intercâmbio agora, contexto profissional]

DOR / INCÔMODO (Etapa Diagnóstico + Espelhamento): [a trava, o medo, a vergonha, o que mais incomoda — nas palavras da pessoa, se possível]

CONSEQUÊNCIA / O QUE ESTÁ EM JOGO (Triangulação): [o que ela perde se não resolver; o que ganha se resolver]

OBJEÇÕES JÁ SINALIZADAS: [tempo, dinheiro, "já tentei antes", insegurança, etc — qualquer hesitação que apareceu]

TEMPERATURA DE COMPRA: [fria / morna / quente — com 1 frase de justificativa]

GANCHO PARA A JULIANA: [a melhor porta de entrada para a Juliana retomar — qual etapa do Playbook priorizar, qual fala ou pergunta usar primeiro]

Seja honesto e específico. Não invente o que não apareceu. Não mencione preço (a Ebony não passa preço pela assistente).`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const token = process.env.PIPEDRIVE_API_TOKEN;
  const domain = process.env.PIPEDRIVE_DOMAIN;

  try {
    const { messages, personId, name } = req.body;
    if (!Array.isArray(messages) || messages.length < 2) {
      return res.status(200).json({ ok: false, skipped: "conversa curta demais" });
    }

    // 1) Monta a transcrição legível
    const transcript = messages
      .map((m) => `${m.role === "user" ? "ALUNO" : "JABARI"}: ${m.content}`)
      .join("\n");

    // 2) Pede o resumo à IA
    let summary = "(resumo não gerado)";
    if (apiKey) {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 800,
          system: SUMMARY_PROMPT,
          messages: [{ role: "user", content: `Transcrição da conversa com ${name || "o interessado"}:\n\n${transcript}` }],
        }),
      });
      const aiData = await aiRes.json();
      if (aiRes.ok) {
        summary = (aiData.content || [])
          .filter((i) => i.type === "text")
          .map((i) => i.text)
          .join("\n")
          .trim() || summary;
      }
    }

    // 3) Grava como nota no Pipedrive (vinculada à pessoa do lead)
    if (token && domain && personId) {
      const base = `https://${domain}.pipedrive.com/api/v1`;
      const noteContent =
        `<b>BRIEFING JABARI — Ebony Meeting</b><br><br>` +
        summary.replace(/\n/g, "<br>") +
        `<br><br><i>— resumo automático da conversa com a assistente Jabari</i>`;

      await fetch(`${base}/notes?api_token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: noteContent,
          person_id: personId,
        }),
      });
    }

    return res.status(200).json({ ok: true, summary });
  } catch (err) {
    console.error("Summary error:", err);
    return res.status(200).json({ ok: false, error: "Falha ao gerar/enviar resumo." });
  }
}
