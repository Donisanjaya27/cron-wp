const { openDatabase, syncWordpressIndex } = require("./wordpressIndexService");
const { resolveKrakenSource } = require("./krakenSourceService");
const { parseKrakenFilename } = require("./krakenFilenameParser");
const { processKrakenUpload } = require("./wordpressV2Service");

const DEFAULT_JOB_LIMIT = 20;

async function ensureKrakenJobsTable() {
  const db = await openDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS kraken_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT,
      source_url TEXT NOT NULL,
      file_name TEXT,
      media_type TEXT,
      tmdb_id INTEGER,
      season_number INTEGER,
      episode_number INTEGER,
      submit_action TEXT NOT NULL DEFAULT 'save',
      check_only INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      process_log TEXT,
      last_error TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_kraken_jobs_source_url
      ON kraken_jobs(source_url);
    CREATE INDEX IF NOT EXISTS idx_kraken_jobs_status
      ON kraken_jobs(status, updated_at);
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

async function enqueueKrakenJob(payload = {}) {
  const db = await ensureKrakenJobsTable();
  const krakenSource = await resolveKrakenSource(payload);
  const sourceUrl = String(
    payload.krakenUrl || payload.downloadUrl || payload.embedUrl || "",
  ).trim();

  if (!sourceUrl) {
    throw new Error("`krakenUrl` atau `downloadUrl` wajib diisi untuk enqueue job.");
  }

  let parsedFile = null;
  if (krakenSource.fileName) {
    parsedFile = parseKrakenFilename(krakenSource.fileName);
  }

  const now = new Date().toISOString();
  const existing = db
    .prepare(`SELECT * FROM kraken_jobs WHERE source_url = ?`)
    .get(sourceUrl);
  const nextPayload = {
    ...payload,
    krakenUrl: sourceUrl,
    downloadUrl: payload.downloadUrl || sourceUrl,
  };

  const values = {
    file_id: krakenSource.fileId || null,
    source_url: sourceUrl,
    file_name: krakenSource.fileName || null,
    media_type: parsedFile?.mediaType || null,
    tmdb_id: parsedFile?.tmdbId || null,
    season_number: parsedFile?.seasonNumber ?? null,
    episode_number: parsedFile?.episodeNumber ?? null,
    submit_action: payload.submitAction || "save",
    check_only: payload.checkOnly ? 1 : 0,
    status: "pending",
    process_log: JSON.stringify([
      "Job masuk ke queue lokal.",
      krakenSource.fileName
        ? `Filename terdeteksi: ${krakenSource.fileName}.`
        : "Filename belum bisa dideteksi saat enqueue.",
    ]),
    last_error: null,
    payload_json: JSON.stringify(nextPayload),
    updated_at: now,
  };

  if (existing) {
    db.prepare(
      `
        UPDATE kraken_jobs
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
        INSERT INTO kraken_jobs (
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

  return getKrakenJobBySourceUrl(sourceUrl);
}

async function getKrakenJobBySourceUrl(sourceUrl) {
  const db = await ensureKrakenJobsTable();
  const row = db
    .prepare(`SELECT * FROM kraken_jobs WHERE source_url = ?`)
    .get(String(sourceUrl || "").trim());

  return row ? toJobRow(row) : null;
}

async function listKrakenJobs({ limit = DEFAULT_JOB_LIMIT } = {}) {
  const db = await ensureKrakenJobsTable();
  const rows = db
    .prepare(
      `
        SELECT *
        FROM kraken_jobs
        ORDER BY datetime(updated_at) DESC, id DESC
        LIMIT ?
      `,
    )
    .all(Number(limit) || DEFAULT_JOB_LIMIT);

  return rows.map(toJobRow);
}

async function processKrakenJobById(jobId, options = {}) {
  const db = await ensureKrakenJobsTable();
  const row = db.prepare(`SELECT * FROM kraken_jobs WHERE id = ?`).get(Number(jobId));

  if (!row) {
    throw new Error("Job Kraken tidak ditemukan.");
  }

  const job = toJobRow(row);
  const now = new Date().toISOString();

  db.prepare(
    `
      UPDATE kraken_jobs
      SET status = 'processing', updated_at = ?, last_error = NULL
      WHERE id = ?
    `,
  ).run(now, Number(jobId));

  try {
    const payload = {
      ...(job.payload || {}),
      forceSync: Boolean(options.forceSync),
    };
    const result = await processKrakenUpload(payload);
    const nextStatus =
      result.ok && result.parsedFile?.mediaType !== "movie"
        ? "done"
        : result.parsedFile?.mediaType === "movie"
          ? "unsupported"
          : "failed";

    db.prepare(
      `
        UPDATE kraken_jobs
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
      job: await getKrakenJobBySourceUrl(job.source_url),
      result,
    };
  } catch (error) {
    db.prepare(
      `
        UPDATE kraken_jobs
        SET
          status = 'failed',
          last_error = ?,
          updated_at = ?,
          processed_at = ?
        WHERE id = ?
      `,
    ).run(error.message, new Date().toISOString(), new Date().toISOString(), Number(jobId));

    return {
      job: await getKrakenJobBySourceUrl(job.source_url),
      result: {
        ok: false,
        message: error.message,
      },
    };
  }
}

async function processPendingKrakenJobs({ limit = 3, forceSync = false } = {}) {
  const db = await ensureKrakenJobsTable();
  const pendingRows = db
    .prepare(
      `
        SELECT id
        FROM kraken_jobs
        WHERE status = 'pending'
        ORDER BY datetime(created_at) ASC, id ASC
        LIMIT ?
      `,
    )
    .all(Number(limit) || 3);

  const processed = [];
  for (const row of pendingRows) {
    const item = await processKrakenJobById(row.id, { forceSync });
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
  enqueueKrakenJob,
  ensureKrakenJobsTable,
  getKrakenJobBySourceUrl,
  listKrakenJobs,
  processKrakenJobById,
  processPendingKrakenJobs,
  syncSitemapNow,
};
