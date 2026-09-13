# Training deck

The Training Center's intro topic embeds a PDF deck and offers the PPTX for download.
Drop the Verde versions here with **these exact names** (see `lib/training.ts`):

| File | What it is |
|------|-----------|
| `verde-intro.pdf`  | Intro deck, exported as PDF (embedded in the viewer) |
| `verde-intro.pptx` | Same deck as PowerPoint (download link) |

Screenshots for the other topics are regenerated from the running app with
`BASE=http://localhost:3000 npx tsx scripts/capture-training.ts` — until then the
Training Center shows a placeholder for each step image.
