# Browser-test fixtures

Image files used by `e2e/browser-check.mjs`.

| File | Format | Purpose |
|---|---|---|
| `tower-north-face.jpg` | JPEG, 2400 × 1600 | Valid upload; larger than the thumbnail size |
| `tower-leg-b.png` | PNG, 1200 × 900 | Valid upload |
| `tower-antenna-mount.webp` | WebP, 1200 × 1600 (portrait) | Valid upload |
| `unsupported.gif` | GIF, 1 × 1 | Rejected: unsupported format |
| `corrupt.jpg` | JPEG signature + non-image bytes | Rejected: cannot be decoded |

The JPEG, PNG and WebP files are **synthetic test images**: a simple lattice-tower drawing rendered with a
browser canvas and encoded by Microsoft Edge's own image encoders. Each image says so in its header text.
They are not inspection photographs and contain no real site data or EXIF metadata.

The over-size (> 20 MB) file is generated in the system temp folder at test time rather than committed.
