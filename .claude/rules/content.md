---
paths:
  - "config/**"
  - "assets/**"
---

# Content and data rules

- `config/*.json` is the single source of gameplay numbers. Every file has a zod schema in
  `packages/shared/src/config/`. If you add a key, add it to the schema and to the
  tuning table in `docs/ARCHITECTURE.md` in the same commit.
- JSON stays formatted with 2-space indentation, keys in a stable logical order.
- Tuning changes: moderate steps (about 15–30%), and list old → new values in the commit.
- Assets: CC0 or our own work only. Log each one in `docs/ASSETS.md` (file, source URL,
  license, date). No real brand names, logos, or copyrighted characters.
- `assets/faces/` and `assets/menu/` are gitignored on purpose: coworker photos and company
  images stay on the host PC. Only faces of coworkers who agreed. `npm run faces` builds the
  manifest at runtime; code must work when the folders are empty (placeholder face, no slideshow).
- New cars, items and tracks follow the `/add-car`, `/add-item`, `/add-track` skills.
