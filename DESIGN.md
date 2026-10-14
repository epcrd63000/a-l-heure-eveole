# Design system — À l'heure

## Direction

An operational Douai departure tool that turns the next published bus into a clear leave-by moment. The visual language takes its structure from a Wim Crouwel-style visible construction grid and a chronological departure register; the countdown, stop lookup, and schedule status remain more important than the grid.

## Palette and materials

- Cobalt `#2044ed`: primary brand plane and grid-built departure clock.
- Deep cobalt `#172eaa`: high-emphasis text actions.
- Ink `#111827`: text on white and pale blue-gray surfaces.
- Paper `#ffffff` and canvas `#f2f5fc`: content layers.
- Signal states: accessible dark green `#087443`, burnt orange `#a13e08`, red `#a11d16`, slate `#48536b`; each state also has explicit text.
- Hairline grid marks on the departure display only; square corners and fine blue rules carry the constructed-print language.

## Typography

- Segoe UI / system sans-serif for interface copy and controls; Arial Narrow where installed for tabular departure times.
- No remote font dependency: system fallbacks keep the interface quick to load and legible offline.

## Composition and interaction

- One oversized departure clock leads the page, followed by its stop/line summary, stop search, filters, and the next four departures.
- Controls use rectangular outlines, square corners, plain text labels, and visible keyboard focus.
- Urgency is expressed with both color and a direct message; red motion is limited to the under-one-minute state and disabled for reduced-motion preferences.
- The settings dialog is a side drawer on wider viewports and a bottom sheet on phones.
- The only persistent product data is user-controlled configuration and stop/line/direction favorites in local storage. Timetables remain network-derived.

## Responsive behavior

The wide layout keeps the clock and stop metadata on one row; narrow screens stack them, preserve a readable countdown, and wrap search filters. Departure rows collapse to time, route, walking estimate, and a separate favorite control.

## Data integrity

No sample timetable is displayed as live data. The public, static Évéole GTFS schedule on data.gouv.fr is theoretical and is never described as real-time. Unavailable feeds, an empty timetable, and a missing walking estimate each have explicit UI states. The app-shell offline cache does not claim to contain current departures.
