# WordPress Playwright Backend

Backend sederhana berbasis `Express` dan `Playwright` untuk login ke WordPress lalu mengisi form atau menjalankan aksi CRUD berbasis UI.

## Install

```bash
npm install
npm run install:browser
cp .env.example .env
```

## Run

```bash
npm run dev
```

## Environment

```env
PORT=3000
WORDPRESS_LOGIN_URL=https://example.com/wp-login.php
WORDPRESS_TARGET_URL=https://example.com/wp-admin/post-new.php?post_type=episode
WORDPRESS_TV_TARGET_URL=https://example.com/wp-admin/post-new.php?post_type=tv
WORDPRESS_TV_SITEMAP_URL=https://drakorid.fun/tv-sitemap.xml
WORDPRESS_EPISODE_SITEMAP_URL=https://drakorid.fun/episode-sitemap.xml
WORDPRESS_INDEX_DB_PATH=./data/wordpress-index.sqlite
WORDPRESS_USERNAME=your-username
WORDPRESS_PASSWORD=your-password
TMDB_API_BASE_URL=https://api.themoviedb.org/3
TMDB_API_KEY=your-tmdb-api-key
TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p/w500
TMDB_LANGUAGE=en-US
```

## Endpoint

`POST /api/wordpress/run`

Kalau variable `WORDPRESS_LOGIN_URL`, `WORDPRESS_TARGET_URL`, `WORDPRESS_USERNAME`, dan `WORDPRESS_PASSWORD` sudah diisi, backend akan otomatis:

- login ke WordPress
- membuka halaman target admin
- memakai selector login default WordPress: `#user_login`, `#user_pass`, `#wp-submit`, `#wpadminbar`

Contoh payload minimal:

```json
{
  "fields": [
    {
      "selector": "#title",
      "type": "fill",
      "value": "Judul Episode"
    }
  ]
}
```

`POST /api/wordpress/episode`

Endpoint ini khusus untuk flow:

- isi `TMDB ID`
- isi `season`
- isi `episode`
- klik `Ambil Informasi`
- isi `Kode Embed` pada server tertentu
- `Simpan Draf` atau `Terbitkan`

Contoh payload:

```json
{
  "tmdbId": 292696,
  "seasonNumber": 1,
  "episodeNumber": 30,
  "embedCode": "<iframe height=\"360\" width=\"640\" frameBorder=\"0\" allowfullscreen=\"true\" webkitallowfullscreen=\"true\" mozallowfullscreen=\"true\" src=\"https://krakenfiles.com/embed-video/aVRl627NTQ\"></iframe>",
  "serverNumber": 1,
  "dryRun": false,
  "submitAction": "save"
}
```

Field optional:

- `serverTitle`: isi `Judul tab` untuk server tertentu
- `serverNumber`: default `1`
- `dryRun`: kalau `true`, flow berhenti setelah isi embed tanpa simpan
- `touchLinkedTvShowAfterSave`: default `false`, kalau diaktifkan sistem akan coba cari `TV Show` terkait setelah episode disimpan
- `submitAction`: `save` atau `publish`, default `save`
- `TMDB_API_KEY`: opsional, dipakai untuk fallback poster kalau field `Url Poster (TMDB)` kosong setelah klik `Ambil Informasi`

`POST /api/wordpress/tv`

Untuk `TV Show`, backend tidak perlu `TMDB API key` sendiri selama plugin WordPress bisa menjalankan tombol `Ambil Informasi`.

Contoh payload:

```json
{
  "tmdbId": 292696,
  "dryRun": false,
  "submitAction": "save"
}
```

Flow TV:

- isi `TMDB ID`
- klik `Ambil Informasi`
- tunggu judul WordPress dan judul TMDB terisi
- kalau `Url Poster (TMDB)` kosong, backend akan coba ambil poster dari `TMDB` bila `TMDB_API_KEY` tersedia
- isi `Frasa kunci utama` dari judul
- `Simpan Draf` atau `Terbitkan`

`POST /api/wordpress/v2/process-file`

Endpoint ini untuk workflow v2:

- parse filename Kraken seperti `tv-239901-drakorid-720p-the-legend-of-rosy-clouds-2026-ep11.mp4`
- sync index lokal SQLite dari sitemap `tv` dan `episode`
- cek apakah `TV Show` sudah ada
- create `TV Show` bila belum ada
- cek apakah `episode` sudah ada
- create `episode` bila belum ada

Contoh payload:

```json
{
  "downloadUrl": "https://krakenfiles.com/view/aVRl627NTQ/file.html",
  "submitAction": "save",
  "forceSync": false,
  "checkOnly": false
}
```

Catatan payload v2:

- `fileName` sekarang opsional jika `downloadUrl` atau `embedUrl` Kraken valid, karena backend akan ambil nama file dari halaman publik Kraken
- `downloadUrl`, `embedUrl`, `krakenUrl`, atau `embedCode` dibutuhkan jika episode memang perlu dibuat
- `submitAction` jadi default untuk TV dan episode, tapi bisa dioverride pakai `tvSubmitAction` dan `episodeSubmitAction`
- `checkOnly: true` hanya cek index tanpa membuat post
- database index lokal disimpan di `WORDPRESS_INDEX_DB_PATH`

Contoh payload:

```json
{
  "targetUrl": "https://example.com/wp-admin/post-new.php",
  "headless": true,
  "navigationTimeout": 30000,
  "actionDelayMs": 200,
  "login": {
    "url": "https://example.com/wp-login.php",
    "username": "admin",
    "password": "secret",
    "usernameSelector": "#user_login",
    "passwordSelector": "#user_pass",
    "submitSelector": "#wp-submit",
    "successSelector": "#wpadminbar",
    "postLoginUrl": "https://example.com/wp-admin/post-new.php"
  },
  "fields": [
    {
      "selector": "#title",
      "type": "fill",
      "value": "Judul Post Otomatis"
    },
    {
      "selector": "textarea.editor-post-title__input",
      "type": "fill",
      "value": "Isi konten jika editor memakai selector ini"
    }
  ],
  "submit": {
    "selector": ".editor-post-publish-button",
    "waitForNavigation": false
  },
  "success": {
    "selector": ".components-snackbar__content",
    "timeout": 30000
  }
}
```

## Tipe Field

- `fill`: isi input atau textarea
- `click`: klik elemen
- `check`: centang checkbox
- `uncheck`: hilangkan centang checkbox
- `select`: pilih satu option
- `multi-select`: pilih banyak option
- `press`: kirim tombol keyboard ke selector

## Catatan

- Jika automation gagal, screenshot akan disimpan di folder `artifacts/screenshots`.
- Untuk WordPress dengan editor atau plugin tertentu, selector perlu disesuaikan dengan halaman aslinya.
- Kalau mau workflow lebih aman, pisahkan endpoint per use case, misalnya `create-post`, `update-post`, atau `submit-form`.

# cron-wp
