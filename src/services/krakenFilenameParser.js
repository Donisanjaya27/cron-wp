const path = require("path");
const { humanizeSlug, normalizeSlug } = require("../utils/normalize");

const QUALITY_PATTERN = /^(?:\d{3,4}p|4k|8k|hd|fhd|uhd)$/i;
const SEASON_PATTERN = /^s(?:eason)?(\d+)$/i;
const EPISODE_PATTERN = /^ep(?:isode)?(\d+)$/i;
const YEAR_PATTERN = /^(?:19|20)\d{2}$/;
const IGNORED_TOKENS = new Set(["drakorid"]);
const SUPPORTED_PREFIXES = new Set(["tv", "movie"]);

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function stripExtension(fileName) {
  return path.basename(String(fileName || "")).replace(/\.[^.]+$/, "");
}

function extractKrakenFileIdFromUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }

  const match = value.match(
    /krakenfiles\.com\/(?:view\/|embed-video\/)([A-Za-z0-9_-]+)/i,
  );

  return match?.[1] || "";
}

function buildKrakenDownloadUrl(fileId) {
  if (!fileId) {
    return "";
  }

  return `https://krakenfiles.com/view/${fileId}/file.html`;
}

function buildKrakenEmbedUrl(fileId) {
  if (!fileId) {
    return "";
  }

  return `https://krakenfiles.com/embed-video/${fileId}`;
}

function buildEmbedCode(embedUrl) {
  if (!embedUrl) {
    return "";
  }

  return `<iframe height="360" width="640" frameBorder="0" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" src="${embedUrl}"></iframe>`;
}

function resolveKrakenMediaLinks({
  downloadUrl,
  embedUrl,
  embedCode,
  fileId,
} = {}) {
  const resolvedFileId =
    fileId ||
    extractKrakenFileIdFromUrl(downloadUrl) ||
    extractKrakenFileIdFromUrl(embedUrl);
  const resolvedDownloadUrl =
    downloadUrl || buildKrakenDownloadUrl(resolvedFileId);
  const resolvedEmbedUrl = embedUrl || buildKrakenEmbedUrl(resolvedFileId);

  return {
    fileId: resolvedFileId,
    downloadUrl: resolvedDownloadUrl,
    embedUrl: resolvedEmbedUrl,
    embedCode: embedCode || buildEmbedCode(resolvedEmbedUrl),
  };
}

function parseKrakenFilename(fileName) {
  const baseName = stripExtension(fileName);
  if (!baseName) {
    throw new Error("`fileName` wajib diisi.");
  }

  const parts = baseName.split("-").filter(Boolean);
  const rawPrefix = String(parts[0] || "").toLowerCase();
  if (parts.length < 4 || !SUPPORTED_PREFIXES.has(rawPrefix)) {
    throw new Error(
      "Format filename tidak valid. Contoh: tv-239901-drakorid-720p-judul-2026-ep11.mp4 atau movie-12345-drakorid-720p-judul-2026.mp4",
    );
  }

  const tmdbId = Number(parts[1]);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    throw new Error("TMDB ID pada filename tidak valid.");
  }

  let seasonNumber = 1;
  let episodeNumber = null;
  let quality = "";
  let releaseYear = "";
  let sourceTag = "";
  const titleTokens = [];
  const mediaType = rawPrefix === "movie" ? "movie" : "tv";

  for (const rawPart of parts.slice(2)) {
    const part = String(rawPart).trim();
    if (!part) {
      continue;
    }

    if (!sourceTag && IGNORED_TOKENS.has(part.toLowerCase())) {
      sourceTag = part;
      continue;
    }

    if (!quality && QUALITY_PATTERN.test(part)) {
      quality = part.toLowerCase();
      continue;
    }

    const seasonMatch = part.match(SEASON_PATTERN);
    if (seasonMatch) {
      seasonNumber = Number(seasonMatch[1]);
      continue;
    }

    const episodeMatch = part.match(EPISODE_PATTERN);
    if (episodeMatch) {
      episodeNumber = Number(episodeMatch[1]);
      continue;
    }

    if (!releaseYear && YEAR_PATTERN.test(part)) {
      releaseYear = part;
      continue;
    }

    titleTokens.push(part);
  }

  if (mediaType === "tv" && !episodeNumber) {
    throw new Error("Nomor episode tidak ditemukan pada filename.");
  }

  if (!titleTokens.length) {
    throw new Error(
      mediaType === "movie"
        ? "Judul movie tidak ditemukan pada filename."
        : "Judul serial tidak ditemukan pada filename.",
    );
  }

  const seriesSlugGuess = titleTokens.join("-").toLowerCase();
  const seriesTitleGuess = humanizeSlug(seriesSlugGuess);
  const normalizedSeriesSlug = normalizeSlug(seriesSlugGuess);
  const seriesTitleVariants = uniqueValues(
    [
      seriesTitleGuess,
      titleTokens.join(" "),
      normalizedSeriesSlug.replace(/-/g, " "),
    ].map((value) => value.trim()),
  );

  return {
    fileName: path.basename(String(fileName)),
    rawName: baseName,
    mediaType,
    tmdbId,
    seasonNumber,
    episodeNumber,
    quality,
    releaseYear,
    sourceTag,
    seriesSlugGuess,
    seriesTitleGuess,
    seriesTitleVariants,
  };
}

module.exports = {
  buildEmbedCode,
  buildKrakenDownloadUrl,
  buildKrakenEmbedUrl,
  extractKrakenFileIdFromUrl,
  parseKrakenFilename,
  resolveKrakenMediaLinks,
};
