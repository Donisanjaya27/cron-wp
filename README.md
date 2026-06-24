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
WORDPRESS_USERNAME=your-username
WORDPRESS_PASSWORD=your-password
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
- `touchLinkedTvShowAfterSave`: default `true`, setelah episode disimpan sistem akan cari `TV Show` terkait dan update tanggal modifikasinya
- `submitAction`: `save` atau `publish`, default `save`

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
- isi `Frasa kunci utama` dari judul
- `Simpan Draf` atau `Terbitkan`

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
