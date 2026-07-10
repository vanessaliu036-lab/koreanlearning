// GET /api/translate?lang=zh-Hant&v=VIDEO_ID
// 用 YouTube 公開 timedtext API + tlang=zh-Hant 拿整段繁中字幕
// (YouTube 官方 machine translation, 免費, 不需任何 API key)
//
// 端點限制: 需要 Innertube 拿到的完整 baseUrl (含 sig/expire)
// Innertube 在雲端 datacenter 環境會被 YouTube 擋, 所以這個端點
// 主要給本機開發用; 雲端部署優先用 /captions/<id>.json 離線字幕
const UA_ANDROID = "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";
const UA_WEB = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function innertubePlayer(videoId, client) {
  const clients = {
    ANDROID: { ua: UA_ANDROID, ctx: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: "en" } },
    WEB: { ua: UA_WEB, ctx: { clientName: "WEB", clientVersion: "2.20250101.00.00", hl: "en" } },
    TVHTML5: { ua: UA_WEB, ctx: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", hl: "en" } },
  };
  const c = clients[client];
  const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": c.ua },
    body: JSON.stringify({ videoId, context: { client: c.ctx } }),
  });
  if (!r.ok) return null;
  return r.json();
}

function pickSourceTrack(tracks) {
  // 來源字幕優先: 韓文 > 任何人工字幕 > 英人工 > 英自動
  const ko = tracks.find(t => t.languageCode === "ko" && t.kind !== "asr") || tracks.find(t => t.languageCode === "ko");
  if (ko) return ko;
  const manual = tracks.find(t => t.kind !== "asr");
  if (manual) return manual;
  return tracks[0];
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const v = String((req.query && req.query.v) || "").trim();
  const lang = String((req.query && req.query.lang) || "zh-Hant").trim();
  if (!/^[A-Za-z0-9_-]{6,15}$/.test(v)) {
    return res.status(400).json({ error: "INVALID_ID", message: "無效的影片 ID" });
  }
  try {
    let player = null, tracks = [];
    for (const client of ["ANDROID", "WEB", "TVHTML5"]) {
      player = await innertubePlayer(v, client);
      tracks = (player && player.captions && player.captions.playerCaptionsTracklistRenderer && player.captions.playerCaptionsTracklistRenderer.captionTracks) || [];
      if (tracks.length) break;
    }
    if (!tracks.length) {
      return res.status(404).json({ error: "NO_CAPTIONS", message: "這部影片抓不到任何字幕軌道" });
    }
    const src = pickSourceTrack(tracks);
    // 把 baseUrl 強制 fmt=json3 拿原始結構, 再疊上 tlang
    let baseUrl = src.baseUrl.replace(/([?&])fmt=[^&]*/g, "");
    baseUrl += (baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
    const tlangUrl = baseUrl + "&tlang=" + encodeURIComponent(lang);
    const r = await fetch(tlangUrl, { headers: { "User-Agent": UA_WEB } });
    if (!r.ok) throw new Error("timedtext fetch " + r.status);
    const text = await r.text();
    if (text.startsWith("<")) {
      // youtube 回 XML 表示 tlang 不支援這個 source language
      return res.status(400).json({ error: "TLANG_UNSUPPORTED", message: "YouTube 不支援把這部影片的字幕翻成 " + lang });
    }
    const cap = JSON.parse(text);
    const cues = (cap.events || []).filter(e => e.segs).map(e => ({
      tMs: e.tStartMs || 0,
      text: e.segs.map(s => s.utf8 || "").join("").replace(/\n/g, " ").trim(),
    })).filter(c => c.text);
    res.status(200).json({
      videoId: v,
      sourceLang: src.languageCode,
      targetLang: lang,
      auto: src.kind === "asr",
      translated: src.languageCode !== lang,
      cueCount: cues.length,
      cues,
    });
  } catch (e) {
    res.status(500).json({ error: "TRANSLATE_FAILED", message: "翻譯取得失敗: " + String(e.message || e) });
  }
};