const { openDatabase, syncWordpressIndex } = require("./wordpressIndexService");
const { resolveFilemoonSource } = require("./filemoonSourceService");
const { parseKrakenFilename } = require("./krakenFilenameParser");
const { processFilemoonUpload } = require("./wordpressV2Service");

const DEFAULT_JOB_LIMIT = 20;

async function ensureFilemoonJobsTable() {
  const db = await openDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS filemoon_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT,
      source_url TEXT NOT NULL,
      file_name TEXT,
      media_type TEXT,
      tmdb_id INTEGER,
      season_number INTEGER,
      episode_number INTEGER,
      submit_action TEXT NOT NULL DEFAULT 'publish',
      check_only INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      process_log TEXT,
      last_error TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_filemoon_jobs_source_url
      ON filemoon_jobs(source_url);
    CREATE INDEX IF NOT EXISTS idx_filemoon_jobs_status
      ON filemoon_jobs(status, updated_at);
  `);

  return db;
}

function toJobRow(job) {
  return {
    ...job,
    check_only: Boolean(job.check_only),
    payload:
      typeof job.payload_json === "string" && job.payload_json
        ? JSON.parse(job.payload_json)
        : null,
    processLog:
      typeof job.process_log === "string" && job.process_log
        ? JSON.parse(job.process_log)
        : [],
  };
}

async function enqueueFilemoonJob(payload = {}) {
  const db = await ensureFilemoonJobsTable();
  const filemoonSource = await resolveFilemoonSource(payload);
  const sourceUrl = String(
    payload.filemoonUrl || payload.downloadUrl || payload.watchUrl || payload.embedUrl || "",
  ).trim();

  if (!sourceUrl) {
    throw new Error(
      "`filemoonUrl`, `downloadUrl`, `watchUrl`, atau `embedUrl` wajib diisi untuk enqueue job.",
    );
  }

  let parsedFile = null;
  if (filemoonSource.fileName) {
    parsedFile = parseKrakenFilename(filemoonSource.fileName);
  }

  const now = new Date().toISOString();
  const existing = db
    .prepare(`SELECT * FROM filemoon_jobs WHERE source_url = ?`)
    .get(sourceUrl);
  const nextPayload = {
    ...payload,
    filemoonUrl: sourceUrl,
    downloadUrl: payload.downloadUrl || sourceUrl,
  };

  const values = {
    file_id: filemoonSource.fileId || null,
    source_url: sourceUrl,
    file_name: filemoonSource.fileName || null,
    media_type: parsedFile?.mediaType || null,
    tmdb_id: parsedFile?.tmdbId || null,
    season_number: parsedFile?.seasonNumber ?? null,
    episode_number: parsedFile?.episodeNumber ?? null,
    submit_action: payload.submitAction || "publish",
    check_only: payload.checkOnly ? 1 : 0,
    status: "pending",
    process_log: JSON.stringify([
      "Job Filemoon masuk ke queue lokal.",
      filemoonSource.fileName
        ? `Filename terdeteksi: ${filemoonSource.fileName}.`
        : "Filename belum bisa dideteksi saat enqueue.",
    ]),
    last_error: null,
    payload_json: JSON.stringify(nextPayload),
    updated_at: now,
  };

  if (existing) {
    db.prepare(
      `
        UPDATE filemoon_jobs
        SET
          file_id = @file_id,
          file_name = @file_name,
          media_type = @media_type,
          tmdb_id = @tmdb_id,
          season_number = @season_number,
          episode_number = @episode_number,
          submit_action = @submit_action,
          check_only = @check_only,
          status = @status,
          process_log = @process_log,
          last_error = @last_error,
          payload_json = @payload_json,
          updated_at = @updated_at,
          processed_at = NULL
        WHERE source_url = @source_url
      `,
    ).run(values);
  } else {
    db.prepare(
      `
        INSERT INTO filemoon_jobs (
          file_id,
          source_url,
          file_name,
          media_type,
          tmdb_id,
          season_number,
          episode_number,
          submit_action,
          check_only,
          status,
          process_log,
          last_error,
          payload_json,
          created_at,
          updated_at
        ) VALUES (
          @file_id,
          @source_url,
          @file_name,
          @media_type,
          @tmdb_id,
          @season_number,
          @episode_number,
          @submit_action,
          @check_only,
          @status,
          @process_log,
          @last_error,
          @payload_json,
          @updated_at,
          @updated_at
        )
      `,
    ).run(values);
  }

  return getFilemoonJobBySourceUrl(sourceUrl);
}

async function getFilemoonJobBySourceUrl(sourceUrl) {
  const db = await ensureFilemoonJobsTable();
  const row = db
    .prepare(`SELECT * FROM filemoon_jobs WHERE source_url = ?`)
    .get(String(sourceUrl || "").trim());

  return row ? toJobRow(row) : null;
}

async function listFilemoonJobs({ limit = DEFAULT_JOB_LIMIT } = {}) {
  const db = await ensureFilemoonJobsTable();
  const rows = db
    .prepare(
      `
        SELECT *
        FROM filemoon_jobs
        ORDER BY datetime(updated_at) DESC, id DESC
        LIMIT ?
      `,
    )
    .all(Number(limit) || DEFAULT_JOB_LIMIT);

  return rows.map(toJobRow);
}

async function processFilemoonJobById(jobId, options = {}) {
  const db = await ensureFilemoonJobsTable();
  const row = db
    .prepare(`SELECT * FROM filemoon_jobs WHERE id = ?`)
    .get(Number(jobId));

  if (!row) {
    throw new Error("Job Filemoon tidak ditemukan.");
  }

  const job = toJobRow(row);
  const now = new Date().toISOString();

  db.prepare(
    `
      UPDATE filemoon_jobs
      SET status = 'processing', updated_at = ?, last_error = NULL
      WHERE id = ?
    `,
  ).run(now, Number(jobId));

  try {
    const payload = {
      ...(job.payload || {}),
      forceSync: Boolean(options.forceSync),
    };
    const result = await processFilemoonUpload(payload);
    const nextStatus =
      result.ok && result.parsedFile?.mediaType !== "movie"
        ? "done"
        : result.parsedFile?.mediaType === "movie"
          ? "unsupported"
          : "failed";

    db.prepare(
      `
        UPDATE filemoon_jobs
        SET
          status = ?,
          process_log = ?,
          last_error = ?,
          updated_at = ?,
          processed_at = ?
        WHERE id = ?
      `,
    ).run(
      nextStatus,
      JSON.stringify(result.processLog || []),
      result.ok ? null : result.message || result.error || null,
      new Date().toISOString(),
      new Date().toISOString(),
      Number(jobId),
    );

    return {
      job: await getFilemoonJobBySourceUrl(job.source_url),
      result,
    };
  } catch (error) {
    db.prepare(
      `
        UPDATE filemoon_jobs
        SET
          status = 'failed',
          last_error = ?,
          updated_at = ?,
          processed_at = ?
        WHERE id = ?
      `,
    ).run(error.message, new Date().toISOString(), new Date().toISOString(), Number(jobId));

    return {
      job: await getFilemoonJobBySourceUrl(job.source_url),
      result: {
        ok: false,
        message: error.message,
      },
    };
  }
}

async function processPendingFilemoonJobs({ limit = 3, forceSync = false } = {}) {
  const db = await ensureFilemoonJobsTable();
  const pendingRows = db
    .prepare(
      `
        SELECT id
        FROM filemoon_jobs
        WHERE status = 'pending'
        ORDER BY datetime(created_at) ASC, id ASC
        LIMIT ?
      `,
    )
    .all(Number(limit) || 3);

  const processed = [];
  for (const row of pendingRows) {
    const item = await processFilemoonJobById(row.id, { forceSync });
    processed.push(item);
  }

  return {
    ok: true,
    processedCount: processed.length,
    jobs: processed.map((item) => item.job),
  };
}

async function syncSitemapNow(options = {}) {
  const result = await syncWordpressIndex({
    force: true,
    maxAgeMinutes: options.maxAgeMinutes,
  });

  return {
    ok: true,
    ...result,
  };
}

module.exports = {
  enqueueFilemoonJob,
  ensureFilemoonJobsTable,
  getFilemoonJobBySourceUrl,
  listFilemoonJobs,
  processFilemoonJobById,
  processPendingFilemoonJobs,
  syncSitemapNow,
};
