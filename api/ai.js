// 케어톡 AI 프록시 (Vercel 서버 함수)
// 브라우저에는 API 키가 노출되지 않고, 이 함수만 Anthropic API를 호출합니다.
//
// 환경 변수 (Vercel > Project > Settings > Environment Variables)
//   ANTHROPIC_API_KEY  (필수)  Anthropic 콘솔에서 발급한 키
//   ACCESS_CODE        (선택)  설정하면 사이트 첫 화면에서 이 코드를 입력해야 AI가 동작합니다
//   MODEL_MAIN         (선택)  어르신 대화·채점 모델. 기본값 claude-sonnet-5-5
//   MODEL_FAST         (선택)  사투리 풀이 모델. 기본값 claude-haiku-5-5

const MAX_PROMPT = 24000;
const hits = new Map(); // 아주 단순한 IP별 분당 호출 제한

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const code = process.env.ACCESS_CODE;
  if (code && req.headers["x-access-code"] !== code) {
    return res.status(401).json({ error: "access_code" });
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "local";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= 40) return res.status(429).json({ error: "rate_limited" });
  list.push(now); hits.set(ip, list);

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { prompt, tier } = body || {};
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT) {
    return res.status(400).json({ error: "bad_prompt" });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "no_api_key" });

  const model = tier === "quick"
    ? (process.env.MODEL_FAST || "claude-haiku-5-5")
    : (process.env.MODEL_MAIN || "claude-sonnet-5-5");

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        max_tokens: tier === "complex" ? 1800 : 600,
        output_config: { effort: tier === "complex" ? "medium" : "low" },
        system: "Reply with exactly one valid JSON object and nothing else. No markdown fences.",
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      return res.status(r.status === 429 ? 429 : 502).json({ error: r.status === 429 ? "rate_limited" : "upstream", detail });
    }
    const data = await r.json();
    const text = (data.content || []).map((c) => c.text || "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    return res.status(200).json(JSON.parse(m ? m[0] : text));
  } catch (e) {
    return res.status(502).json({ error: "upstream", detail: String(e).slice(0, 200) });
  }
}
