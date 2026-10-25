# 🚀 Life Roadmap — Daily Routine & Life Planner

A full-featured personal roadmap, habit, and daily life planner built with **React Native & Expo**. Transform any study, career, certification, or life goal into an actionable timeline with daily focus routines, Pomodoro timer, action checklists, study alarms, and 100% offline capability.

---

## 📱 Quick Test on Your Phone (Expo Go)

You do **not** need to compile an APK or IPA to test your app. You can test live on your phone in 30 seconds:

```bash
# 1. Navigate into the project folder:
cd /Users/kimrada/Desktop/ProjectApp/Roadmap-App

# 2. Start the Metro bundler with cleared cache:
npx expo start -c
```

### On Android:
1. Open **Expo Go** from Google Play Store.
2. Connect phone to the **same Wi-Fi** as your computer.
3. Tap **"Scan QR code"** and scan the QR displayed in your terminal.
*(If on different Wi-Fi, press `s` in the terminal for Tunnel mode).*

### On iPhone:
1. Open the default **iPhone Camera** app.
2. Point it at the QR code in your terminal.
3. Tap the yellow **"Open in Expo Go"** banner.

---

## 💻 Web Version (Windows / Mac browser)

The same code runs in any browser via Expo Web (react-native-web). Native-only
modules have browser versions picked automatically by Metro: `notifications.web.js`
(browser notifications), `shareUtils.web.js` (clipboard + .docx download), and
`webAlert.js` (dialogs). Requires **Node 20+**.

```bash
npm run web          # dev server -> http://localhost:8081
npm run build:web    # static site in ./dist (deploy to Vercel / Netlify / GitHub Pages)
npx serve dist       # preview the built site locally
```

Notes:
* Data is saved in the browser's local storage, separately per browser/device.
  Use **Settings → Backup & Restore** to move roadmaps between phone and laptop.
* Study reminders only fire while the app tab is open.
* Windows wider than 960px get the desktop layout (sidebar navigation, two-column Focus/Settings,
  card grids); narrower windows and phone browsers keep the mobile layout.

---

## 🤖 Guide to Deploy & Install on Android

### Method 1: Build a Standalone `.apk` in the Cloud (EAS Build - Recommended)
No Android Studio or heavy tools required. EAS compiles the `.apk` in the cloud for free:

```bash
# Step 1: Ensure you are in the project folder
cd /Users/kimrada/Desktop/ProjectApp/Roadmap-App

# Step 2: Install EAS CLI globally (if not installed)
npm install -g eas-cli

# Step 3: Login to your free Expo account
eas login

# Step 4: Trigger the APK build
eas build -p android --profile preview
```
* **Result**: EAS will print a download link (e.g., `https://expo.dev/artifacts/eas/...apk`).
* Open that link on your Android phone, download the `.apk`, allow **"Install unknown apps"**, and tap **Install**.
* The app is now permanently installed on your Android device!

---

### Method 2: Build APK Locally on your Windows PC (Offline)
*(Requires JDK 17 and Android Studio / Android SDK installed)*

```bash
cd /Users/kimrada/Desktop/ProjectApp/Roadmap-App

# 1. Generate the native android project
npx expo prebuild --platform android --clean

# 2. Compile the standalone APK (uses Android Studio's bundled JDK)
cd android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleRelease
```
* Your installable APK will be ready at:  
  `android\app\build\outputs\apk\release\app-release.apk`
* Copy this file to your Android phone via USB or Google Drive and install it.

---

### Method 3: Deploy to Google Play Store (Production)
```bash
cd /Users/kimrada/Desktop/ProjectApp/Roadmap-App
eas build -p android --profile production
```
* This generates an Android App Bundle (`.aab`) optimized for upload to the **Google Play Console**.

---

## 🍎 Guide to Deploy & Install on iPhone (iOS)

Apple enforces security signing for iOS apps. Here are the 3 ways to deploy to an iPhone:

### Method 1: Instant Testing via Expo Go (No Mac / No Apple Developer Account Needed)
1. Install **Expo Go** from the iOS App Store.
2. Run `npx expo start -c` in your project folder.
3. Scan the QR code with your iPhone Camera to open the app immediately.

---

### Method 2: Build & Install via Mac & Xcode (Free Apple ID)

