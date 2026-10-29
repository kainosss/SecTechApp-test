# Fieldwise pilot testing guide (v0.9.0)

For a controlled pilot with 3–5 electronic security technicians. Allow about 60–90 minutes.
Use a phone for most tasks; a laptop is useful for the Excel and PDF tasks.

## Before you start
- Fieldwise is a **pilot build**. It runs in your browser with no account. Everything you enter is saved in this
  browser on this device only — there is no cloud sync and nothing is sent anywhere.
- Clearing browser data, private browsing or changing device can lose your records. Download a backup if you
  enter anything you want to keep.
- Don't enter real customer names, addresses, IP addresses, passwords or alarm codes during the pilot. Use the
  demo site, or made-up details.
- Technical content is labelled **Verified against manufacturer documentation**, **Generic training example** or
  **Requires verification**. Nothing in the pilot is manufacturer-approved unless it says Verified. Always follow
  the manufacturer's documentation and the panel's programmed configuration.
- Resistance is only ever measured on a de-energised circuit. Fieldwise never asks you to measure live.

## How to give feedback
Open **Feedback** (sidebar on desktop; Help → Write feedback, or `/feedback`, on a phone). Choose a type, fill in
whatever is useful, then **Copy feedback** or **Download as a file** and send it to the pilot coordinator the way
they asked. Fieldwise doesn't send anything itself, and it doesn't attach screenshots, records or device details.
Please report anything that is wrong, confusing, slow or hard to tap.

## Tasks
Tick each one and note anything that surprised you.

| # | Task | What to check |
|---|------|---------------|
| 1 | **Find a device.** From the dashboard, search for a device you know (e.g. a model number) and open it. | Could you find it quickly? Are the terminal and status labels clear? |
| 2 | **Use the EOL Wiring Assistant.** Open EOL, try the 2k2/4k4 generic example, then the Tecom example, and switch the zone between sealed, alarm, tamper, cut cable and short. | Readings: 2.2 kΩ / 4.4 kΩ (or 10 kΩ / 20 kΩ), open for tamper/cut, ~0 Ω short. Is the "Resistor values" status label clear? |
| 3 | **Complete a Circuit Lab exercise.** Open Circuit Lab → Wiring bench and wire the dual EOL detector until it's marked correct. Use the multimeter. | Do the meter readings make sense? Is OL shown for open circuit? Are the controls usable on your phone? |
| 4 | **Follow a Fault Finder scenario.** Pick "Zone permanently open" and work through it with example readings. | Is the guidance sensible and safe? Is anything technically wrong? Try the linked Circuit Lab exercise. |
| 5 | **Explore the demo site.** Dashboard → Explore the demo site (or Help → Demo site). Browse the Riverside Business Centre register, open a camera and look at its history. | Is it obvious this is demo data? Is the yellow Demo workspace banner visible? |
| 6 | **Add equipment.** In the demo register, add an IP camera using Quick Entry. | Is Quick Entry fast enough on site? Any missing fields? |
| 7 | **Create a service report.** From the demo register, under "Service reports for this site", start a CCTV report. | Is the site filled in? Can you get back to the register ("View site register")? |
| 8 | **Link equipment to the job.** In that report, add equipment from the site register and record a fault on one item. Then open "Open equipment record and service history". | Does the equipment history show the job? |
| 9 | **Generate a PDF.** Open the client handover PDF for a report, preview it and download it. | Does the PDF look professional? Any wrong or missing information? (Network details are intentionally left out.) |
| 10 | **Export Excel.** Export the technical register and a service report to Excel and open them. | Readable on screen and when printed? |
| 11 | **Back up and restore.** Exit the demo (banner → Exit demo). Create a small register of your own with made-up details, download a complete backup (Technical Docs → Backup), then restore it (merge) — ideally in a different browser. | Was it clear what would be restored? Did everything come back? |
| 12 | **Submit feedback.** Use the Feedback page to send at least one piece of feedback. | Was it clear that nothing was sent automatically? |

When you've finished, the demo can be reset from the banner ("Reset demo…"); your own records aren't touched.
Help → "Show the welcome again" brings back the first-run welcome.

## Questions for the debrief
1. Which tool would you actually use on site, and which wouldn't you?
2. Did anything look technically wrong, or could it mislead a less experienced technician?
3. Was any label (Verified / Generic training example / Requires verification / Demo) unclear?
4. What slowed you down on your phone?
5. What would stop you using Fieldwise for real jobs?

## For the pilot coordinator
- Host the build at one stable HTTPS address for the whole pilot (browser storage is tied to the address — see
  `docs/CLOUDFLARE_DEPLOYMENT.md`). Testers get the shorter `docs/PILOT_TESTER_GUIDE.md`. Don't enable `FIELDWISE_DEMO_MODE` for the pilot; the demo site works without it.
- Optional: set `NEXT_PUBLIC_FEEDBACK_EMAIL` at build time to a real inbox you control to show an "Open as email
  draft" option. Without it, testers copy or download feedback.
- Collect feedback files/messages in one place and tag each with its type and severity. Treat every
  "Incorrect technical information" report as a priority review item; never mark content Verified because of a
  pilot comment alone (see `docs/TECHNICAL_REVIEW.md`).
