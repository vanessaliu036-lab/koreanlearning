// POST /api/claude  — 代理 Anthropic API,金鑰只存在伺服器環境變數
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD" });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "NO_KEY", message: "尚未設定 ANTHROPIC_API_KEY 環境變數。" });
  }
  try {
    const body = req.body || {};
    // 安全限制:固定模型與 token 上限,前端只能傳 messages
    const payload = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: Math.min(Number(body.max_tokens) || 1600, 4000),
      messages: body.messages || [],
    };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: "PROXY_FAILED", message: String(e.message || e) });
  }
};
