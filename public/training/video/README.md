# Training videos

The Training Center's **"Recording a new visit"** topic plays a bilingual how-to video
(English / हिंदी audio toggle). The player is wired in code; drop the two video files here
with **these exact names**:

| File | What it is |
|------|-----------|
| `visit-form-en.mp4` | The visit-form walkthrough with **English** voiceover |
| `visit-form-hi.mp4` | The **same footage** with **Hindi** voiceover |
| `visit-form-poster.png` | Thumbnail shown before play (already added — the intro slide) |

## How to publish
1. Copy your two exported videos into this folder and rename them exactly as above.
2. Commit and push:
   ```
   git add public/training/video/visit-form-en.mp4 public/training/video/visit-form-hi.mp4
   git commit -m "Training: add visit-form walkthrough videos (EN + HI)"
   git push origin main
   ```
3. That's it — the video appears on **Training → Recording a new visit** for every role.

## Please keep each file small (~30–40 MB)
These files live in git, so their size is added to every clone and deploy **permanently**.
A 3–4 min 720p screen recording compresses to ~30 MB with H.264. If your exports are larger,
re-encode before committing, e.g. with ffmpeg:
```
ffmpeg -i input.mp4 -vf "scale=-2:720" -c:v libx264 -crf 26 -preset slow -c:a aac -b:a 96k visit-form-en.mp4
```
(`-crf` higher = smaller file; 23–28 is a good range.)

If the files end up much larger than this, tell Claude — moving them to Azure Blob Storage or an
unlisted YouTube embed is a quick change and keeps the repo lean.
