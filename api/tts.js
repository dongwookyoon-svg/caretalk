// 어르신 목소리 (Typecast TTS 프록시). 환경 변수: TYPECAST_API_KEY, 선택: TYPECAST_VOICE_FEMALE, TYPECAST_VOICE_MALE, ACCESS_CODE
let voiceCache = null;
async function pickVoices(key) {
  if (voiceCache) return voiceCache;
  const env = { f: process.env.TYPECAST_VOICE_FEMALE, m: process.env.TYPECAST_VOICE_MALE };
  if (env.f && env.m) return (voiceCache = env);
  const r = await fetch("https://api.typecast.ai/v3/voices?model=ssfm-v30", { headers: { "X-API-KEY": key } });
  const list = r.ok ? await r.json() : [];
  const arr = Array.isArray(list) ? list : (list.voices || list.result || []);
  const find = (g) => arr.find(v => v.age === "elder" && v.gender === g) || arr.find(v => v.age === "middle_age" && v.gender === g);
  voiceCache = { f: env.f || find("female")?.voice_id, m: env.m || find("male")?.voice_id };
  return voiceCache;
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const key = process.env.TYPECAST_API_KEY;
  if (!key) return res.status(501).json({ error: "no_tts" });
  if (process.env.ACCESS_CODE && req.headers["x-access-code"] !== process.env.ACCESS_CODE) return res.status(401).json({ error: "access_code" });
  const { text, female = true, mood = 50 } = req.body || {};
  if (!text || typeof text !== "string" || text.length > 300) return res.status(400).json({ error: "text" });
  try {
    const v = await pickVoices(key);
    const voice_id = female ? v.f : v.m;
    if (!voice_id) return res.status(501).json({ error: "no_voice" });
    const emotion = mood < 30 ? "sad" : mood > 70 ? "happy" : "normal";
    const r = await fetch("https://api.typecast.ai/v1/text-to-speech", {
      method: "POST", headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id, text, model: "ssfm-v30", language: "kor", prompt: { emotion_type: "preset", emotion_preset: emotion, emotion_intensity: 0.8 }, output: { audio_format: "mp3", audio_tempo: 0.92, target_lufs: -16 } })
    });
    if (!r.ok) return res.status(502).json({ error: "upstream", status: r.status });
    res.setHeader("content-type", "audio/mpeg"); res.setHeader("cache-control", "public, max-age=86400");
    return res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { return res.status(500).json({ error: "tts_failed" }); }
}