#### Prerequisites
| Requirement | Minimum Version | Check Command |
| :--- | :--- | :--- |
| **macOS** | Ventura 13+ | `sw_vers` |
| **Xcode** | 15+ (full app, not just CLI Tools) | `xcodebuild -version` |
| **Node.js** | v22+ (v18 causes TypeScript stripping errors) | `node -v` |
| **CocoaPods** | 1.15+ | `pod --version` |
| **Ruby** | 3.x (via rbenv or system) | `ruby -v` |

> [!IMPORTANT]
> **Node.js v22+ is required.** Older versions (v18, v20) will fail during prebuild with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Use `nvm` to switch:
> ```bash
> nvm install 22
> nvm use 22
> ```

#### Step 1: Environment Setup (One-Time)

```bash
# 1a. Point xcode-select to the full Xcode app (not just Command Line Tools)
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# 1b. Fix UTF-8 encoding for CocoaPods (prevents Unicode errors)
echo 'export LANG=en_US.UTF-8' >> ~/.zshrc
source ~/.zshrc

# 1c. Switch to Node 22+ via nvm
nvm use 22
```

#### Step 2: Clean Install & Prebuild

```bash
# Navigate to the project root
cd /Users/kimrada/Desktop/ProjectApp/Roadmap-App

# 2a. Clean previous builds and reinstall dependencies
rm -rf node_modules ios package-lock.json
npm install

# 2b. Generate the native iOS project
npx expo prebuild --platform ios --clean
```

> [!NOTE]
> When prompted *"Continue with uncommitted changes?"*, press **Y** to proceed.

#### Step 3: Install CocoaPods Dependencies

If `pod install` fails during prebuild (common on fresh setups), run it manually:

```bash
cd ios
LANG=en_US.UTF-8 pod install
cd ..
```

#### Step 4: Disable Script Sandboxing

Xcode's User Script Sandboxing blocks Expo/React Native build scripts. Disable it:

```bash
# Disable in the main project
sed -i '' 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/g' \
  ios/LifeRoadmapDailyStudyPlanner.xcodeproj/project.pbxproj

# Disable in the Pods project
sed -i '' 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/g' \
  ios/Pods/Pods.xcodeproj/project.pbxproj
```

#### Step 5: Open in Xcode & Configure Signing

```bash
open ios/LifeRoadmapDailyStudyPlanner.xcworkspace
```

In Xcode:
1. Select the **LifeRoadmapDailyStudyPlanner** project in the sidebar.
2. Go to **Signing & Capabilities** tab.
3. Check **"Automatically manage signing"**.
4. Under **Team**, sign in with your free personal Apple ID.
5. If needed, update the **Bundle Identifier** to something unique (e.g., `com.yourname.liferoadmap`).

#### Step 6: Start Metro Bundler & Run

```bash
# In a separate terminal window — start the JS bundler:
npx expo start --dev-client
```

In Xcode:
1. Connect your iPhone via **USB cable**.
2. On your iPhone: Go to **Settings → Privacy & Security → Developer Mode** and turn it **ON** (phone will restart).
3. In Xcode: Select your connected iPhone from the device dropdown at the top.
4. Press **▶ Run** (`Cmd + R`) to build and deploy to your device.

#### Step 7: Trust the Developer Certificate (First Launch Only)

On your iPhone:
1. Go to **Settings → General → VPN & Device Management**.
2. Tap your Apple ID under "Developer App".
3. Tap **Trust** to allow the app to run.

> [!TIP]
> Free Apple ID builds expire after **7 days**. Simply re-run from Xcode (`Cmd + R`) to reinstall. No data is lost.

#### Troubleshooting

| Error | Cause | Fix |
| :--- | :--- | :--- |
| `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` | Node.js < v22 | `nvm use 22` |
| `xcodebuild requires Xcode` | xcode-select points to CLI Tools | `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` |
| `Encoding::CompatibilityError` (CocoaPods) | Terminal not using UTF-8 | `export LANG=en_US.UTF-8` (add to `~/.zshrc`) |
| `Sandbox: deny file-write-create ip.txt` | User Script Sandboxing enabled | Set `ENABLE_USER_SCRIPT_SANDBOXING = NO` (see Step 4) |
| `Command PhaseScriptExecution failed` (Release build) | Xcode using system Node 18 instead of Node 22 | Set Node 22 path in `ios/.xcode.env.local`: `echo "export NODE_BINARY=$(which node)" > ios/.xcode.env.local` |
| `No script URL provided` | Metro bundler not running | Run `npx expo start --dev-client` in a separate terminal |
| `PluginError: expo-status-bar` | Listed in `plugins` but isn't a config plugin | Remove `"expo-status-bar"` from `plugins` array in `app.json` |

