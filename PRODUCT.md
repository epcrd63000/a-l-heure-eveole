# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Inferred from the brief: residents and visitors using public transport in the Douai area who need to decide when to leave their current location to reach an Évéole stop.

## Product Purpose

Help a passenger find a nearby or named stop, see the next available Évéole departures, and calculate a practical leave-by time from walking time and a safety margin.

## Positioning

Unlike a timetable-only lookup, the primary result is the passenger's leave-by time, calculated from a selected departure and the walk to its stop.

## Operating Context

Inferred from the brief: primarily mobile use before or during a trip, with optional browser geolocation and an offline-capable application shell.

## Capabilities and Constraints

The application is a single-page, French-language PWA using browser geolocation, local storage, the official public Évéole GTFS dataset on data.gouv.fr, and an OSRM walking-route attempt with a 4.5 km/h straight-line fallback. GTFS offers scheduled theoretical times, not live vehicle data; clearly disclose that limitation and never label scheduled times as real time. Do not present sample or unverified times as live departures. Walking duration and a 1–10 minute safety margin are user-adjustable.

## Brand Commitments

The product name in the brief is Évéole; the network area is the Douai agglomeration.

## Evidence on Hand

The user supplied the functional brief. No API token, real-time Évéole feed, logo, or official brand assets were supplied. The operator's free static GTFS dataset was verified on data.gouv.fr.

## Product Principles

- Make the leave-by time more prominent than the timetable.
- Distinguish verified API data from unavailable or estimated information.
- Keep core trip settings and saved stop-line-direction combinations on the user's device.
- Remain useful with manual walking-time entry and a cached application shell.

## Accessibility & Inclusion

Use semantic controls, keyboard-accessible search and settings, visible focus, and text labels in addition to color for departure urgency.
