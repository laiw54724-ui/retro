# Fictional sample desktops: image provenance

Four interactive read-only examples on Retro Desktop's landing page use openly licensed reference media from Wikimedia Commons. The people, followers, posts, comments, names, OC story, and portfolio represented in those examples are **fictional**. Photographs and pixel-art source assets are **not creations by the fictional example owners**; in particular, the Moon Library gallery is a moodboard, not Luna's character artwork, and Ren's grid is not client work.

Each file below was individually checked on its Commons file-description page on 2026-11-09. These files are **not** granted Retro Desktop's MIT license. CC0 and public-domain declarations are given by the respective authors/uploaders; verify rights and any country-specific restrictions for an alternative distribution.

| Example | File and source / license page | Listed creator | Listed license |
| --- | --- | --- | --- |
| Mochi | [Green-eyed white cat looking at camera.jpg](https://commons.wikimedia.org/wiki/File:Green-eyed_white_cat_looking_at_camera.jpg) | Kiwiev | CC0 1.0 |
| Pixel 日記 | [Heart pixelart.png](https://commons.wikimedia.org/wiki/File:Heart_pixelart.png) | El Rolo Ueeqee | CC0 1.0 |
| Pixel 日記 | [House Pixel icon.png](https://commons.wikimedia.org/wiki/File:House_Pixel_icon.png) | Nanami-seven-three | CC0 1.0 |
| Pixel 日記 | [Kenney.nl platformer characters - player vector.svg](https://commons.wikimedia.org/wiki/File:Kenney.nl_platformer_characters_-_player_vector.svg) | Kenney.nl | CC0 1.0 |
| 月面圖書館 | [Photo of Moon.jpg](https://commons.wikimedia.org/wiki/File:Photo_of_Moon.jpg) | Lynredza Ravey | CC0 1.0 |
| 月面圖書館 | [Old books in library.jpg](https://commons.wikimedia.org/wiki/File:Old_books_in_library.jpg) | Unknown author (Pxhere) | CC0 1.0 (per Commons) |
| 月面圖書館 | [Stars in the Night Sky.jpg](https://commons.wikimedia.org/wiki/File:Stars_in_the_Night_Sky.jpg) | Wrenalicious | CC0 1.0 |
| 月面圖書館、Ren | [Vintage Typewriter Composing.jpg](https://commons.wikimedia.org/wiki/File:Vintage_Typewriter_Composing.jpg) | Wendelin Jacober | CC0 1.0 |
| 月面圖書館、Ren | [Coffee Cup on Modern Table.jpg](https://commons.wikimedia.org/wiki/File:Coffee_Cup_on_Modern_Table.jpg) | Genaro35 | CC0 1.0 |
| 月面圖書館、Ren | [Neon Sign.jpg](https://commons.wikimedia.org/wiki/File:Neon_Sign.jpg) | Alex Knight | CC0 1.0 |
| Ren | [A architecture.jpg](https://commons.wikimedia.org/wiki/File:A_architecture.jpg) | Ranjima np | CC0 1.0 |
| Ren | [Old school camera.jpg](https://commons.wikimedia.org/wiki/File:Old_school_camera.jpg) | Swanie227 | CC0 1.0 |
| Ren | [Horizontal lines on notebook paper (macro view).jpg](https://commons.wikimedia.org/wiki/File:Horizontal_lines_on_notebook_paper_(macro_view).jpg) | Abdurrahman Bin Asghar | CC0 1.0 |
| Mochi | [Flowers pictures.jpg](https://commons.wikimedia.org/wiki/File:Flowers_pictures.jpg) | Sowmiyamuruganmba | CC0 1.0 |

## Runtime and deployment notes

- Images are pinned, self-hosted copies under `apps/web/public/demo-assets/commons`. JPEGs retain Commons' 960px thumbnails; the small PNGs and SVG retain the original bytes. No image generation, cropping or lossy recompression was applied.
- Every bundled file has a source page, author, download URL, license, byte count and SHA-256 in `docs/assets/demo-media.provenance.json`. The directory and its source notice are covered by the release asset manifest and audit. Total image payload is about 1.6 MB across the whole catalog; individual demos use a subset.
- Landing previews use same-origin paths. Sample documents resolve those paths against the current deployment origin so the document schema's existing absolute-URL requirement remains intact. The non-browser fallback is `http://localhost` for tests; there is no production-host assumption.
- Opening examples or loading their images no longer contacts Wikimedia. Source links still lead to external Commons pages only when clicked. The images must ship with the static deployment; a missing local file fails the asset audit and browser image-load regression tests.
- CC0 permits commercial copyright reuse but does not prove model/property releases or trademark rights. In particular, typewriter/camera photographs contain marks and a composited person. The coffee image has an uploader's own-work declaration but no independently verified creator source; its Commons description includes an unrelated promotional link, which is not included in the app. Do not imply endorsements or use these photographs as a brand logo.
- Never replace these links with unrelated real Instagram/Behance accounts, `example.com`, `mailto:*@example.com`, or a commercial stock image without its license terms. The example buttons currently lead to genuine source pages / Retro's public repository, or are absent where no real persona account exists.
- Exact imagery and captions remain subject to further art direction; no claim is made that a CC0 work is a character design, brand logo, or fictional portfolio deliverable.

CC0 license text: https://creativecommons.org/publicdomain/zero/1.0/

## Review correction (2026-11-09)

The former `Forest pixel art.png` source page and image URL returned HTTP 404
during review. It has been removed from the runtime examples. The existing
[House Pixel icon](https://commons.wikimedia.org/wiki/File:House_Pixel_icon.png),
by Nanami-seven-three under CC0 1.0, now fills the IG thumbnail, highlight and
first-post slots. Its original image returned HTTP 200 (`image/png`). The caption
links to the actual source rather than describing the house as a sunset.

Of the original 15 image URLs, 11 returned HTTP 200, the forest returned 404,
and neon/camera/notebook thumbnails returned HTTP 429 during this check.
A URL-string assertion does not prove that a remote image loads successfully.
After respecting the rate limit and waiting, one paced GET pass retrieved all 14
remaining image URLs with HTTP 200 and image content types. Those exact bytes
are now bundled locally and hash-pinned. This removes the upstream availability
and visitor privacy dependency rather than hiding failed remote loads.

The coffee moodboard label was corrected from “black tea” to “coffee” in all four
catalogs after visual inspection. Other fictional titles are moodboard themes,
not claims that a photograph is an original character design or client project.