---

### Method 3: Deploy to TestFlight or App Store (EAS Cloud)
*(Requires a paid Apple Developer Account — $99/year)*

```bash
cd /Users/kimrada/Desktop/ProjectApp/Roadmap-App

# Build for TestFlight internal testing:
eas build -p ios --profile production

# Automatically submit to TestFlight:
eas submit -p ios
```

---

## 🔒 100% Offline & Account-Free Architecture

* **Zero Accounts**: You never have to sign up, log in, or remember passwords.
* **100% Offline**: All roadmaps, tasks, streaks, notes, and timers are saved locally on the device using `AsyncStorage`.
* **Private & Secure**: None of your personal life planning data leaves your phone unless you choose to paste a Google Apps Script webhook URL in Settings.
* **Backup Anytime**: Tap **Settings → Export JSON** to copy a complete backup of all roadmaps and notes.

---

## 💡 Key Features Overview

* 🗺️ **Multi-Roadmap Engine**: Create unlimited life roadmaps with custom durations (7d, 14d, 30d, 60d, 90d, 180d, 365d, or custom day counts).
* 🌐 **Built-in Presets**:
  * Huawei Networking → AI (180 Days original curriculum)
  * Full-Stack Software Engineer (90 Days)
  * Body & Fitness Transformation (60 Days)
  * 30-Day Daily Habit Mastery
* ⏰ **Daily Study Alarm**: Set a daily focus time with in-app banner alerts.
* ⏱️ **Pomodoro & Routine Timer**: Selectable modes (Learn 20m, Practise 30m, Review 10m, Pomodoro 25m, Deep Focus 50m) with digital countdown.
* ✅ **Daily Tasks Checklist**: Priority badges, durations, and completion tracking.
* 📝 **Daily Reflection Journal**: Auto-saving notes for every single day.
* 📅 **Timeline Matrix**: Bird's-eye view of all milestones and phases.

* 🤖 **OpenAI ChatGPT AI Engine (New!)**:
  * **1. AI Roadmap Generator**: Architect complete 14–180 day customized roadmaps from a single prompt.
  * **2. Course Lesson Generator & Uploader**: Create in-depth lecture notes, theory, and CLI commands for any day, or upload custom lesson text.
  * **3. AI Practice, Lab & Quiz Generator**: Real-world hands-on lab challenges, interactive knowledge quizzes with instant feedback, and actionable tasks that import directly into the Pomodoro Routine Timer!

---

