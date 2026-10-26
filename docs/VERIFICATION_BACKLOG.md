# Verification backlog

Everything in the production library is currently **Needs verification**. No record or claim is
Verified. This file lists what is missing, so a reviewer can work through it with the manufacturer
documents in hand.

## Why the records are empty

The build environment's network policy blocked the manufacturer sites (`innerrange.com`, `axis.com`,
`takex-eng.co.jp`, `aritech.com.au`), and web search returned only third-party reseller pages. Following
the content rules, no URLs, part numbers or technical values were recorded from unconfirmed sources.

## Real device records (15) — identification only

For every device below, **all** of these are still empty and need sourcing:
official document link(s) and revision, variants/part numbers, hardware/firmware revisions, power
requirements, terminal assignments, specifications, installation and commissioning notes.

The model name itself is also unconfirmed against manufacturer documentation.

| Manufacturer | Device | Record id | Extra notes |
|---|---|---|---|
| Inner Range | Integriti Security Controller | `inner-range-integriti-controller` | Confirm part number(s) and PCB revisions |
| Inner Range | Inception | `inner-range-inception-controller` | Confirm firmware/PCB revisions covered by the manual |
| Inner Range | Integriti Intelligent LAN Access Module | `inner-range-integriti-lam` | Confirm exact product name and variants |
| Inner Range | Elite Terminal | `inner-range-elite-terminal` | Confirm exact product name and variants |
| Inner Range | SIFER | `inner-range-sifer-reader` | Confirm reader variants (e.g. keypad / multi-format) |
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
| Inner Range | Official website, head office (recorded as AU) |
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
