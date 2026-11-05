# Minja's Wardrobe

Photograph your clothes, let the app cut them out, and mix them into outfits.
It is a small web app that installs on a phone (PWA), like Minja's Kitchen.

**Open it:** https://rubenz21.github.io/M-cothing/ (after GitHub Pages is turned on, see below)

## What it does

- **Clothes:** tap **+**, take a photo or pick one from the gallery. The background is removed on the phone itself, and you can touch up the edges with an erase/restore brush. Pictures that are already cut out (for example Samsung Gallery: press and hold the item → *Save as image*) are used as they are. Pick a category, seasons and (optionally) a name. The main colour is detected from the photo.
- **Closet:** clothes are grouped by type (Tops, Pants, Skirts, Dresses, Jackets, Shoes, Hats, Bags, Scarves, Belts, Gloves, Jewellery, Watches, Brooches, Eyewear), with search and filters. The chosen filter is remembered between tabs and its button is always scrolled into view. Pieces saved under the old *Accessories* category stay in an *Accessories* group, with a note, until each one is given a new category.
- **Outfit builder:** tap clothes to place them on a board. Drag to move, pinch to resize and rotate (or drag the round corner handle), and use Front / Back / Mirror / Remove.
- **Outfits:** grouped by season, with the current season first. Outfits can be edited, renamed (tap the name at the top of the builder), duplicated and deleted. The share button (on each outfit card and in the builder) sends a picture of the outfit with its name and seasons through the phone's share menu (WhatsApp, Messages, email …).
- **Wishlist tab:** screenshots of things found online, each with a link to the shop. Tapping the picture opens the shop page. When adding one you crop the screenshot to the item and can remove the background. Name, price and category are optional. *I bought it* moves a wish into the Closet (keeping the shop link).
  - **Where the link comes from:** on **Samsung** phones, screenshots taken in a browser store the page address at the end of the file (the "Captured_App_Info" block the Gallery uses for its *go to source* button). The app reads it, so the link fills in by itself. Other phones' screenshots usually contain no address, so the app also offers: a link in the image's EXIF/XMP/PNG text, the **Paste** button (copy the link in the browser first: Share → Copy), and on Android, sharing the page from the browser straight to the installed app (Share → Wardrobe), which fills in the link and title.
- **Palette tab:** her personal colour palette from John Kitchener's palette cards. She photographs each card (*Add palette card*; cards can be named) and taps **Find colours on this card**: the app finds every colour patch on the card (solid blocks, told apart from the card and table by shape, so off-whites on a cream card are found too), skips colours already saved, and adds the ones she keeps to a group. Colours can also be added by tapping a spot on a card, or with the colour picker. Groups (*My colours*, *Neutrals*, *Avoid* to start) can be renamed, added and marked *to avoid*; colours can be named, moved and removed. Notes for metals, make-up etc.
  - **Link with clothes and wishlist:** clothes and wishes whose main colour is close to a palette colour get a pistachio check, ones close to a colour to avoid a red mark; their pages say which colour they match, and *In my palette* filters the Closet and the Wishlist. Wishes get their colour from the cut-out, or from the middle of the cropped screenshot, and it can be changed by hand. Approximate: it compares one main colour, so patterned pieces match less well.
- **Settings tab:** backup and restore, storage protection, background-removal quality, install help.
- **Backup:** Settings → *Save backup on this phone* puts one `.zip` file in the phone's Downloads folder (Samsung: My Files → Downloads); *Send backup to…* opens the share menu for Google Drive, email etc. The zip holds the pictures as normal image files (`clothes/`, `outfits/`, `wishlist/`) plus `data.json` with everything else. *Restore from a backup* reads the zip, and also older `.json` backups. The Settings tab shows a red dot when the last backup is more than 30 days old.
- **Version:** shown in small letters at the top of every screen. It goes up by 0.01 with every change (see `CLAUDE.md`).

## Photos and privacy

Everything stays on the phone, in the browser's IndexedDB storage. Nothing is uploaded and no account is needed.

Background removal uses [@imgly/background-removal](https://github.com/imgly/background-removal-js), which runs in the browser.
The first time it is used, the phone downloads the model once (about 80 MB for *Best quality*, the default; about 40 MB for *Fast* in Settings, which erases more of the clothes) from IMG.LY's CDN. After that it works offline.

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
| `js/share.js` | Outfit picture for sharing, and the share menu |
| `js/backup.js` | Backup zip: build and restore (also old .json backups) |
| `js/palette.js` | Palette tab, picking colours from photos, matching clothes to the palette |
| `js/version.js` | App version shown at the top (bump with every commit) |
| `js/bg.js` | Loads the background-removal library |
| `js/db.js` | IndexedDB storage |
| `js/images.js` | Resizing, trimming, colour detection |
| `vendor/bg-removal.js` | `@imgly/background-removal` 1.7.0 with `onnxruntime-web` 1.21.0, bundled into one file with esbuild |
| `vendor/fflate.js` | [fflate](https://github.com/101arrowz/fflate) 0.8.2 (MIT) for zip files, bundled with esbuild |
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
