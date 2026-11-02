# Install AbyEx on iPhone: the 3-step picture guide

**Status:** first drawn version is done (see "Drawn pictures" at the end). The questions at the end are still open and may change the pictures.
**Source pictures** (in this folder):

| File | Size | What it is |
|---|---|---|
| `step-1.jpeg` | 499 × 1080 | A screenshot of AbyEx open in Safari, with Safari's menu open on top of it |
| `step-2.jpeg` | 1080 × 805 | A zoomed-in crop of Safari's share sheet (the list of actions) |
| `step-3.jpeg` | 499 × 1080 | The iPhone Home Screen with the AbyEx icon on it |

**Why this guide exists:** iPhones have no "Install" button for web apps. The browser never shows one, so our own Install button (`InstallPrompt` in `frontend/src/components/push/prompts.tsx`) cannot work on iOS. The person has to do it by hand from Safari. Today we only show a short text hint (`push.iosHint`). This guide replaces the hint with three pictures that show exactly where to tap.

**The idea in one line:** *Open the menu in Safari → tap Share → tap "Add to Home Screen" → tap Add → the AbyEx icon appears on your Home Screen.*

---

## Step 1: Open the menu and tap **Share**

**What the person does**
1. Open AbyEx in **Safari** (it must be Safari; see "Rules" below).
2. Tap the **three dots (⋯)** button in Safari's bottom bar. A small menu pops up.
3. In that menu, tap **Share** (the first row, with the square-and-arrow-up icon).

**What `step-1.jpeg` shows**
- AbyEx's *Settings* screen is open behind. You can see the **Install app** row ("Adds it to your home screen or taskbar…"), which is the row that sends people to this guide.
- On top is Safari's pop-up menu. From the top it lists: **Share**, Add to Bookmarks, Add Bookmark to…, New Tab, New Private Tab, and at the bottom Bookmarks and All Tabs.
- The three-dots button itself is **not clearly visible** in this picture. It sits at the bottom-right of the screen, and you can see only a soft glow under the menu at about the middle of the bottom edge (around x 250, y 910).

