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
  const SAMPLE = "아이고, 왔나. 오늘은 밥 생각이 통 없다. 새로 한 이가 잇몸을 자꾸 찔러서 씹을 수가 있어야지. 니는 밥은 묵었나? 날이 추운데 옷 따뜻하게 입고 다니래이. 내는 괜찮다, 걱정 말고 니 일 봐라.";
  const DESC = {
    female: "A warm, frail Korean grandmother in her mid 80s. Soft, slightly raspy and breathy elderly voice, slow gentle pace, speaking Korean naturally.",
    male: "A calm Korean grandfather in his mid 80s. Low, slightly hoarse elderly voice with a slow pace, speaking Korean naturally."
  };
  async function design(gender, name) {
    const d = await fetch(`${EL}/v1/text-to-voice/design`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ voice_description: DESC[gender], text: SAMPLE, model_id: "eleven_multilingual_ttv_v2" }) });
    if (!d.ok) { elCache && (elCache.err = "design " + d.status); return null; }
    const j = await d.json(); const gid = j.previews?.[0]?.generated_voice_id; if (!gid) return null;
    const c = await fetch(`${EL}/v1/text-to-voice`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ voice_name: name, voice_description: DESC[gender], generated_voice_id: gid }) });
    if (!c.ok) return null;
    return (await c.json()).voice_id || null;
  }
  async function pick(gender, name) {
    const dn = name + " 디자인";
    if (have(dn)) return have(dn);
    try { const v = await design(gender, dn); if (v) return v; } catch {}
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
let elPremade = null;
async function premade(key, female) {
  if (!elPremade) {
    const d = await fetch(`${EL}/v1/voices`, { headers: { "xi-api-key": key } }).then(r => r.ok ? r.json() : { voices: [] }).catch(() => ({ voices: [] }));
    const pre = (d.voices || []).filter(v => v.category === "premade");
    const by = (g) => pre.find(v => v.labels?.gender === g && /old|middle/.test(v.labels?.age || "")) || pre.find(v => v.labels?.gender === g) || pre[0];
    elPremade = { f: by("female")?.voice_id, m: by("male")?.voice_id };
  }
  return female ? elPremade.f : elPremade.m;
}
async function elSpeak(key, text, female) {
  const v = await elVoices(key);
  let out = await elSay(key, text, female ? v.f : v.m);
  // 무료 계정은 목소리 모음(라이브러리) 목소리를 API로 못 쓸 수 있음 → 기본 목소리로 대체하고 기억
  if (out.status === 401 || out.status === 402 || out.status === 403 || out.status === 404 || out.status === 501) {
    const alt = await premade(key, female);
    if (alt) { const o2 = await elSay(key, text, alt); if (o2.status === 200) { if (female) v.f = alt; else v.m = alt; o2.note = "premade:" + out.status + " " + (out.err || "").slice(0, 120); return o2; } out.err = (out.err || "") + " | premade: " + o2.status + " " + (o2.err || ""); }
  }
  return out;
}
async function elSay(key, text, id) {
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
  if (req.method === "GET" && elKey && (!key || (req.query && req.query.el))) {
    try {
      const out = await elSpeak(elKey, "네.", true);
      return res.status(200).json({ provider: "elevenlabs", ok: out.status === 200, status: out.status, voices: await elVoices(elKey), detail: out.err || out.note || "" });
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
  let tcFail = 0;
  if (key) try {
    const v = await pickVoices(key);
    const voice_id = female ? v.f : v.m;
    if (!voice_id) throw new Error("no_voice");
    const emotion = mood < 30 ? "sad" : mood > 70 ? "happy" : "normal";
    const call = (withEmotion) => fetch("https://api.typecast.ai/v1/text-to-speech", {
      method: "POST", headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id, text, model: "ssfm-v30", language: "kor", ...(withEmotion ? { prompt: { emotion_type: "preset", emotion_preset: emotion, emotion_intensity: 0.8 } } : {}), output: { audio_format: "mp3", audio_tempo: 1.12, target_lufs: -16 } })
    });
    let r = await call(true);
    if (r.status === 400 || r.status === 422) r = await call(false);
    if (r.status === 429) { await new Promise(z => setTimeout(z, 400)); r = await call(true); }
    // 계정이 막혔거나 키가 잘못되면 501: 사이트가 바로 브라우저 목소리로 넘어가고 다시 묻지 않음
    if (r.ok) {
      res.setHeader("content-type", "audio/mpeg"); res.setHeader("cache-control", "public, max-age=86400"); res.setHeader("x-tts", "typecast");
      return res.send(Buffer.from(await r.arrayBuffer()));
    }
    tcFail = r.status;
  } catch (e) { tcFail = 500; }
  // 타입캐스트가 안 되면 일레븐랩스로
  if (elKey) {
    try {
      let out = await elSpeak(elKey, text, female);
      if (out.status === 429) { await new Promise(z => setTimeout(z, 400)); out = await elSpeak(elKey, text, female); }
      if (out.status === 200) { res.setHeader("content-type", "audio/mpeg"); res.setHeader("cache-control", "public, max-age=86400"); res.setHeader("x-tts", "elevenlabs"); return res.send(out.buf); }
    } catch (e) {}
  }
  return res.status(tcFail === 401 || tcFail === 402 || tcFail === 403 ? 501 : 502).json({ error: "tts_failed", typecast: tcFail });
}
