# Verification backlog

Everything in the production library is currently **Requires verification**. No record or claim is
Verified. This file lists what is missing, so a reviewer can work through it with the manufacturer
documents in hand.

## Why the records are empty

- **Inner Range:** `www.innerrange.com` is reachable. Product names, part numbers (SKUs) and product-page
  URLs were confirmed on 2026-10-26. Datasheet PDFs are served from a separate host
  (`*.filesusr.com`) that the network policy blocks, so no technical values could be read. Some product
  pages (996300 Inception, 996035PCB&K IAC) returned a bot check and were not used.
- **Axis:** `www.axis.com` became reachable on 2026-10-26. Datasheets, installation guides and product
  discontinuation statements were downloaded and transcribed with document numbers, revisions and page
  references. Nothing has been reviewed by a person yet.
- **Takex, Tecom:** `www.takex-eng.co.jp` is still blocked; `www.aritech.com.au` redirects to
  `aritech.com.au`, which is blocked. Nothing was recorded from unconfirmed sources.

Product pages have no document revision, so claims citing them cannot be Verified even after review.
Verification needs the datasheet or installation manual with its revision.

## Real device records (16)

No claim anywhere has a reviewer yet. Device hardware/firmware revisions (`appliesToRevisions`) are not
recorded for any claim, and must be added at review time. For Takex and Tecom the model name, part numbers
and document links are also unconfirmed. The AXIS T8508 record was removed: its official product page
returns 404.

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
| Axis | AXIS P3265-LVE (discontinued 31 Dec 2025) | `axis-p3265-lve` | Power, connectors, environment from datasheet T10170893 M27.2; variants and lifecycle from discontinuation statement. Needs review; I/O pin assignments not recorded (guide is pictorial) |
| Axis | AXIS Q6135-LE (discontinued 16 Mar 2026) | `axis-q6135-le` | Power, connectors, environment from datasheet T10144009 M38.2; variants and lifecycle from discontinuation statement. Needs review |
| Axis | AXIS A1601 (discontinued 31 Dec 2023) | `axis-a1601` | Full terminal tables from installation guide Ver. M12.5 (pp. 20–27), power and specs from datasheet T10125109 M15.2, install notes. Needs review. EOL wiring for supervised inputs not recorded (diagram-only in guide) |
| Axis | AXIS I8016-LVE | `axis-i8016-lve` | Power, connectors, environment from datasheet T10160894 M40.2. Needs review; installation guide not yet sourced |
| Axis | AXIS A8207-VE Mk II | `axis-a8207-ve-mk-ii` | Power, connectors, environment from datasheet T10147068 M34.2. Needs review; installation guide not yet sourced |
| Takex | PA-6810 | `takex-pa-6810` | Confirm full model suffix used in Australia |
| Takex | PB-100TE | `takex-pb-100te` | Confirm current model/series name |

## Manufacturer records (4)

| Manufacturer | Unconfirmed |
|---|---|
| Inner Range | Confirmed 2026-10-26: website and head office (Mount Waverley, Victoria) from the About Us page |
| Tecom | Country, current brand owner (Aritech / parent company), website |
| Axis Communications | Website confirmed; head office Lund, Sweden (discontinuation statement footer). Parent company not recorded |
| Takex | Official website, head office (recorded as JP) |

## Wiring configurations (EOL Wiring Assistant)

No real panel configuration exists. Inner Range Integriti, Inner Range Inception, Tecom ChallengerPlus and
Tecom Challenger10 show **No verified configurations available**. To add one, the reviewer needs, from the
panel's installation/programming manual (with revision):

- panel input terminal labels and the panel HW/FW revisions the manual covers
- EOL scheme options supported by that panel and firmware (e.g. single / dual / triple EOL)
- resistor values and where each sits (series/parallel with which contact)
- the reading or threshold band the panel uses for sealed, alarm, tamper, open and short
- how the panel reports each state (so overlaps such as tamper vs cable open can be resolved)

Then enter it in `content/wiring/` and run `npm test`: the loader lists anything still missing.
Blocked sources: Inner Range manuals are on `*.filesusr.com`; Tecom documentation on `aritech.com.au`.

Example presets: "Integriti example" (2.2 kΩ seal / 4.4 kΩ alarm) and "Tecom example" (10 kΩ / 20 kΩ)
are provisional user-supplied values. They are not linked to any Device Library panel and must not be
treated as manufacturer specifications until confirmed from each panel's documentation — including which
resistor arrangement the panel requires (both DEOL arrangements can produce the same readings).

All 8 existing wiring records (5 generic, 2 linked to the fictional AP-8 panel) are demonstration only.

## Troubleshooting workflows

All 5 workflows are demonstration only and visible only in demo mode.

## How to verify a claim

1. Add the manufacturer document to `content/sources/` with title, document number, revision,
   publication date, URL and the date you confirmed the URL (`accessedDate`).
2. Add the claim to the device file with `sourceRefs` (include a page/section `locator`),
   `appliesToRevisions` (the hardware/firmware revisions you checked) and, once checked, a
   `review` (`reviewedBy`, `reviewedAt`) and `"status": "verified"`.
3. Run `npm test`. If any evidence is missing, the test names the claim and the reason, and the
   app will display it as Requires verification regardless.
