# Midweek Meeting Timer — Capacitor Android & Cloud APK Build Plan

A fast, 100% offline-ready Midweek Meeting Timer built with separated HTML, CSS, and vanilla JavaScript modules bundled via Vite into `dist/` for Capacitor Android (`com.midweek.meetingtimer`). It combines a large thumb-friendly countdown stage, multi-week schedule management with offline Tesseract.js S-140/KHS image scanning and text auto-fill, native Capacitor haptics and keep-awake controls, plain-text overtime reporting, a native Android `SYSTEM_ALERT_WINDOW` floating overlay pill, and an automated GitHub Actions workflow to compile a downloadable `.apk` in the cloud.

## User Review & Critical Decisions

> [!IMPORTANT]
> This revised plan incorporates your Capacitor `dist` configuration, native Android 14/15/16 Kotlin floating overlay service, and GitHub Actions APK pipeline alongside the Phase 1 choices.

- **Pure Separated HTML, CSS & JS Bundled to `dist/`**: Uses modular CSS stylesheets and vanilla ES module JavaScript files bundled by Vite into `dist/`, matched to `capacitor.config.json` (`webDir: "dist"`).
- **Offline `tessdata/` via Vite Public Assets**: Places offline `tessdata` language data and local Tesseract worker/core files inside the public assets directory so Vite copies them automatically into `dist/tessdata/` with zero external CDN requests.
- **Midweek Meeting Focus & Dual Theme**: Streamlined exclusively for the Midweek Meeting while preserving both `Midnight` and `Clean Light` themes.
- **Native Capacitor Plugins + Web Fallbacks**: Integrates `@capacitor/haptics` (with Web Vibration API fallback) and `@capacitor-community/keep-awake` (with Screen Wake Lock fallback), plus a custom native `Overlay` Capacitor plugin (`OverlayPlugin.kt`, `OverlayService.kt`, `MainActivity.kt`) exposed seamlessly to the web layer (`window.AndroidOverlay`) with a browser Picture-in-Picture fallback for desktop/web testing.
- **Cloud APK Compilation (GitHub Actions)**: Includes a turnkey CI workflow (Node 20 + Java 21) that builds `dist/`, generates the Android project, injects the Kotlin overlay service, plugin, `MainActivity`, and `AndroidManifest.xml` (cleaning up Capacitor's default `MainActivity.java`), syncs Capacitor, runs Gradle `assembleDebug`, and uploads `app-debug.apk`.

---

## 1. Overview & Core Concept

- **What It Does**: Provides a zero-lag Android timing app and floating overlay for Midweek Meeting chairmen and timekeepers. Users manage weekly schedules, scan S-140/KHS images or paste schedule text offline, run drift-free countdowns with milestone vibrations, float a draggable mini-timer pill on top of JW Library or other apps, and copy clean plain-text overtime reports.
- **Target Audience & Context**: Midweek Meeting chairmen and stage operators running Android 14/15/16 devices offline in Kingdom Halls, building their APK directly in GitHub Actions without needing local Android Studio.
- **Key Value**: Full offline reliability, one-handed thumb ergonomics, native system-level floating controls while reading notes in another app, and one-click cloud APK packaging.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Timing & Floating Overlay (Timer Tab)**
   - Shows the active week's current part: large tabular countdown display (`MM:SS` remaining, switching to `+MM:SS` in Overtime), part title, section indicator (`Treasures`, `Ministry`, `Living as Christians`, or `Opening/Concluding`), speaker + assistant (`Student 1 (Asst: Assistant 1)`), and explicit status indicator (`On Time`, `Warning`, `Overtime`).
   - Bottom thumb-zone controls: big touch-friendly `Start / Pause`, manual `Next Part` (never auto-advances so actual overtime is recorded), `Reset`, and `Float Overlay`.
   - Tapping `Float Overlay` checks/requests Android overlay permission via the native `Overlay` plugin, launches the draggable floating pill over other apps, and keeps `Play/Pause`, `Next`, and `Open App` synchronized two-way between the pill and the web timer. In standard browsers, it falls back to a Picture-in-Picture canvas timer.

2. **Weeks, Offline OCR Scanner & Text Auto-Fill (Schedules Tab)**
   - Lists saved weekly folders (e.g., `December 4, 2026`) persisted in `localStorage`, with actions to activate, edit, or delete a week.
   - **Upload Schedule Image**: Runs Tesseract.js strictly against local `./tessdata/` and local worker assets. Primary parser clusters OCR bounding boxes by Y-coordinate rows into Left (Title), Middle (`X min.`), and Right (Names) columns; skips songs (`Awit Blg.` / `Song`) and prayers (`Panalangin` / `Prayer`); preserves Chairman's `Pambungad na Komento` and `Pangwakas na Komento`; formats student + assistant pairs; and excludes CBS Reader. Automatically falls back to Plan B line-by-line regex extraction when needed and renders an **editable preview table** before saving.
   - **Paste Schedule Text**: Preserves the instant offline text-paste Auto-Fill parser with live extraction preview.
   - **Manual Edit / Add-Part Drawer**: Lets users edit congregation/date/chairman and add, edit, reorder, or delete individual parts.

3. **Device, Haptics & Appearance Controls (Settings Tab)**
   - **Language Toggle (`English` / `Tagalog`)**: Translates every UI label, status tag, and plain-text overtime report instantly.
   - **Theme Toggle (`Midnight` / `Clean Light`)**: Switches semantic color variables cleanly without contrast regressions.
   - **Keep Screen Awake Toggle**: Uses `@capacitor-community/keep-awake` on Android (and `navigator.wakeLock` on web).
   - **Comprehensive Vibration Settings**: Individual toggles for `1:00` remaining (`200ms` single pulse), `0:30` remaining (`[150, 100, 150]` double pulse), and `0:00` Time's Up (`2000ms` long buzz), duration/intensity scaling, and a `Test Vibration` button powered by `@capacitor/haptics` + Web Vibration API fallback.

4. **Plain-Text Overtime Summary**
   - Available at meeting completion or via the summary trigger, displaying Allotted vs. Actual duration and Overtime per part.
   - `Copy Plain-Text Report` copies a clean bulleted report (no ASCII boxes or heavy symbols) formatted for Viber/Messenger.

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian stage-grade clarity—calm, glare-free Midnight mode for auditorium use and crisp Clean Light mode for preparation, with zero visual clutter.
- **Color Tokens & Accessibility**: Semantic `--bg-canvas`, `--bg-surface`, `--text-primary`, `--text-secondary`, and `--accent-primary` tokens across Midnight and Clean Light modes; section colors (`Treasures` amber, `Ministry` burnt-orange/gold, `Living as Christians` crimson, `Opening/Concluding` royal blue) always paired with explicit text labels.
- **Typography & Mobile Ergonomics**: Sans-serif UI typography paired with `tabular-nums` monospace countdown digits; fixed 3-tab bottom navigation (`Timer`, `Schedules`, `Settings`) and compact top bar under 15% of mobile viewport height; $\ge 44\text{px}$ touch hitboxes ($\ge 48\text{px}$ for primary timer controls); responsive 2-column layout on wider screens; zero static pill clusters, zero pulsing decorative dots, and zero thick left accent borders.

---

## 3. Key Product Decisions & Trade-Offs

- **Vite Bundling of Pure HTML/CSS/JS into `dist/`**
  - *Chosen Approach*: Keep HTML, modular CSS, and ES module JS cleanly separated while letting Vite bundle/minify scripts and copy `public/tessdata/` into `dist/`.
  - *Why*: Preserves easy file-by-file maintenance, eliminates framework runtime lag on Android WebViews, and cleanly satisfies Capacitor's `webDir: "dist"` expectation.
  - *Alternatives Considered*: Unbundled static `www/` copying (risks broken module paths or missed asset optimization).

- **Native Kotlin `OverlayService` + `OverlayPlugin` for Android 14/15/16**
  - *Chosen Approach*: Implement a dedicated foreground service (`android:foregroundServiceType="specialUse"`) using `WindowManager` (`TYPE_APPLICATION_OVERLAY`) with a compact draggable pill layout built programmatically in Kotlin (no fragile XML layout resource mismatches during CI injection), paired with a Capacitor `@CapacitorPlugin(name = "Overlay")` bridge and `MainActivity` registration.
  - *Why*: Programmatic Android views inside `OverlayService.kt` avoid missing-resource R-class issues when copied into a fresh `npx cap add android` project in GitHub Actions, while `specialUse` foreground service typing prevents Android 14+ startup crashes.
  - *Alternatives Considered*: Browser-only Picture-in-Picture (does not reliably stay interactive over JW Library on Android WebViews).

- **Cloud APK Assembly via Reproducible GitHub Actions Workflow**
  - *Chosen Approach*: Keep native Android templates in a clean template directory and assemble the full Android Gradle project ephemerally during CI (`npx cap add android`, copy Kotlin files + `AndroidManifest.xml`, remove generated `MainActivity.java`, `npx cap sync`, `./gradlew assembleDebug`).
  - *Why*: Keeps the repository lightweight and avoids committing bulky generated Gradle/Android boilerplate while guaranteeing deterministic cloud `.apk` builds on every push or manual dispatch.

---

## 4. Technical Architecture & Data Strategy

### System, Native Bridge & Cloud Build Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    Web Layer (Vite Build -> dist/)                        │
│  ┌──────────────┐   ┌────────────────────────┐   ┌─────────────────────┐  │
│  │ 3-Tab Shell  │   │ Drift-Free Timer &     │   │ Offline OCR         │  │
│  │ Timer|Weeks| │◄─►│ Plain-Text Reporter    │   │ (./tessdata/) +     │  │
│  │ Settings     │   │                        │   │ Text Auto-Fill      │  │
│  └──────────────┘   └───────────┬────────────┘   └─────────────────────┘  │
│                                 │                                         │
│         ┌───────────────────────┼───────────────────────┐                 │
│         ▼                       ▼                       ▼                 │
│  @capacitor/haptics    @capacitor-community/     Overlay Bridge           │
│  (+ navigator.vibrate) keep-awake (+ WakeLock)   (Capacitor Overlay +     │
│                                                   window.AndroidOverlay)  │
└─────────────────────────────────┬─────────────────────────────────────────┘
                                  │ Native Capacitor / JS Interface
                                  ▼
┌───────────────────────────────────────────────────────────────────────────┐
│              Android Native Layer (com.midweek.meetingtimer)              │
│  ┌────────────────────┐   ┌────────────────────┐   ┌───────────────────┐  │
│  │ MainActivity.kt    │──►│ OverlayPlugin.kt   │──►│ OverlayService.kt │  │
│  │ registers plugin   │◄──│ events: Play/Pause │◄──│ Draggable Pill    │  │
│  └────────────────────┘   │ Next / Open App    │   │ specialUse FGS    │  │
│                           └────────────────────┘   └───────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ Assembled & Signed (Debug) in Cloud
┌─────────────────────────────────┴─────────────────────────────────────────┐
│               GitHub Actions (.github/workflows/build-apk.yml)            │
│  Node 20 + Java 21 ─► npm install & build ─► cap add android ─► inject    │
│  Kotlin + Manifest ─► remove MainActivity.java ─► cap sync ─► assembleDebug│
└───────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Persistent State (`localStorage`)

- **Weeks Store (`km_weeks_v1`)**: Collection of weekly Midweek Meeting objects (`id`, `weekLabel`, `congregationName`, `chairman`, `parts[]`) plus `activeWeekId`, with automatic migration from legacy single-agenda `localStorage` keys.
- **Part Model**: `id`, `title`, `section` (`opening | treasures | ministry | living | concluding`), `speaker`, `assistant`, `isTalk`, `plannedMinutes`, `actualSeconds`, `completed`, `firedAlerts`.
- **Settings Store (`km_settings_v1`)**: `language` (`'tl' | 'en'`), `theme` (`'midnight' | 'light'`), `keepAwake` (`boolean`), and `vibration` (`enabled`, `alert60`, `alert30`, `alert0`, `duration60Ms`, `duration30Ms`, `duration0Ms`, `intensityScale`).

### Native Bridge & Event Mapping

- **Web -> Android (`Overlay` Capacitor Plugin & `window.AndroidOverlay` alias)**:
  - `checkPermission()` / `requestPermission()`: Opens `ACTION_MANAGE_OVERLAY_PERMISSION` for `package:com.midweek.meetingtimer` when not yet granted.
  - `show(state)` / `updateState(state)` / `hide()`: Starts or updates `OverlayService` via foreground service Intent extras (`remainingSeconds`, `isOvertime`, `partTitle`, `speaker`, `isRunning`, `sectionColor`).
- **Android -> Web (`overlayAction` Capacitor Event & `window.onAndroidOverlayAction`)**:
  - `PLAY_PAUSE`: Toggles active timer state and pushes updated state back to `OverlayService`.
  - `NEXT_PART`: Advances manually to next part (recording actual/overtime seconds) and refreshes pill.
  - `OPEN_APP`: Fires launch Intent (`FLAG_ACTIVITY_REORDER_TO_FRONT | FLAG_ACTIVITY_SINGLE_TOP`) to bring `MainActivity` back over JW Library.
- **Android Manifest Contract**:
  - Permissions: `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, `VIBRATE`, `WAKE_LOCK`.
  - Service declaration: `OverlayService` with `android:exported="false"` and `android:foregroundServiceType="specialUse"` plus `<property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" ... />` for full Android 14/15/16 compliance.
