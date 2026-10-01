# Catch — lyrics & melodies

A pocket notebook for a songwriter, built to live on an iPhone home screen and
hosted on Vercel. A birthday present for Justin.

Pick what you're catching:

- **Lyrics** — tap the record and sing or say the line. It lands on a legal-pad
  lyric sheet, one line per pause (Web Speech API). Type or fix it by hand any
  time. The draft survives closing the app.
- **Melody** — tap the record and hum, whistle, or play. Catch records the raw
  audio (no phone-call noise suppression), draws a live waveform, and shows the
  note you're on like a tuner. Every take is **saved the moment you stop**. You
  can name it and jot chords/capo/tuning afterwards.

There's also a **guitar tuner** behind the tuning-fork button in the corner.
It listens without recording, works out which string is being played (or
sticks to one you tap), and has about two dozen presets: standard and drop,
down-tuned, open, and modal/folk tunings like DADGAD and CGCFCE. It also has a
capo setting and **Make my own**, which nudges any string up or down a semitone
and saves the tuning on the phone.

**Truck mode** (the truck button) turns the whole screen into one giant record
button that starts recording the moment it opens. Tap anywhere to save, tap
again for another take. While it's on, Catch opens straight into it — so
launching the app *is* hitting record — until he taps **Out of the truck**. It
keeps the screen awake, and takes land in Takes titled like `Truck · 9:41 PM`.

**Shed hours**: between 10pm and 5am a bare bulb hangs over the page and
everything goes dim and warm. (Set `catch:night` to `on`/`off` in
localStorage to force it either way.)

Everything lands in **Takes**, stored on the device (IndexedDB). Any take can be
**emailed** (melodies go as an audio attachment) or sent through the iOS
**share sheet** (Voice Memos, Messages, Files, AirDrop…).

The first launch shows a one-time birthday card. Edit the names and words in
`app/components/BirthdayCard.tsx`. The 🎁 button in the header reopens it.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · [Resend](https://resend.com)
for email · [Anthropic](https://console.anthropic.com) for the two-word subject
summary of lyric emails.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your keys
npm run dev                  # http://localhost:3000
```

## Environment variables

| Variable            | Required | Purpose                                                                      |
| ------------------- | -------- | ---------------------------------------------------------------------------- |
| `RESEND_API_KEY`    | yes      | Sends the email via Resend.                                                  |
| `NOTIFY_FROM_EMAIL` | yes      | Verified Resend sender, e.g. `Catch <catch@yourdomain.com>`.                 |
| `NOTE_RECIPIENT`    | **set this** | Where takes are emailed — **set it to Justin's address**. Defaults to `devinfarren@gmail.com`. |
| `ANTHROPIC_API_KEY` | no       | Generates a two-word subject for untitled takes. Falls back to the first two words. |

Email subjects look like `Lyrics · 9:41 PM · Sep 26, 2026 · Board by Board` or
`Melody · 11:02 PM · Sep 26, 2026 · Porch hum`.

Melodies longer than ~6 minutes are too big to email (Vercel's 4.5 MB request
limit). The app tells you to use Share for those.

## Deploy to Vercel

1. In [Vercel](https://vercel.com/new), **Import** this repository.
2. Add the environment variables above under **Settings → Environment Variables**.
3. Deploy. Next.js is auto-detected — no build configuration needed.

## Add to the iPhone home screen

1. Open the deployed URL in **Safari**.
2. Tap **Share → Add to Home Screen**. It installs as **Catch**.
3. Launch it from the home screen. It opens full-screen.
4. The first time you record, allow microphone access.

> **Notes:** Lyric dictation goes through Apple's speech service, so it needs a
> connection. Melody recording works offline. Takes live on the phone, so
> share or email the keepers.
