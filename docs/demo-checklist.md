# Demo checklist

A short preparation list for demonstrating TowerGuard live. The step-by-step walkthrough is in the
[README](../README.md#demo-walkthrough-35-minutes).

## Before the demo

- [ ] Run the production build: `npm ci`, `npm run build`, `npm start`. Open the app at
      `http://localhost:3000`, not a network IP address.
- [ ] Use a fresh browser profile, or a guest window, so the dashboard starts empty and no
      earlier test data appears.
- [ ] Have the three demonstration photographs from `docs/demo-photos/` ready to upload (see
      below).
- [ ] Prepare the demonstration inspection details and the photo captions below.
- [ ] Check print settings once: destination **Save as PDF**, paper **A4**, **Headers and footers**
      turned off, **Background graphics** on.
- [ ] Rehearse the full walkthrough and keep it under five minutes.
- [ ] Have a backup screen recording of the walkthrough in case of network, projector or browser
      problems.

## During the demo

- [ ] Show the AI status statement on the dashboard. TowerGuard is a human-led workflow, and
      automated AI inference is not implemented.
- [ ] Create findings from annotations, so the evidence links are visible.
- [ ] Finalise the inspection before opening the report, so it shows "Finalised documentation".
- [ ] Print or save the report as PDF.
- [ ] Demonstrate **Export data (JSON)** and point out that it is a data file, not the report.

## Demo photographs

Three third-party demonstration photographs are included in `docs/demo-photos/`. Their
photographers, sources, licences and SHA-256 hashes are listed in
[demo-photos/CREDITS.md](demo-photos/CREDITS.md). They are demonstration assets, not verified
photographs from a TowerGuard field inspection. The app does not load them automatically: upload
them through the normal photo-upload workflow.

| File | Suggested use |
|---|---|
| `demo-01-lattice-tower-nextelsys-wikimedia-cc-by-sa-4.0.jpg` | Tower overview and lattice structure |
| `demo-02-lattice-tower-top-assad-tanoli-unsplash.jpg` | Lattice tower component context |
| `demo-03-monopole-head-anderson-wei-pexels.jpg` | Close-up annotation of antenna and monopole components |

The images in `e2e/fixtures/` are synthetic test images, labelled as such. They are for automated
tests only and are not inspection photographs.

### Demonstration inspection

Create the inspection manually with these details:

- **Site ID:** `DEMO-01`
- **Site name:** `Demonstration inspection (third-party photographs)`
- **Location:** leave unrecorded.
- **Notes:**

  > Demonstration only. The photographs are third-party images used under their respective
  > licences (see each photograph's caption). They were not taken during a field inspection. Any
  > annotations, observations and findings recorded here are illustrative and must not be
  > interpreted as verified statements about the condition of the structures shown.

### Photo captions

After uploading, open each photograph and enter its caption in **Caption & viewpoint**, then
choose **Save details**. The caption appears in the gallery, on the photograph page, in the
report's photograph register and in the JSON export.

1. `demo-01…`: Demo photo: Lattice Tower by Nextelsys, Wikimedia Commons, CC BY-SA 4.0
   (https://creativecommons.org/licenses/by-sa/4.0/). Original photograph unmodified.
2. `demo-02…`: Demo photo by Assad Tanoli on Unsplash (Unsplash Licence). Original photograph
   unmodified.
3. `demo-03…`: Demo photo by Anderson Wei on Pexels (Pexels Licence). Original photograph
   unmodified.

The SHA-256 that TowerGuard shows for each uploaded photograph matches the hash in
`CREDITS.md`, which is a quick way to show that the original is stored unchanged.

### Annotations and findings in the demonstration

- Draw every annotation and enter every finding manually; TowerGuard does not create them
  automatically.
- Do not annotate the pedestrian visible in photograph 1.
- Do not present any visible feature as a verified defect. Use neutral, descriptive wording, such
  as "yellow paint marks on antenna mount", not claims of corrosion or structural failure unless
  they have been independently established.
- A report or PDF showing photograph 1 with annotations may be an adaptation under CC BY-SA 4.0.
  If you share it, keep the attribution, state that annotations were added, and share it under
  the same licence. See `CREDITS.md`.

### Requirements for other photographs

Any other photograph used in a demo must:

- be owned by the presenter, or used under a licence that permits this use, with the licence and
  attribution recorded;
- show telecom towers or steel structures, ideally including visible details such as bolted
  connections, coating wear or surface rust that are worth annotating;
- be JPEG, PNG or WebP, under 20 MB each (2–8 MB uploads quickly);
- contain no personal data, such as identifiable people, vehicle number plates or private property
  details, unless permission has been obtained.

Do not present generated or synthetic images as real inspection photographs.

## Afterwards

- [ ] Clear the demo data if needed: delete the demo inspection in the app, or close the guest or
      temporary profile.
