# Trust-band logos

Drop the official logo files here to display real logos in the hero trust band.
The band ([components/TrustLogos.tsx](../../components/TrustLogos.tsx)) looks for
these exact filenames and falls back to a styled text wordmark when a file is
missing — so there are never broken images.

Expected files (SVG preferred; PNG with transparent background also works):

- `vipps.svg`
- `bankid.svg`
- `dnb.svg`
- `telenor.svg`
- `posten.svg`

## Where to get the official assets

Use each company's own brand / press resources, e.g.:

- Vipps MobilePay — developer/brand portal
- BankID — bankid.no press/brand material
- DNB — dnb.no presse / brand guidelines
- Telenor — telenor.com newsroom / brand assets
- Posten — posten.no/presse

## Two important caveats

1. **These are placeholders.** A "built for / trusted by" logo wall implies the
   companies are customers or partners. Only show logos of organisations you
   actually work with, ideally with their written permission. Otherwise it can
   be misleading and a trademark issue.
2. The band sits on a dark green background, so use **light/monochrome (white)**
   versions of each logo where available for the cleanest look.
