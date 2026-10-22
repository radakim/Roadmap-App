# 🚀 Life Roadmap — Daily Routine & Life Planner

A full-featured personal roadmap, habit, and daily life planner built with **React Native & Expo**. Transform any study, career, certification, or life goal into an actionable timeline with daily focus routines, Pomodoro timer, action checklists, study alarms, and 100% offline capability.

---

## 📱 Quick Test on Your Phone (Expo Go)

You do **not** need to compile an APK or IPA to test your app. You can test live on your phone in 30 seconds:

```powershell
# 1. Open PowerShell and navigate into the project folder:
cd "c:\roadmap app\huawei-roadmap-android\huawei-roadmap"

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

## 🤖 Guide to Deploy & Install on Android

### Method 1: Build a Standalone `.apk` in the Cloud (EAS Build - Recommended)
No Android Studio or heavy tools required. EAS compiles the `.apk` in the cloud for free:

```powershell
# Step 1: Ensure you are in the project folder
cd "c:\roadmap app\huawei-roadmap-android\huawei-roadmap"

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

```powershell
cd "c:\roadmap app\huawei-roadmap-android\huawei-roadmap"

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
```powershell
cd "c:\roadmap app\huawei-roadmap-android\huawei-roadmap"
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

### Method 2: Install over USB via Mac & Xcode (Free Apple ID)
*(Requires a Mac with Xcode)*

1. Navigate to your project and generate the iOS native workspace:
   ```bash
   npx expo prebuild --platform ios --clean
   ```
2. Open the Xcode project:
   ```bash
   open ios/HuaweiRoadmap.xcworkspace
   ```
3. In Xcode:
   * Select your project in the sidebar → go to **Signing & Capabilities**.
   * Check **"Automatically manage signing"**.
   * Under **Team**, sign in with your free personal Apple ID.
4. Connect your iPhone via USB:
   * On your iPhone: Go to **Settings → Privacy & Security → Developer Mode** and turn it **ON** (phone will restart).
   * In Xcode: Select your connected iPhone from the top target bar.
   * Press the **▶ Run** button.
5. First launch on iPhone:
   * Go to **Settings → General → VPN & Device Management** → Tap your Apple ID and tap **Trust**.
*(Free Apple ID builds can be renewed anytime by re-running from Xcode).*

---

### Method 3: Deploy to TestFlight or App Store (EAS Cloud)
*(Requires a paid Apple Developer Account — $99/year)*

```powershell
cd "c:\roadmap app\huawei-roadmap-android\huawei-roadmap"

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
