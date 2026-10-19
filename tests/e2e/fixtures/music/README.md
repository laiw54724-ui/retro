# Generated video fixture

`generated.mp4` is original test media: a solid navy 320×180 frame with a 440 Hz sine wave, generated locally with FFmpeg. No downloaded footage, music, fonts or third-party assets are embedded. It exercises actual browser decoding and controls; provider tests continue to use isolated HTML doubles.

Reproduce from the repository root:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=navy:s=320x180:r=10:d=20 -f lavfi -i sine=frequency=440:sample_rate=16000:duration=20 -c:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 35 -c:a aac -b:a 16k -movflags +faststart -shortest -y tests/e2e/fixtures/music/generated.mp4
```
