# 🎥 VaultCam — Studio Recorder

High-quality audio + video recorder. Runs as a **web app** (Vercel) and as a
**desktop app** (Electron wrapper).

---

## Project Structure

```
vaultcam/
├── web/                  ← The actual app (HTML + CSS + JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── electron/
│   └── main.js           ← Thin Electron wrapper
├── assets/
│   ├── icon.png          ← Add your 512×512 PNG icon here
│   ├── icon.ico          ← Windows icon (convert from PNG)
│   ├── icon.icns         ← macOS icon (convert from PNG)
│   └── entitlements.mac.plist
├── package.json
├── vercel.json
└── README.md
```

---

## Features

- 🎙 High-quality audio (up to 192 kHz, stereo)
- 🎬 Video up to 4K / 60fps
- ⏱ Live timer widget
- 📊 Real-time audio level meter
- 💾 In-session recording library (download anytime)
- ⚙️ Full settings panel (resolution, fps, bitrate, sample rate)
- ⏸ Pause / resume recording
- 🔢 Countdown before recording starts
- 🖥 Works in browser AND as a native desktop app

---

## 🌐 Deploy to Vercel (Web App)

### Option A — Vercel CLI (fastest)

```bash
# 1. Install Vercel CLI globally
npm i -g vercel

# 2. Go into your project root
cd vaultcam

# 3. Deploy
vercel

# Follow the prompts:
#   Set up and deploy? → Y
#   Which scope? → your account
#   Link to existing project? → N
#   Project name → vaultcam (or anything)
#   In which directory is your code? → ./ (root)
#   Want to override settings? → N
#
# Vercel will give you a URL like: https://vaultcam-xxxx.vercel.app
```

### Option B — GitHub + Vercel Dashboard

```bash
# 1. Push your project to a GitHub repo
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/vaultcam.git
git push -u origin main
```

Then:
1. Go to https://vercel.com → New Project
2. Import your GitHub repo
3. Leave all settings as default (Vercel detects `vercel.json`)
4. Click **Deploy**

> ✅ The `vercel.json` already includes the correct `Permissions-Policy` and
> CORS headers so the browser will allow camera + mic access on the deployed URL.

---

## 🖥 Build Desktop App (Electron)

### Prerequisites

```bash
node -v   # Need Node.js 18+
npm -v
```

### Setup

```bash
cd vaultcam
npm install
```

### Run in development

```bash
npm start
```

### Build installers

```bash
# Windows (.exe installer)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Linux (.AppImage)
npm run build:linux

# All platforms at once
npm run build:all
```

Built files appear in the `dist/` folder.

---

## 🍎 macOS Notes

macOS requires a code signature to access camera/mic without a security warning.
For **personal use**, build without signing:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac
```

For **distribution**, you need an Apple Developer account and to sign + notarize.
The `entitlements.mac.plist` is already configured with the correct camera/mic keys.

---

## 🪟 Windows Notes

Windows Defender may flag unsigned Electron apps. To avoid this during development,
build and run directly:

```bash
npm start
```

For production distribution, sign the `.exe` with a code signing certificate.

---

## 🎨 Add Your Icon

Place a **512×512 PNG** at `assets/icon.png`.

Then convert:
```bash
# macOS icon (requires iconutil or electron-icon-maker)
npx electron-icon-maker --input=assets/icon.png --output=assets/

# Or use online converters:
# PNG → ICO: https://convertio.co/png-ico/
# PNG → ICNS: https://cloudconvert.com/png-to-icns
```

---

## 📦 Tech Stack

| Layer | Tech |
|-------|------|
| UI | Vanilla HTML/CSS/JS |
| Recording | MediaRecorder API + getUserMedia |
| Audio analysis | Web Audio API (AnalyserNode) |
| Desktop wrapper | Electron 31 |
| Build tool | electron-builder |
| Web hosting | Vercel |
| Fonts | Syne + JetBrains Mono (Google Fonts) |

---

## Browser Compatibility (Web)

| Browser | Support |
|---------|---------|
| Chrome 94+ | ✅ Full |
| Edge 94+ | ✅ Full |
| Firefox 90+ | ✅ Good |
| Safari 15+ | ⚠️ Limited (no VP9) |

> Safari doesn't support VP9/WebM. Select **MP4** format in the Format dropdown
> when recording on Safari. The app will auto-fallback if the selected codec
> is not supported.
