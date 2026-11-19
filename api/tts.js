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

// ── 일레븐랩스 (ELEVENLABS_API_KEY 가 있으면 먼저 사용) ──
// 선택: ELEVEN_VOICE_FEMALE, ELEVEN_VOICE_MALE (목소리 ID 직접 지정), ELEVEN_MODEL
const EL = "https://api.elevenlabs.io";
let elCache = null;
async function elVoices(key) {
  if (elCache) return elCache;
  const env = { f: process.env.ELEVEN_VOICE_FEMALE, m: process.env.ELEVEN_VOICE_MALE };
  if (env.f && env.m) return (elCache = env);
  const h = { "xi-api-key": key };
  const mine = await fetch(`${EL}/v1/voices`, { headers: h }).then(r => r.ok ? r.json() : { voices: [] }).catch(() => ({ voices: [] }));
  const have = (n) => (mine.voices || []).find(v => v.name === n)?.voice_id;
  async function pick(gender, name) {
    if (have(name)) return have(name);
    for (const age of ["old", "middle_aged"]) {
      const q = new URLSearchParams({ page_size: "30", language: "ko", gender, age });
      const d = await fetch(`${EL}/v1/shared-voices?${q}`, { headers: h }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
      const list = (d.voices || []).filter(v => v.free_users_allowed !== false);
      for (const v of list) {
        const r = await fetch(`${EL}/v1/voices/add/${v.public_owner_id}/${v.voice_id}`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ new_name: name }) });
        if (r.ok) { const j = await r.json(); return j.voice_id; }
      }
    }
    // 마지막 대안: 계정에 있는 기본 목소리
    const pre = (mine.voices || []).find(v => (v.labels?.gender || "") === gender) || (mine.voices || [])[0];
    return pre?.voice_id;
  }
  elCache = { f: env.f || await pick("female", "CT 할머니"), m: env.m || await pick("male", "CT 할아버지") };
  return elCache;
}
async function elSpeak(key, text, female) {
  const v = await elVoices(key);
  const id = female ? v.f : v.m;
  if (!id) return { status: 501, err: "no_voice" };
  const r = await fetch(`${EL}/v1/text-to-speech/${id}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: process.env.ELEVEN_MODEL || "eleven_flash_v2_5", language_code: "ko", voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.05 } })
  });
  if (!r.ok) return { status: r.status, err: (await r.text()).slice(0, 300) };
  return { status: 200, buf: Buffer.from(await r.arrayBuffer()) };
}
export default async function handler(req, res) {
  const key = process.env.TYPECAST_API_KEY;
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (req.method === "GET" && elKey) {
    try {
      const out = await elSpeak(elKey, "네.", true);
      return res.status(200).json({ provider: "elevenlabs", ok: out.status === 200, status: out.status, voices: await elVoices(elKey), detail: out.err || "" });
    } catch (e) { return res.status(200).json({ provider: "elevenlabs", ok: false, reason: String(e).slice(0, 200) }); }
  }
  if (req.method === "GET") {
    // 점검용: /api/tts 를 브라우저로 열면 타입캐스트 상태를 보여 준다
    if (!key) return res.status(200).json({ ok: false, reason: "TYPECAST_API_KEY 환경 변수가 없음" });
    try {
      const v = await pickVoices(key);
      const r = await fetch("https://api.typecast.ai/v1/text-to-speech", { method: "POST", headers: { "X-API-KEY": key, "Content-Type": "application/json" }, body: JSON.stringify({ voice_id: v.f, text: "네.", model: "ssfm-v30", language: "kor" }) });
      const body = r.ok ? "" : (await r.text()).slice(0, 300);
      return res.status(200).json({ ok: r.ok, typecast_status: r.status, voices: v, detail: body });
    } catch (e) { return res.status(200).json({ ok: false, reason: String(e).slice(0, 200) }); }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!key && !elKey) return res.status(501).json({ error: "no_tts" });
  if (process.env.ACCESS_CODE && req.headers["x-access-code"] !== process.env.ACCESS_CODE) return res.status(401).json({ error: "access_code" });
  const { text, female = true, mood = 50 } = req.body || {};
  if (!text || typeof text !== "string" || text.length > 300) return res.status(400).json({ error: "text" });
  if (elKey) {
    try {
      let out = await elSpeak(elKey, text, female);
      if (out.status === 429) { await new Promise(z => setTimeout(z, 400)); out = await elSpeak(elKey, text, female); }
      if (out.status === 200) { res.setHeader("content-type", "audio/mpeg"); res.setHeader("cache-control", "public, max-age=86400"); return res.send(out.buf); }
      if (!key) return res.status(out.status === 401 || out.status === 402 || out.status === 403 ? 501 : 502).json({ error: "elevenlabs", status: out.status });
    } catch (e) { if (!key) return res.status(500).json({ error: "tts_failed" }); }
  }
  try {
    const v = await pickVoices(key);
    const voice_id = female ? v.f : v.m;
    if (!voice_id) return res.status(501).json({ error: "no_voice" });
    const emotion = mood < 30 ? "sad" : mood > 70 ? "happy" : "normal";
    const call = (withEmotion) => fetch("https://api.typecast.ai/v1/text-to-speech", {
      method: "POST", headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id, text, model: "ssfm-v30", language: "kor", ...(withEmotion ? { prompt: { emotion_type: "preset", emotion_preset: emotion, emotion_intensity: 0.8 } } : {}), output: { audio_format: "mp3", audio_tempo: 1.12, target_lufs: -16 } })
    });
    let r = await call(true);
    if (r.status === 400 || r.status === 422) r = await call(false);
    if (r.status === 429) { await new Promise(z => setTimeout(z, 400)); r = await call(true); }
    // 계정이 막혔거나 키가 잘못되면 501: 사이트가 바로 브라우저 목소리로 넘어가고 다시 묻지 않음
    if (r.status === 401 || r.status === 402 || r.status === 403) return res.status(501).json({ error: "typecast_blocked", status: r.status });
    if (!r.ok) return res.status(502).json({ error: "upstream", status: r.status });
    res.setHeader("content-type", "audio/mpeg"); res.setHeader("cache-control", "public, max-age=86400");
    return res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { return res.status(500).json({ error: "tts_failed" }); }
}
