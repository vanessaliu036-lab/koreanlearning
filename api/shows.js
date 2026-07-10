// GET /api/shows — 回傳節目清單(JSON)
const fs = require("fs");
const path = require("path");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300");
  try {
    const fp = path.join(__dirname, "shows.json");
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "SHOWS_READ_FAILED", message: String(e.message || e) });
  }
};