# Demo checklist

A short preparation list for demonstrating TowerGuard live. The step-by-step walkthrough is in the
[README](../README.md#demo-walkthrough-35-minutes).

## Before the demo

- [ ] Run the production build: `npm ci`, `npm run build`, `npm start`. Open the app at
      `http://localhost:3000`, not a network IP address.
- [ ] Use a fresh browser profile, or a guest window, so the dashboard starts empty and no
      earlier test data appears.
- [ ] Have the approved demo photographs ready in one folder (see below).
- [ ] Prepare realistic inspection details: site ID, site name, structure type, inspector name,
      location and weather.
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

No demo photographs are included in this repository. The images in `e2e/fixtures/` are synthetic
test images, labelled as such, and are not inspection photographs.

Photographs used in a demo must:

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