**What to draw** (positions are in the picture's own pixels, 499 × 1080)

| Mark | Where | Notes |
|---|---|---|
| Number badge **1** | Next to the Share row | The main mark of this step |
| Highlight box (rounded, accent colour) | Around the **Share** row, about x 175–440, y 685–728 | Dim everything else slightly so this row stands out |
| Arrow pointing at the **three dots** | Bottom-right corner, about x 440, y 960 | Small label: "Tap ⋯" |
| Caption (below or above the picture) | — | See wording below |

**Open question for you:** the three-dots button is the first thing the person must find, but it is barely visible. Either (a) I draw an arrow and a small ⋯ icon where it should be, or (b) you send a fresh screenshot of Safari's bottom bar *before* the menu is opened. Option (b) would be clearer.

**Caption (English)**
> **1. Tap Share.** In Safari, tap the **⋯** button, then tap **Share**.

---

## Step 2: Choose **Add to Home Screen**, then tap **Add**

**What the person does**
1. In the share sheet, scroll the list of actions until they see **Add to Home Screen** (square with a plus). It is below Add Bookmark to…, Add to Favorites, Add to Quick Note and Find on Page.
2. Tap **Add to Home Screen**.
3. iPhone then shows a small "Add to Home Screen" panel with the app name (**AbyEx**) and an **Add** button in the top-right corner. Tap **Add**.

**What `step-2.jpeg` shows**
- Only the *list of actions* from the share sheet, zoomed in: Add Bookmark to…, Add to Favorites, Add to Quick Note, Find on Page, **Add to Home Screen**. (Markup is cut off at the bottom.)
- It does **not** show the final panel with the name and the **Add** button. The picture ends at the list.

**What to draw** (picture is 1080 × 805)

| Mark | Where | Notes |
|---|---|---|
| Number badge **2** | Left of the last row | |
| Highlight box | Around the **Add to Home Screen** row, about x 45–1035, y 585–660 | Dim the other rows |
| Small arrow or finger pointing at the row | Right side of the row | |
| Hint over the row above | Text on the picture is **not** enough: the share sheet needs scrolling | A small "Scroll if you do not see it" note under the picture |

**Gap to fill:** the *Add* confirmation panel is missing. The step says "tap Add", and a person who only sees this picture will stop at the list and be confused when the next panel appears. Two ways to solve it:
- **A (best):** you take one more screenshot of that panel (name "AbyEx", **Add** at top right) and call it `step-2b.jpeg`. We then show 2a and 2b together.
- **B:** I draw a simple stand-in of that panel in the app's own style next to this picture. It will not look like the real iPhone panel.

**Caption (English)**
> **2. Add to Home Screen.** Scroll the list, tap **Add to Home Screen**, then tap **Add** in the top-right corner.

---

## Step 3: Done. AbyEx is on the Home Screen

**What the person sees**
- The **AbyEx** icon sits among their apps and opens full-screen like a normal app, with no Safari address bar.

**What `step-3.jpeg` shows**
- An iPhone Home Screen. Top row, left to right: 8 Ball Pool, RUSH: Xtreme, BubblePop!, and **AbyEx** (white rounded square, teal "A" with a receipt and a dollar coin; label "AbyEx"). Bottom dock: Phone, Safari, Messages, Music.
- The clock reads 17:36 and the signal shows 5G.

**What to draw** (picture is 499 × 1080)

| Mark | Where | Notes |
|---|---|---|
| Number badge **3** (or a green tick) | Next to the icon | Means "finished" |
| Ring or highlight around the **AbyEx icon** | About x 380–465, y 85–195 (icon plus its label) | Pulsing ring is fine in the app |
| Caption | — | See wording below |

**Privacy note:** the other apps and the red notification badges (1, 35, 118) belong to the person who took the screenshot. Decide whether to blur or crop them before we ship this to everyone. A blur over the other three icons and the dock would be enough.

**Caption (English)**
> **3. Open AbyEx from your Home Screen.** It opens full screen, like any other app.

---

## Rules the guide must say or respect

1. **It only works in Safari.** On iPhone, Chrome, Firefox, and the browsers inside Instagram, WhatsApp or Facebook cannot add web apps to the Home Screen. If the person is in one of those, the guide's first screen must say "Open this page in Safari first" and offer a **Copy link** button. The app already detects this with `isInAppBrowser()` in `frontend/src/context/pwa-install-context.tsx`.
2. **Notifications need the installed app.** On iPhone, web notifications only work after AbyEx is added to the Home Screen and opened from there (iOS 16.4 or newer). This is the reason many people will open this guide, so the last screen should say so.
3. **The pictures are from one iPhone and one version of Safari.** Safari's menu looks different on older iOS versions (older versions put **Share** as a button at the bottom centre, with no ⋯ menu). Keep the wording general ("tap Share") and keep the pictures as an example, with a small note "Your screen may look slightly different".
4. **The name on the icon comes from our files.** The icon label is "AbyEx", from `apple-mobile-web-app-title` in `frontend/index.html`, and the icon picture is the `apple-touch-icon`. Step 3 already shows the new icon, so nothing to change there.

---

## How it appears in the app (proposal)

- **Where it opens from:**
  - the **Install app** row in Settings (`screens/dashboard/profile.tsx`), shown on iPhone;
  - the panel in notification settings (`components/push/push-panel.tsx`), shown on iPhone;
  - the small "Install" pop-up (`InstallPrompt`), which never appears on iPhone today. We could add an iPhone-only version of it that opens the guide.
- **Shape:** a full-height bottom sheet with a title "Install AbyEx on iPhone", three slides (one per step) the person can swipe or tap through, and dots under them showing "1 · 2 · 3". Each slide is the drawn picture plus its caption. A **Done** button on the last slide closes it.
- **Buttons on the first slide:** "Copy link" (for people who are in the wrong browser) and "Start".
- **Language:** the captions live in `i18n/strings.ts` (keys like `pwa.ios.step1`), in English, French, Kinyarwanda and Swahili. The pictures keep their English iPhone text because that is what is on the person's screen, so the captions must say the English button names, for example: *tap **Add to Home Screen** (« Sur l'écran d'accueil »)*. This is an open point: if the phone is set to French, Safari's menu is in French too, and the captions should name both.

---

## Before we start drawing: what I need from you

1. **Step 1:** do you want an arrow where the ⋯ button is, or will you send a screenshot of Safari's bottom bar with the button visible?
2. **Step 2:** a screenshot of the final "Add to Home Screen" panel with the **Add** button (best), or should I draw a stand-in?
3. **Step 3:** blur the other apps and the notification badges, yes or no?
4. **Style of the marks:** accent colour of the app (teal `#00627F` / `#4CC3E3` in dark mode) with white number badges, rounded highlight boxes, and a soft dimming of everything else? Or something louder (red arrows)?
5. **Output:** should the finished pictures be saved as PNG files next to these (`step-1-marked.png` …) and shown as images in the app, or drawn live in the app on top of the original pictures (so the marks can be translated and re-coloured later)? I recommend the second for crispness and languages, but the first is simpler.

---

## Drawn pictures (first version)

Saved in `pwa-guides/marked/`. The original pictures are untouched. To redraw after a change, edit `draw-marks.ps1` (the positions are in each step's block) and run it in PowerShell.

| File | What was added |
|---|---|
| `step-1-marked.png` | Everything dimmed except the **Share** row, which has a bright outline, a **1** badge, a tap marker, an arrow, a "Tap Share" label, and a small note "First tap the three dots in Safari" |
| `step-2-marked.png` | Everything dimmed except **Add to Home Screen**, with a **2** badge, a tap marker, "Look for: Add to Home Screen" and "Then tap Add at the top right" |
| `step-3-marked.png` | The **AbyEx** icon outlined with a tick badge, and "Look for the AbyEx icon" / "Tap it to open the app". The other apps and the notification badges are blurred |

Decisions I made (change any of them):
- The marks use the app's teal.
- The other apps in step 3 are blurred.
- The labels on the pictures are English only. The app captions will be translated, and the text on the pictures can be removed and drawn live in the app later.
- I did **not** draw an arrow at the three-dots button, because it is not visible in `step-1.jpeg`.
