# Minja's Wardrobe

Photograph your clothes, let the app cut them out, and mix them into outfits.
It is a small web app that installs on a phone (PWA), like Minja's Kitchen.

**Open it:** https://rubenz21.github.io/M-cothing/ (after GitHub Pages is turned on, see below)

## What it does

- **Clothes:** tap **+**, take a photo or pick one from the gallery. The background is removed on the phone itself, and you can touch up the edges with an erase/restore brush. Pick a category, seasons and (optionally) a name. The main colour is detected from the photo.
- **Closet:** clothes are grouped by type (Tops, Pants, Skirts, Dresses, Jackets, Shoes, Hats, Bags, Accessories), with search and filters.
- **Outfit builder:** tap clothes to place them on a board. Drag to move, pinch to resize and rotate (or drag the round corner handle), and use Front / Back / Mirror / Remove.
- **Outfits:** grouped by season, with the current season first. Outfits can be edited, renamed (tap the name at the top of the builder), duplicated and deleted.
- **Wishlist tab:** screenshots of things found online, each with a link to the shop. Tapping the picture opens the shop page. When adding one you crop the screenshot to the item and can remove the background. Name, price and category are optional. *I bought it* moves a wish into the Closet (keeping the shop link).
  - **Where the link comes from:** on **Samsung** phones, screenshots taken in a browser store the page address at the end of the file (the "Captured_App_Info" block the Gallery uses for its *go to source* button). The app reads it, so the link fills in by itself. Other phones' screenshots usually contain no address, so the app also offers: a link in the image's EXIF/XMP/PNG text, the **Paste** button (copy the link in the browser first: Share → Copy), and on Android, sharing the page from the browser straight to the installed app (Share → Wardrobe), which fills in the link and title.
- **Settings tab:** backup and restore, storage protection, background-removal quality, install help.
- **Backup:** Settings → *Save a backup* writes one `.json` file with every photo, piece and outfit. Save it off the phone (Google Drive, iCloud Drive, email). *Restore from a backup* reads it back, also on a new phone. The Settings tab shows a red dot when the last backup is more than 30 days old.
- **Version:** shown in small letters at the top of every screen. It goes up by 0.01 with every change (see `CLAUDE.md`).

## Photos and privacy

Everything stays on the phone, in the browser's IndexedDB storage. Nothing is uploaded and no account is needed.

Background removal uses [@imgly/background-removal](https://github.com/imgly/background-removal-js), which runs in the browser.
The first time it is used, the phone downloads the model once (about 40 MB, or about 80 MB for *Best quality* in Settings) from IMG.LY's CDN. After that it works offline.

Because the photos only live on the phone:

- Install the app to the home screen (on iPhone this stops Safari from clearing the data).
- Tap *Keep my photos safe* in Settings (asks the browser for persistent storage).
- Save a backup now and then.

## Turn on GitHub Pages

Repository **Settings → Pages → Build and deployment → Source: Deploy from a branch**, then choose the branch and folder `/ (root)`, and **Save**.
After a minute the app is at `https://rubenz21.github.io/M-cothing/`.

## Install on a phone

- **Android (Chrome):** menu ⋮ → **Install app** / **Add to Home screen**.
- **iPhone (Safari):** Share → **Add to Home Screen**.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell |
| `styles.css` | All styles (palette and fonts from Minja's Kitchen, pistachio buttons) |
| `js/app.js` | Screens (Closet, Outfits, piece details) and navigation |
| `js/add.js` | New piece: photo, background removal, touch up, details |
| `js/builder.js` | Outfit board and outfit thumbnails |
| `js/settings.js` | Settings tab: backup/restore, storage, quality |
| `js/wish.js` | Wishlist tab: list, add/edit (crop, background removal, link) |
| `js/link.js` | Finding links in screenshot metadata or pasted text |
| `js/version.js` | App version shown at the top (bump with every commit) |
| `js/bg.js` | Loads the background-removal library |
| `js/db.js` | IndexedDB storage |
| `js/images.js` | Resizing, trimming, colour detection |
| `vendor/bg-removal.js` | `@imgly/background-removal` 1.7.0 with `onnxruntime-web` 1.21.0, bundled into one file with esbuild |
| `sw.js` | Offline support: newest files when online, cached copy when offline; bump `CACHE` when releasing |
| `manifest.webmanifest`, `icons/` | App name, colours and icons for installing |

## License note

`vendor/bg-removal.js` is IMG.LY's library under the AGPL (see `vendor/LICENSE-background-removal.md`). That is fine for this public, open-source repository.

### Rebuilding the vendor file

```
npm i @imgly/background-removal@1.7.0 onnxruntime-web@1.21.0 esbuild
echo "export { removeBackground, preload } from '@imgly/background-removal';" > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --minify --platform=browser --target=es2020 --outfile=vendor/bg-removal.js
```
