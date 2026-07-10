// GET /api/transcript?v=VIDEO_ID
// 透過 YouTube InnerTube API 自動取得字幕(含自動產生字幕),無需 API key。
const UA_ANDROID = "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";
const UA_WEB =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function msToClock(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

async function innertubePlayer(videoId, client) {
  const clients = {
    ANDROID: {
      ua: UA_ANDROID,
      ctx: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: "en" },
    },
    WEB: {
      ua: UA_WEB,
      ctx: { clientName: "WEB", clientVersion: "2.20250101.00.00", hl: "en" },
    },
    TVHTML5: {
      ua: UA_WEB,
      ctx: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", hl: "en" },
    },
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

function pickTrack(tracks) {
  // 優先:人工字幕 > 自動字幕;語言優先 ko > ja > zh > en > 其他
  const langOrder = ["ko", "ja", "zh", "zh-Hant", "zh-Hans", "en"];
  const score = (t) => {
    const manual = t.kind === "asr" ? 0 : 100;
    const li = langOrder.findIndex((l) => (t.languageCode || "").startsWith(l));
    return manual + (li === -1 ? 0 : 50 - li * 5);
  };
  return tracks.slice().sort((a, b) => score(b) - score(a))[0];
}

function mergeCues(rawCues, targetLen) {
  // 自動字幕的 cue 很碎,合併成適合逐句學習的長度
  const out = [];
  let cur = null;
  for (const c of rawCues) {
    if (!cur) {
      cur = { tMs: c.tMs, text: c.text };
      continue;
    }
    const gap = c.tMs - cur.lastMs;
    const endPunct = /[.!?。!?…"]\s*$/.test(cur.text);
    if (cur.text.length >= targetLen || endPunct || gap > 3500) {
      out.push(cur);
      cur = { tMs: c.tMs, text: c.text };
    } else {
      cur.text += (cur.text.endsWith(" ") ? "" : " ") + c.text;
    }
    cur.lastMs = c.tMs;
  }
  if (cur && cur.text) out.push(cur);
  return out.map((c) => ({ t: msToClock(c.tMs), text: c.text.replace(/\s+/g, " ").trim() }));
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const v = String((req.query && req.query.v) || "").trim();
  if (!/^[A-Za-z0-9_-]{6,15}$/.test(v)) {
    return res.status(400).json({ error: "INVALID_ID", message: "無效的影片 ID" });
  }
  try {
    let player = null;
    let tracks = [];
    let lastClient = "TVHTML5";
    for (const client of ["ANDROID", "WEB", "TVHTML5"]) {
      lastClient = client;
      player = await innertubePlayer(v, client);
      tracks =
        (player &&
          player.captions &&
          player.captions.playerCaptionsTracklistRenderer &&
          player.captions.playerCaptionsTracklistRenderer.captionTracks) ||
        [];
      if (tracks.length) break;
    }
    if (!tracks.length) {
      return res
        .status(404)
        .json({
          error: "NO_CAPTIONS",
          message: "這部影片沒有任何字幕(含自動字幕),無法解析。",
          debug: {
            lastClient: lastClient,
            hasPlayer: !!player,
            playerStatus: player && player.playabilityStatus && player.playabilityStatus.status,
            reason: player && player.playabilityStatus && player.playabilityStatus.reason,
            captionsKeys: player && player.captions ? Object.keys(player.captions) : null,
          }
        });
    }
    const track = pickTrack(tracks);
    // 強制 fmt=json3: ANDROID baseUrl 預設帶 fmt=xml,把舊值拔掉再補
    let capUrl = track.baseUrl.replace(/([?&])fmt=[^&]*/g, "");
    capUrl += (capUrl.includes("?") ? "&" : "?") + "fmt=json3";
    const capRes = await fetch(capUrl, { headers: { "User-Agent": UA_WEB } });
    if (!capRes.ok) throw new Error("caption fetch " + capRes.status);
    const cap = await capRes.json();
    const rawCues = (cap.events || [])
      .filter((e) => e.segs)
      .map((e) => ({
        tMs: e.tStartMs || 0,
        text: e.segs
          .map((s) => s.utf8 || "")
          .join("")
          .replace(/\n/g, " ")
          .trim(),
      }))
      .filter((c) => c.text);
    if (!rawCues.length) {
      return res.status(404).json({ error: "EMPTY_CAPTIONS", message: "字幕內容為空。" });
    }
    // 韓/日/中字幕句子較短,合併門檻低一點;拉丁語系高一點
    const isCJK = /^(ko|ja|zh)/.test(track.languageCode || "");
    const cues = mergeCues(rawCues, isCJK ? 22 : 60);
    res.status(200).json({
      videoId: v,
      title: (player.videoDetails && player.videoDetails.title) || "",
      lang: track.languageCode || "",
      auto: track.kind === "asr",
      cues,
    });
  } catch (e) {
    res.status(500).json({ error: "FETCH_FAILED", message: "取得字幕失敗:" + String(e.message || e) });
  }
};
