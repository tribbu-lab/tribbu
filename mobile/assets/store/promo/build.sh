#!/bin/bash
# Ensambla el spot: frames + musica (con ducking bajo la voz) + locucion.
set -euo pipefail
cd "$(dirname "$0")"

OUT=${1:-out/tribbu-promo-30s.mp4}
mkdir -p "$(dirname "$OUT")"

ffmpeg -y -v warning -stats \
  -framerate 30 -i frames/f%05d.png \
  -i audio/music.wav \
  -i audio/vo.wav \
  -filter_complex "
    [2:a]aformat=channel_layouts=stereo:sample_rates=44100,
         acompressor=threshold=-18dB:ratio=3:attack=8:release=180:makeup=2,
         asplit=2[vo][key];
    [1:a]aformat=channel_layouts=stereo:sample_rates=44100[mus];
    [mus][key]sidechaincompress=threshold=0.03:ratio=9:attack=12:release=380:makeup=1[duck];
    [duck][vo]amix=inputs=2:weights='1 1.6':normalize=0,
         loudnorm=I=-14:TP=-1.0:LRA=11,
         alimiter=limit=0.97[a]
  " \
  -map 0:v -map "[a]" \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p \
  -profile:v high -level 4.2 -movflags +faststart -r 30 \
  -c:a aac -b:a 256k -ar 44100 \
  "$OUT"

echo
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate \
  -of default=nw=1 "$OUT"
echo "-> $OUT"
