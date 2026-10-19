# Full fixed matrix — median of 3

Readiness is Playwright-observed navigation/sample readiness in milliseconds, not field INP or a performance score. Each cell is **before → after**. Raw observations retain variance and resource/image details. Source SHAs and setup are in [README](README.md).

|Entry|Fixture|Width|Cold ready ms|Warm ready ms|Cold FCP ms|Cold Resource Timing transfer bytes|Cold resource entries|
|---|---|---:|---:|---:|---:|---:|---:|
|editor|empty|320|132.0 → 164.6|56.5 → 72.3|80.0 → 92.0|2,222,902 → 2,055,150|5 → 5|
|editor|empty|390|133.6 → 168.2|66.7 → 59.9|80.0 → 96.0|2,222,902 → 2,055,150|5 → 5|
|editor|empty|1280|160.1 → 162.4|53.9 → 66.0|84.0 → 92.0|2,222,902 → 2,055,150|5 → 5|
|editor|normal|320|164.2 → 167.7|57.1 → 63.5|88.0 → 88.0|2,231,274 → 2,063,522|6 → 6|
|editor|normal|390|166.9 → 161.8|65.5 → 59.5|88.0 → 80.0|2,231,274 → 2,063,522|6 → 6|
|editor|normal|1280|195.5 → 186.5|89.0 → 91.2|84.0 → 80.0|5,681,280 → 5,513,528|12 → 12|
|editor|heavy|320|139.7 → 164.2|68.9 → 80.4|80.0 → 84.0|2,252,283 → 2,084,531|6 → 6|
|editor|heavy|390|160.1 → 161.7|55.2 → 56.4|80.0 → 84.0|2,252,283 → 2,084,531|6 → 6|
|editor|heavy|1280|217.9 → 207.8|111.5 → 117.1|80.0 → 84.0|19,502,313 → 19,334,561|36 → 36|
|public|empty|320|105.7 → 106.0|64.3 → 49.5|80.0 → 80.0|2,222,589 → 2,054,837|4 → 4|
|public|empty|390|104.9 → 105.4|50.0 → 56.9|84.0 → 76.0|2,222,589 → 2,054,837|4 → 4|
|public|empty|1280|105.7 → 101.0|62.3 → 67.3|80.0 → 76.0|2,222,589 → 2,054,837|4 → 4|
|public|normal|320|112.0 → 113.5|47.7 → 54.8|80.0 → 80.0|2,230,961 → 2,063,209|5 → 5|
|public|normal|390|115.2 → 112.3|63.2 → 57.5|84.0 → 80.0|2,230,961 → 2,063,209|5 → 5|
|public|normal|1280|143.2 → 125.4|66.7 → 55.6|88.0 → 76.0|5,680,967 → 5,513,215|11 → 11|
|public|heavy|320|132.7 → 116.1|77.1 → 64.7|92.0 → 80.0|2,251,970 → 2,084,218|5 → 5|
|public|heavy|390|122.3 → 111.4|54.0 → 64.7|84.0 → 76.0|2,251,970 → 2,084,218|5 → 5|
|public|heavy|1280|141.6 → 140.7|64.8 → 63.3|80.0 → 76.0|19,502,000 → 19,334,248|35 → 35|
|sample|card|320|175.2 → 157.5|85.8 → 86.9|100.0 → 88.0|2,221,029 → 2,053,277|3 → 3|
|sample|card|390|193.5 → 155.6|89.4 → 85.4|108.0 → 88.0|2,221,029 → 2,053,277|3 → 3|
|sample|card|1280|211.9 → 163.3|104.7 → 89.5|112.0 → 92.0|2,221,029 → 2,053,277|3 → 3|
|sample|ig|320|173.7 → 155.3|87.4 → 85.3|96.0 → 88.0|2,221,029 → 2,053,277|3 → 3|
|sample|ig|390|173.4 → 176.5|90.7 → 84.2|92.0 → 92.0|2,221,029 → 2,053,277|3 → 3|
|sample|ig|1280|187.9 → 186.4|91.3 → 87.9|96.0 → 92.0|2,221,029 → 2,053,277|3 → 3|
|sample|oc|320|174.7 → 177.9|87.2 → 85.1|92.0 → 92.0|2,221,029 → 2,053,277|3 → 3|
|sample|oc|390|157.3 → 173.1|83.4 → 88.6|92.0 → 92.0|2,221,029 → 2,053,277|3 → 3|
|sample|oc|1280|185.1 → 169.8|86.5 → 87.6|96.0 → 92.0|2,221,029 → 2,053,277|3 → 3|

## Preview interaction profile

Three cycles/width; heavy editor fixture. Phone cycles also enter/leave the gallery. These measurements do not play media. Every pair is before → after.

|Width|Open + 2 frames ms|Close + 2 frames ms|Open script ms|Open layout ms|Layouts|Style recalculations|DOM after close|Residual media nodes|
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
|320|77.58 → 79.53|39.55 → 40.58|5.93 → 6.27|0.40 → 0.37|1.00 → 1.00|3.00 → 3.00|183.00 → 183.00|0.00 → 0.00|
|390|79.00 → 77.99|36.66 → 45.23|6.00 → 6.38|0.36 → 0.38|1.00 → 1.00|3.00 → 3.00|183.00 → 183.00|0.00 → 0.00|
|1280|93.55 → 87.08|50.30 → 49.78|15.74 → 16.30|1.54 → 1.52|1.00 → 1.00|15.00 → 15.00|1230.00 → 1230.00|0.00 → 0.00|

Each repeated close restored identical DOM counts (183 mobile / 1,230 desktop). Unforced-GC heap growth is not classified as a leak; longer real-device profiles remain necessary.

## Aggregate load observations

|Entry|Cold ready median before → after ms|Cold FCP median before → after ms|Maximum observed long-task total before → after ms|
|---|---:|---:|---:|
|editor|160.1 → 166.9|80.0 → 84.0|82 → 85|
|public|115.7 → 111.6|80.0 → 76.0|0 → 0|
|sample|180.4 → 165.1|96.0 → 92.0|0 → 0|

Cold transfer decreased by exactly 167,752 bytes in each matched matrix cell. Warm JS/CSS/images were cached, so this change provides no warm transfer reduction. The 400,228-byte font repeats due to the explicitly documented harness cache policy. No timing improvement is claimed from these small unthrottled samples.
