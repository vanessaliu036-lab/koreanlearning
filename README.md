# 影片語言學習解析器(全自動版)

貼上 YouTube 連結 → 自動抓字幕 → 逐句繁中翻譯 + 單字亮點 → 單字庫 + 文法重點。
零手貼逐字稿(只要影片本身有字幕,含 YouTube 自動產生字幕即可)。

## 5 分鐘部署(Vercel)

1. 到 https://vercel.com 登入(可用 GitHub 帳號)
2. 把本資料夾上傳成一個 GitHub repo,或安裝 CLI 直接部署:
   ```
   npm i -g vercel
   cd 本資料夾
   vercel --prod
   ```
3. 在 Vercel 專案 → Settings → Environment Variables 新增:
   - `ANTHROPIC_API_KEY` = 你的 Anthropic API 金鑰(https://console.anthropic.com 取得)
4. Redeploy 一次,開啟網址即可使用。

## 架構

- `public/index.html` — 前端 UI(暖米色卡片風,雙語字幕/單字庫/文法重點三分頁,點卡片跳影片時間點)
- `api/transcript.js` — 自動抓 YouTube 字幕(InnerTube API,ANDROID→WEB→TV 三重備援,免 YouTube key)
- `api/claude.js` — Claude 翻譯代理(API key 只存伺服器環境變數,不暴露前端)

## 限制

- 影片必須有字幕(人工或 YouTube 自動字幕皆可)。完全無字幕的影片提供手貼備援欄。
- 解析結果存瀏覽器 localStorage,同影片二次開啟秒載入。