## 🤖 OpenAI ChatGPT AI Engine Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OPENAI CHATGPT ENGINE INTEGRATION                     │
├───────────────────────┬────────────────────────────┬────────────────────────┤
│ 1. AI ROADMAP CREATOR │ 2. COURSE LESSON GENERATOR │ 3. PRACTICE & QUIZ LAB │
├───────────────────────┼────────────────────────────┼────────────────────────┤
│ • Custom prompt/goals │ • Deep theory concepts     │ • Real-world lab tasks │
│ • 14 to 180 day spans │ • CLI syntax & code blocks │ • Interactive MCQ quiz │
│ • Multi-phase builder │ • Gotchas & Cheat-sheets   │ • Instant green/red    │
│ • Direct app import   │ • Upload custom notes/PDFs │ • 1-tap Routine Timer  │
└───────────────────────┴────────────────────────────┴────────────────────────┘
```

---

## 💳 Complete Step-by-Step Payment & API Key Setup Guide

You do **not** need expensive recurring subscriptions. OpenAI uses pay-as-you-go API credits. With **GPT-4o Mini**, a **$5 deposit will last for over 2,000 generated roadmaps and lessons**:

| Action | Estimated Cost with `gpt-4o-mini` |
| :--- | :--- |
| **Generate Full 90-Day Roadmap** | ~**$0.003** *(less than 1/3 of 1 cent!)* |
| **Generate Daily Course Lesson** | ~**$0.001** *(1/10 of 1 cent)* |
| **Generate Practice Lab & Quiz** | ~**$0.001** *(1/10 of 1 cent)* |

### Step 1: Create an OpenAI Platform Account
1. Open your browser and navigate to [platform.openai.com](https://platform.openai.com).
2. Sign in with Google, Microsoft, Apple, or your email.

### Step 2: Add a $5 Credit Balance (Billing)
1. Go to **Settings** → **Billing** (or go to [platform.openai.com/account/billing/overview](https://platform.openai.com/account/billing/overview)).
2. Click **"Add payment details"** and enter your card details (Credit Card, Debit Card, or Virtual Card).
3. Deposit a minimum of **$5 USD**.
4. *(Recommended)* Under **Usage Limits**, set a **Monthly Hard Limit** of `$5.00` or `$10.00` so OpenAI will never charge beyond your budget.

### Step 3: Create your Secret API Key
1. In the left navigation, click **API Keys** (or go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)).
2. Click **"+ Create new secret key"**.
3. Name it `RoadmapApp` and click **Create secret key**.
4. Copy the secret key (it looks like `sk-proj-abc123xyz...`). Keep it private.

### Step 4: Configure in the App
1. Open the app and go to the **Settings** tab.
2. Under **OpenAI ChatGPT Engine**, tap **"⚙️ Configure Key & Model"**.
3. Paste your key into the text field.
4. Tap **"🔍 Test Connection"** — you will see `✅ Connection Successful!`.
5. Tap **"Save AI Settings"**.

> [!NOTE]
> **Built-in Demo Preview Mode**: If you haven't added an API key yet or are testing offline, the app automatically runs in **Demo Mode**, so you can test and explore all 3 features immediately without errors.

---

## 🚀 How to Use the 3 AI Features in the App

### 1. AI Roadmap Generator (`Roadmaps` Tab)
1. Go to the **Roadmaps** tab (`activeTab === 'roadmaps'`).
2. At the top right, tap **"✨ AI Generator"**.
3. Type what you want to learn (e.g. *"Huawei HCIA Datacom & Cloud"*, *"Full-Stack React Native & Node"*, *"Cybersecurity Analyst"*, *"Japanese N3"*).
4. Select duration (**14, 30, 60, 90, or 180 Days**) and your experience level.
5. Tap **"🚀 Generate Roadmap"**. ChatGPT structures all phases and daily topics, adds it to your roadmaps list, and sets it in focus!

### 2. AI 4-Part Daily Lesson Creator & Document Uploader (`Today` Tab)
1. On the **Today** screen, inside the top Hero Card, tap **"📖 Course Lesson"**.
2. **Upload / Attach Reference Documents (HCIA Syllabus & Study Guides)**:
   - Tap **"📤 Upload / Doc"**.
   - Tap **"📂 Pick File (.txt, .md, .doc, .json)"** to import files directly from your phone/computer, or paste your HCIA study notes into the text area.
   - Choose scope:
     * **📄 Day X Doc**: Context strictly for today's lesson.
     * **🌐 Roadmap HCIA Doc**: Global context used by AI across all days in this roadmap.
     * **✏️ Direct Lesson**: Save static notes directly without AI synthesis.
   - Tap **"⚡ Save & Generate AI"** to immediately generate an authoritative lesson synthesizing your document!
3. **The 4-Part Daily Learning System**:
   - 📘 **Part 1 — Detailed Lesson**: Core concepts in simple English, architectural necessity (why this networking feature is needed), terminology glossary, real office-network example, and ASCII topology diagram.
   - 💻 **Part 2 — CLI Practice (30 mins)**: Huawei VRP command modes (`<Huawei>`, `[Huawei]`, `[Huawei-GigabitEthernet0/0/1]`), copy-pasteable configuration commands with comments, expected command output, parameter breakdowns, and verification routines.
   - 🧪 **Part 3 — Hands-on Lab (40 mins)**: eNSP topology diagram, IP Addressing & VLAN Table, equipment list, 3 practical exercises, troubleshooting intentional broken configurations with diagnostics & fixes, and completion checklist.
   - 📝 **Part 4 — Assessment and Notes (20 mins)**: Measurable learning objectives, comprehension quiz with answer key, daily reflection notes prompt, and next-day connection explaining how today supports Day N+1.

### 3. AI Practice Challenge & Hands-on Lab (`Today` Tab)
1. On the **Today** screen, tap **"⚡ Practice & Quiz"**.
2. Tap **"⚡ Generate Practice Challenge"**: AI builds:
   - 🧪 **eNSP Simulator Lab**: Scenario, equipment list, ASCII topology, IP addressing table, 3 hands-on configuration exercises, and a broken configuration troubleshooting challenge with diagnostic commands.
   - 🧩 **Certification Knowledge Check**: Multiple-choice questions with instant green/red feedback and technical explanations.
   - ⏱️ **Daily Focus Tasks**:
     * *Part 2 — CLI practice: Huawei VRP commands & verification (30 mins)*
     * *Part 3 — Hands-on lab: Build topology & troubleshoot mistakes (40 mins)*
     * *Part 4 — Assessment: Quiz, explain learnings & Day notes (20 mins)*
3. Tap **"➕ Import to Timer"**: Injects these 30m, 40m, and 20m sessions directly into Today's action checklist.
4. Tap **▶ Focus** on any task to link it to your Routine Timer and begin your focus sprint!

---

## 📁 Architecture & File Overview

- [`aiService.js`](file:///Users/kimrada/Desktop/ProjectApp/Roadmap-App/aiService.js): Core multi-provider AI engine (DeepSeek & OpenAI) implementing the deep 4-part curriculum prompt, reference document grounding, and eNSP lab templates.
- [`App.js`](file:///Users/kimrada/Desktop/ProjectApp/Roadmap-App/App.js): Complete UI integration with DocumentPicker file importer, reference document hub, 4-part lesson reader, interactive eNSP lab view with troubleshooting cards, and Pomodoro timer task importer.
- [`storage.js`](file:///Users/kimrada/Desktop/ProjectApp/Roadmap-App/storage.js): Added persistent `aiConfig` state for API keys and multi-provider selection.
- [`README.md`](file:///Users/kimrada/Desktop/ProjectApp/Roadmap-App/README.md): Complete documentation for AI features, setup guides, and the 4-Part Daily Learning System.


---

## 🆕 Update: Any-Subject AI, Durations, Full-Page Lessons, Unlimited Notes & 中文

### What changed
- **AI generation matches the selected roadmap, phase and day** for any subject (DevOps, networking, programming, fitness, languages...). Huawei VRP / eNSP guidance is only used when the roadmap or topic is Huawei/HCIA, and never forced into non-networking days (e.g. the Python month).
- **Generation options** on the Lesson and Practice pages: custom instructions, content language (app default / English / 简体中文) and reference documents. Documents are treated as supporting material only — they never change the roadmap, phase or day topic.
- **Roadmap duration**: the AI Roadmap Generator accepts any number of **days or weeks** (1–1000 days) and the result always has exactly that many days. Existing roadmaps can be resized from **Roadmaps → ✎ Edit / Duration** (or **Timeline → 📏 Duration**). A preview is shown before anything changes; completed days, lessons, practice and notes are kept, and nothing is deleted when shortening (merged or archived instead). You cannot shorten below your completed progress.
- **Lesson and Practice & Quiz are full-page screens** with complete scrolling for long content, **Copy** and **Export DOCX** (Word file via the share sheet). Document upload lives under *Generation options*.
- **Journey Notes** have no length limit, keep auto-saving, show an informational character counter, offer **Copy All** (this day or all days), ask before clearing and offer **Undo Clear**.
- **English / 简体中文** switch in Settings (saved). It translates the interface and is the default language for AI content.
- **Data safety**: storage is split per roadmap and per day (only changed records are written), a failed load never overwrites saved data, the API key is kept in the device keychain/keystore and is never included in JSON backups, and importing a backup asks for confirmation. Existing data is migrated automatically; the previous `life_roadmaps_v2` value is left in place as a backup.
- AI provider is DeepSeek (`deepseek-chat` / `deepseek-reasoner`) or OpenAI; older Gemini settings migrate to DeepSeek automatically. Any model ID can be typed in AI settings.

### Tests
```bash
npm test            # 67 Jest tests: AI prompts, schedule changes, DOCX, storage, i18n, UI flows
```

### Building
- The Expo SDK 54 CLI needs **Node 20+** (`nvm use 22`).
- New native modules were added: `expo-clipboard`, `expo-sharing`, `expo-secure-store`. Expo Go already includes them. For the standalone iOS/Android app, regenerate the native project and rebuild (`npx expo prebuild --platform ios` then `npx expo run:ios`, or an EAS build).
