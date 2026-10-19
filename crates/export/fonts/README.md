# Embedded fonts

The faces a chart image and the status report are drawn in. They are compiled into `hx-export` (`src/fonts.rs`), so a file never depends on a font of the machine that makes it.

| File | Family | Weight |
|---|---|---|
| `PublicSans-Regular.ttf` | Public Sans | 400 |
| `PublicSans-SemiBold.ttf` | Public Sans | 600 |
| `RedditMono-Regular.ttf` | Reddit Mono | 400 |

Both families are under the SIL Open Font License 1.1: `OFL-PublicSans.txt` and `OFL-RedditMono.txt` are their license texts, as Google Fonts publishes them.

## Source

Static instances of the variable files of Google Fonts:

| File | URL | Bytes | SHA-256 |
|---|---|---|---|
| `PublicSans[wght].ttf` | https://raw.githubusercontent.com/google/fonts/main/ofl/publicsans/PublicSans%5Bwght%5D.ttf | 103,316 | `d75a7dc1a27eb9e336d5b33f55489d2ecb5621bf694d5c43b2415bce2ca830a8` |
| `RedditMono[wght].ttf` | https://raw.githubusercontent.com/google/fonts/main/ofl/redditmono/RedditMono%5Bwght%5D.ttf | 203,908 | `5b092e066eb178a4450a5cb53469015468ec33e19716a4cbf9257eaf1e5a10c2` |

The licenses: https://raw.githubusercontent.com/google/fonts/main/ofl/publicsans/OFL.txt and https://raw.githubusercontent.com/google/fonts/main/ofl/redditmono/OFL.txt.

## How they were made

In a scratch folder outside the repository, with fonttools 4.60.1:

```bash
curl -sSfLo 'PublicSans[wght].ttf' 'https://raw.githubusercontent.com/google/fonts/main/ofl/publicsans/PublicSans%5Bwght%5D.ttf'
curl -sSfLo 'RedditMono[wght].ttf' 'https://raw.githubusercontent.com/google/fonts/main/ofl/redditmono/RedditMono%5Bwght%5D.ttf'
curl -sSfLo OFL-PublicSans.txt https://raw.githubusercontent.com/google/fonts/main/ofl/publicsans/OFL.txt
curl -sSfLo OFL-RedditMono.txt https://raw.githubusercontent.com/google/fonts/main/ofl/redditmono/OFL.txt
python3 -m venv venv && ./venv/bin/pip install fonttools==4.60.1
./venv/bin/fonttools varLib.instancer 'PublicSans[wght].ttf' wght=400 --static --update-name-table -o PublicSans-Regular.ttf
./venv/bin/fonttools varLib.instancer 'PublicSans[wght].ttf' wght=600 --static --update-name-table -o PublicSans-SemiBold.ttf
./venv/bin/fonttools varLib.instancer 'RedditMono[wght].ttf' wght=400 --static --update-name-table -o RedditMono-Regular.ttf
```

The three TTF files and the two license files were then copied here. The instances made on 19 October 2026:

| File | Bytes | SHA-256 |
|---|---|---|
| `PublicSans-Regular.ttf` | 61,236 | `34d10d871de763151e022e80e79851229e0255663c0225ccfaa616357d9d8f4f` |
| `PublicSans-SemiBold.ttf` | 61,308 | `c96f09a4e33d8feec9caa5d9bbc917e401cd4c784ad30723e4ff5616181e7192` |
| `RedditMono-Regular.ttf` | 112,408 | `9b7a1e31a3a08d2820a97b1e7551b9f62cfe0f1bf764e795e9d64133c4075388` |
