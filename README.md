# WYA for NUS

Track where your NUS friends are throughout the week, view everyone's class locations on a live map.

## Features

- **Paste NUSMods share links** to add friends' timetables instantly
- **Interactive map** showing class locations across NUS using Leaflet + OpenStreetMap
- **Time scrubber** — click any hour to see exactly where everyone is at that time
- **Day selector** to browse Monday–Saturday
- **Persistent local storage** — names, colours, and URLs are saved between sessions
- **Auto-update** of venue/module data via GitHub Actions cron

## How the NUSMods URL format works

NUSMods share URLs look like:
```
https://nusmods.com/timetable/sem-1/share?CS2103T=LEC:1,TUT:04&CS1101S=TUT:01E,LEC:1
```

- Path encodes the semester (`sem-1` or `sem-2`)
- Each query param is a module code
- The value is a comma-separated list of `lessonType:classNo` pairs

The app parses this, cross-references `module_venues.json` to find the classroom, then looks up coordinates in `venue_coords.json`.
