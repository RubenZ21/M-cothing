# Notes for working on this repo

## Version number (required on every commit)

The app shows its version at the top of every screen. **Every commit must bump it by 0.01**
(1.00 → 1.01 → 1.02 …, and 1.99 → 2.00). Change it in both places, in the same commit:

- `js/version.js` → `export const VERSION = 'X.YY';`
- `sw.js` → `const CACHE = 'wardrobe-X.YY';` (so phones pick up the new files)

Mention the new version in the commit message.

## Stack

Static PWA, no build step: `index.html`, `styles.css`, ES modules in `js/`, served by Cloudflare
(Worker `m-wardrobe`, behind Cloudflare Access). Cloudflare deploys the `main` branch on every push, so a
change is only live once it is merged into `main`.
Data lives on the phone in IndexedDB (`js/db.js`). `vendor/bg-removal.js` is a pre-bundled copy of
`@imgly/background-removal` (see README for how to rebuild it).
