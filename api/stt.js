// 내 말 받아쓰기 (ElevenLabs Scribe). 브라우저 음성 인식이 틀리기 쉬운 한국어를 녹음으로 다시 받아 적는다.
// 환경 변수: ELEVENLABS_API_KEY (Speech to Text 권한 필요)
export const config = { api: { bodyParser: false } };
async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks);
}
export default async function handler(req, res) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (req.method === "GET") return res.status(200).json({ ok: !!key });
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!key) return res.status(501).json({ error: "no_stt" });
  if (process.env.ACCESS_CODE && req.headers["x-access-code"] !== process.env.ACCESS_CODE) return res.status(401).json({ error: "access_code" });
  try {
    const buf = await readBody(req);
    if (!buf.length || buf.length > 8 * 1024 * 1024) return res.status(400).json({ error: "size" });
    const type = String(req.headers["content-type"] || "audio/webm").split(";")[0];
    const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
    let last = "";
    for (const model of ["scribe_v2", "scribe_v1"]) {
      const fd = new FormData();
      fd.append("model_id", model); fd.append("language_code", "kor"); fd.append("tag_audio_events", "false");
      fd.append("file", new Blob([buf], { type }), "say." + ext);
      const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: fd });
      if (r.ok) { const j = await r.json(); return res.status(200).json({ text: String(j.text || "").trim(), model }); }
      last = r.status + " " + (await r.text()).slice(0, 200);
      if (r.status === 401 || r.status === 403) break;
    }
    return res.status(502).json({ error: "stt_failed", detail: last });
  } catch (e) { return res.status(500).json({ error: "stt_error", detail: String(e).slice(0, 200) }); }
}
