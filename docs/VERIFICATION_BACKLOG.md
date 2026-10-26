# Verification backlog

Everything in the production library is currently **Needs verification**. No record or claim is
Verified. This file lists what is missing, so a reviewer can work through it with the manufacturer
documents in hand.

## Why the records are empty

- **Inner Range:** `www.innerrange.com` is reachable. Product names, part numbers (SKUs) and product-page
  URLs were confirmed on 2026-10-26. Datasheet PDFs are served from a separate host
  (`*.filesusr.com`) that the network policy blocks, so no technical values could be read. Some product
  pages (996300 Inception, 996035PCB&K IAC) returned a bot check and were not used.
- **Axis, Takex, Tecom:** `axis.com`, `takex-eng.co.jp` and `aritech.com.au` are still blocked, and web
  search returned only third-party reseller pages. Nothing was recorded from unconfirmed sources.

Product pages have no document revision, so claims citing them cannot be Verified even after review.
Verification needs the datasheet or installation manual with its revision.

## Real device records (17)

For every device below, these are still empty and need sourcing from a revisioned manufacturer
document: hardware/firmware revisions, power requirements, terminal assignments, specifications,
installation and commissioning notes. For Axis, Takex and Tecom the model name, part numbers and
document links are also unconfirmed.

| Manufacturer | Device | Record id | Extra notes |
|---|---|---|---|
| Inner Range | Integriti Security Controller (ISC) — 996001PCB&K | `inner-range-integriti-controller` | Name + part number confirmed on product page. Needs datasheet / install manual and PCB revisions |
| Inner Range | Inception Controller | `inner-range-inception-controller` | Name confirmed on controllers page only. Part number, documents and all technical data missing |
| Inner Range | Intelligent LAN Access Module (ILAM) — 996018PCB&K | `inner-range-ilam` | Name + part number confirmed. Needs datasheet |
| Inner Range | Standard LAN Access Module (SLAM) — 996012PCB&K | `inner-range-slam` | Name + part number confirmed. Needs datasheet |
| Inner Range | SIFER Reader — 994720 | `inner-range-sifer-reader` | Name + part number confirmed. Needs datasheet and reader variants |
| Inner Range | EliteX OLED Keypad — 995400 | `inner-range-elitex-oled-keypad` | Name + part number confirmed (replaces the unconfirmed "Elite Terminal" record) |
| Inner Range | PrismaX Colour LCD Keypad — 996400 | `inner-range-prismax-keypad` | Name + part number confirmed. Needs datasheet |
| Tecom | ChallengerPlus | `tecom-challengerplus` | Confirm part number (reported as TS-CHPLUS by a third party) and current brand owner |
| Tecom | Challenger10 | `tecom-challenger10` | Confirm part number (reported as TS1016 by a third party) and support status |
| Axis | AXIS P3265-LVE | `axis-p3265-lve` | Datasheet and installation guide |
| Axis | AXIS Q6135-LE | `axis-q6135-le` | Datasheet and installation guide |
| Axis | AXIS A1601 | `axis-a1601` | Datasheet and installation guide |
| Axis | AXIS I8016-LVE | `axis-i8016-lve` | Datasheet and installation guide |
| Axis | AXIS A8207-VE Mk II | `axis-a8207-ve-mk-ii` | Datasheet and installation guide |
| Axis | AXIS T8508 | `axis-t8508` | Datasheet and installation guide |
| Takex | PA-6810 | `takex-pa-6810` | Confirm full model suffix used in Australia |
| Takex | PB-100TE | `takex-pb-100te` | Confirm current model/series name |

## Manufacturer records (4)

| Manufacturer | Unconfirmed |
|---|---|
| Inner Range | Confirmed 2026-10-26: website and head office (Mount Waverley, Victoria) from the About Us page |
| Tecom | Country, current brand owner (Aritech / parent company), website |
| Axis Communications | Official website, head office (recorded as SE), parent company |
| Takex | Official website, head office (recorded as JP) |

## Wiring configurations and troubleshooting workflows

None exist for real devices. All 2 wiring configurations and 5 workflows are **demonstration only**
and are visible only in demo mode.

## How to verify a claim

1. Add the manufacturer document to `content/sources/` with title, document number, revision,
   publication date, URL and the date you confirmed the URL (`accessedDate`).
2. Add the claim to the device file with `sourceRefs` (include a page/section `locator`),
   `appliesToRevisions` (the hardware/firmware revisions you checked) and, once checked, a
   `review` (`reviewedBy`, `reviewedAt`) and `"status": "verified"`.
3. Run `npm test`. If any evidence is missing, the test names the claim and the reason, and the
   app will display it as Needs verification regardless.
