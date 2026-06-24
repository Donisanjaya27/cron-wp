const path = require("path");
const Database = require("better-sqlite3");
const { XMLParser } = require("fast-xml-parser");
const { ensureDirectory } = require("../utils/file");
const { normalizeSlug, normalizeText } = require("../utils/normalize");

const DEFAULT_TV_SITEMAP_URL = "https://drakorid.fun/tv-sitemap.xml";
const DEFAULT_EPISODE_SITEMAP_URL = "https://drakorid.fun/episode-sitemap.xml";
const DEFAULT_INDEX_MAX_AGE_MINUTES = 15;

let dbInstance = null;

function getDatabasePath() {
  return (
    process.env.WORDPRESS_INDEX_DB_PATH ||
    path.join(process.cwd(), "data", "wordpress-index.sqlite")
  );
}

async function openDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const databasePath = getDatabasePath();
  await ensureDirectory(path.dirname(databasePath));

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      name TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tv_index (
      url TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      normalized_slug TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      lastmod TEXT,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS episode_index (
      url TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      normalized_slug TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      series_key TEXT NOT NULL,
      season_number INTEGER,
      episode_number INTEGER,
      lastmod TEXT,
      synced_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tv_normalized_slug
      ON tv_index(normalized_slug);
    CREATE INDEX IF NOT EXISTS idx_tv_normalized_title
      ON tv_index(normalized_title);
    CREATE INDEX IF NOT EXISTS idx_episode_series
      ON episode_index(series_key, season_number, episode_number);
    CREATE INDEX IF NOT EXISTS idx_episode_normalized_slug
      ON episode_index(normalized_slug);
  `);

  dbInstance = db;
  return dbInstance;
}

function getXmlParser() {
  return new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    trimValues: true,
  });
}

function toArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getSlugFromUrl(url) {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    const parts = pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch (_error) {
    return "";
  }
}

function getSeasonEpisodeParts(value) {
  const normalizedValue = String(value || "").toLowerCase();
  const match = normalizedValue.match(
    /(?:^|[-\s])s(?:eason|ession)?[-\s]?(\d+)[-\s]+episode[-\s]?(\d+)(?:$|[-\s])/i,
  );

  if (!match) {
    return {
      seasonNumber: null,
      episodeNumber: null,
    };
  }

  return {
    seasonNumber: Number(match[1]),
    episodeNumber: Number(match[2]),
  };
}

function buildSeriesKeyFromEpisodeSlug(slug) {
  return normalizeText(
    String(slug || "").replace(
      /-(?:s(?:eason|ession)?)-?\d+-episode-?\d+$/i,
      "",
    ),
  );
}

function normalizeSitemapEntry(entry) {
  const url = String(entry.loc || "").trim();
  const slug = getSlugFromUrl(url);
  const title = normalizeTitleFromSlug(slug);

  return {
    url,
    slug,
    title,
    lastmod: entry.lastmod ? String(entry.lastmod) : "",
    normalized_slug: normalizeSlug(slug),
    normalized_title: normalizeText(title),
  };
}

function normalizeTitleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^\d+$/.test(part)) {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function mapTvEntries(entries, syncedAt) {
  return entries
    .map((entry) => normalizeSitemapEntry(entry))
    .filter((entry) => entry.url && entry.slug)
    .map((entry) => ({
      ...entry,
      synced_at: syncedAt,
    }));
}

function mapEpisodeEntries(entries, syncedAt) {
  return entries
    .map((entry) => normalizeSitemapEntry(entry))
    .filter((entry) => entry.url && entry.slug)
    .map((entry) => {
      const { seasonNumber, episodeNumber } = getSeasonEpisodeParts(entry.slug);

      return {
        ...entry,
        series_key: buildSeriesKeyFromEpisodeSlug(entry.slug),
        season_number: seasonNumber,
        episode_number: episodeNumber,
        synced_at: syncedAt,
      };
    });
}

async function fetchSitemapEntries(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gagal mengambil sitemap: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parsed = getXmlParser().parse(xml);

  return toArray(parsed?.urlset?.url);
}

function getLastSyncInfo(db) {
  const row = db
    .prepare(`SELECT value, updated_at FROM sync_state WHERE name = ?`)
    .get("sitemap_sync");

  if (!row?.updated_at) {
    return null;
  }

  return {
    value: row.value,
    updatedAt: row.updated_at,
  };
}

function readIndexCounts(db) {
  const tv = db.prepare(`SELECT COUNT(*) AS count FROM tv_index`).get();
  const episode = db.prepare(`SELECT COUNT(*) AS count FROM episode_index`).get();

  return {
    tvCount: tv.count,
    episodeCount: episode.count,
  };
}

async function syncWordpressIndex({
  force = false,
  maxAgeMinutes = DEFAULT_INDEX_MAX_AGE_MINUTES,
} = {}) {
  const db = await openDatabase();
  const lastSyncInfo = getLastSyncInfo(db);

  if (!force && lastSyncInfo?.updatedAt) {
    const ageMs = Date.now() - new Date(lastSyncInfo.updatedAt).getTime();
    const maxAgeMs = Number(maxAgeMinutes) * 60 * 1000;

    if (ageMs < maxAgeMs) {
      return {
        skipped: true,
        lastSyncAt: lastSyncInfo.updatedAt,
        ...readIndexCounts(db),
      };
    }
  }

  const [tvEntries, episodeEntries] = await Promise.all([
    fetchSitemapEntries(process.env.WORDPRESS_TV_SITEMAP_URL || DEFAULT_TV_SITEMAP_URL),
    fetchSitemapEntries(
      process.env.WORDPRESS_EPISODE_SITEMAP_URL || DEFAULT_EPISODE_SITEMAP_URL,
    ),
  ]);

  const syncedAt = new Date().toISOString();
  const mappedTvEntries = mapTvEntries(tvEntries, syncedAt);
  const mappedEpisodeEntries = mapEpisodeEntries(episodeEntries, syncedAt);

  const replaceIndex = db.transaction(() => {
    db.prepare(`DELETE FROM tv_index`).run();
    db.prepare(`DELETE FROM episode_index`).run();

    const insertTv = db.prepare(`
      INSERT INTO tv_index (
        url,
        slug,
        title,
        normalized_slug,
        normalized_title,
        lastmod,
        synced_at
      ) VALUES (
        @url,
        @slug,
        @title,
        @normalized_slug,
        @normalized_title,
        @lastmod,
        @synced_at
      )
    `);
    const insertEpisode = db.prepare(`
      INSERT INTO episode_index (
        url,
        slug,
        title,
        normalized_slug,
        normalized_title,
        series_key,
        season_number,
        episode_number,
        lastmod,
        synced_at
      ) VALUES (
        @url,
        @slug,
        @title,
        @normalized_slug,
        @normalized_title,
        @series_key,
        @season_number,
        @episode_number,
        @lastmod,
        @synced_at
      )
    `);

    for (const entry of mappedTvEntries) {
      insertTv.run(entry);
    }

    for (const entry of mappedEpisodeEntries) {
      insertEpisode.run(entry);
    }

    db.prepare(
      `
        INSERT INTO sync_state (name, value, updated_at)
        VALUES (@name, @value, @updated_at)
        ON CONFLICT(name) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `,
    ).run({
      name: "sitemap_sync",
      value: JSON.stringify({
        tvCount: mappedTvEntries.length,
        episodeCount: mappedEpisodeEntries.length,
      }),
      updated_at: syncedAt,
    });
  });

  replaceIndex();

  return {
    skipped: false,
    lastSyncAt: syncedAt,
    tvCount: mappedTvEntries.length,
    episodeCount: mappedEpisodeEntries.length,
  };
}

function scoreMatch(candidateValue, variantValues) {
  let score = 0;

  for (const variant of variantValues) {
    const candidate = String(candidateValue || "");
    const normalizedVariant = String(variant || "");

    if (!candidate || !normalizedVariant) {
      continue;
    }

    if (candidate === normalizedVariant) {
      score = Math.max(score, 100);
      continue;
    }

    if (
      candidate.startsWith(normalizedVariant) ||
      normalizedVariant.startsWith(candidate)
    ) {
      score = Math.max(score, 85);
      continue;
    }

    if (candidate.includes(normalizedVariant) || normalizedVariant.includes(candidate)) {
      score = Math.max(score, 70);
    }
  }

  return score;
}

async function findTvMatch({ titleVariants = [], slugVariants = [] } = {}) {
  const db = await openDatabase();
  const rows = db.prepare(`SELECT * FROM tv_index`).all();

  const rankedRows = rows
    .map((row) => {
      const titleScore = scoreMatch(row.normalized_title, titleVariants);
      const slugScore = scoreMatch(row.normalized_slug, slugVariants);

      return {
        ...row,
        confidenceScore: Math.max(titleScore, slugScore),
      };
    })
    .filter((row) => row.confidenceScore >= 85)
    .sort((left, right) => right.confidenceScore - left.confidenceScore);

  return rankedRows[0] || null;
}

async function findEpisodeMatch({
  seasonNumber,
  episodeNumber,
  seriesVariants = [],
  expectedTitleVariants = [],
  expectedSlugVariants = [],
} = {}) {
  const db = await openDatabase();
  const rows = db
    .prepare(
      `
        SELECT * FROM episode_index
        WHERE season_number = ? AND episode_number = ?
      `,
    )
    .all(Number(seasonNumber), Number(episodeNumber));

  const rankedRows = rows
    .map((row) => {
      const seriesScore = scoreMatch(row.series_key, seriesVariants);
      const titleScore = scoreMatch(row.normalized_title, expectedTitleVariants);
      const slugScore = scoreMatch(row.normalized_slug, expectedSlugVariants);

      return {
        ...row,
        confidenceScore: Math.max(seriesScore, titleScore, slugScore),
      };
    })
    .filter((row) => row.confidenceScore >= 85)
    .sort((left, right) => right.confidenceScore - left.confidenceScore);

  return rankedRows[0] || null;
}

module.exports = {
  findEpisodeMatch,
  findTvMatch,
  getDatabasePath,
  openDatabase,
  syncWordpressIndex,
};
