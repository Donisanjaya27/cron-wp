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

function stripIframeAndExtractUrl(rawUrl) {
  let value = String(rawUrl || "").trim();
  if (!value) return "";
  if (/^<\s*iframe\b/i.test(value)) {
    const m = value.match(/\bsrc\s*=\s*["'`]?([^\s"'`>]+)/i);
    if (m && m[1]) value = m[1].trim();
  }
  return value.replace(/^[\s"'`<>]+|[\s"'`<>]+$/g, "").trim();
}

function extractFilemoonFileIdFromUrl(rawUrl) {
  const value = stripIframeAndExtractUrl(rawUrl);
  if (!value) {
    return "";
  }

  const match = value.match(
    /(?:filemoon\.org|byse\.sx|bysezejataos\.com|[a-z0-9-]+\.sx|[a-z0-9-]+\.com)\/(?:[A-Za-z0-9_-]{1,8}\/){0,5}([A-Za-z0-9]{6,})(?:\/(?:file|watch|embed|[^/\s]{4,})?)?/i,
  );

  return match?.[1] || "";
}

function extractFilemoonSlugSuffix(rawUrl, fallbackFileId) {
  const value = stripIframeAndExtractUrl(rawUrl);
  if (!value) return "";
  const fileId = (
    fallbackFileId ||
    extractFilemoonFileIdFromUrl(value) ||
    ""
  ).trim();
  if (!fileId) return "";
  const after = value.split(`/${fileId}/`)[1] || "";
  if (!after) return "";
  return after.split(/[?#]/)[0].replace(/\/+$/, "").trim();
}

function extractDomainFromUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "filemoon.org";
  }

  try {
    const u = new URL(value);
    return u.hostname || "filemoon.org";
  } catch {
    const match = value.match(/\/\/([^/]+)/);
    return match?.[1] || "filemoon.org";
  }
}

function extractSeasonEpisodeFromSlug(rawSlugOrUrl) {
  const value = String(rawSlugOrUrl || "").trim();
  if (!value) {
    return { seasonNumber: null, episodeNumber: null };
  }

  const tokens = value.split(/[-_./?&#\s]+/).filter(Boolean);
  let seasonNumber = null;
  let episodeNumber = null;

  for (const token of tokens) {
    if (episodeNumber === null) {
      const epMatch = token.match(/^ep(?:isode)?(\d+)$/i);
      if (epMatch) {
        episodeNumber = Number(epMatch[1]);
        continue;
      }
      const sMatch = token.match(/^s(\d+)e(\d+)$/i);
      if (sMatch) {
        seasonNumber = Number(sMatch[1]);
        episodeNumber = Number(sMatch[2]);
        continue;
      }
    }
    if (seasonNumber === null) {
      const sMatch = token.match(/^s(?:eason)?(\d+)$/i);
      if (sMatch) {
        seasonNumber = Number(sMatch[1]);
        continue;
      }
    }
  }

  return { seasonNumber, episodeNumber };
}

function buildFilemoonPageUrl(fileId, baseUrlOrDomain) {
  if (!fileId) {
    return "";
  }
  const host = extractDomainFromUrl(baseUrlOrDomain || "https://filemoon.org");
  return `https://${host}/${fileId}/file`;
}

function buildFilemoonWatchUrl(fileId, baseUrlOrDomain) {
  if (!fileId) {
    return "";
  }
  const host = extractDomainFromUrl(baseUrlOrDomain || "https://filemoon.org");
  return `https://${host}/${fileId}/watch`;
}

function buildFilemoonEmbedUrl(fileId, baseUrlOrDomain) {
  if (!fileId) {
    return "";
  }
  const host = extractDomainFromUrl(baseUrlOrDomain || "https://filemoon.org");
  return `https://${host}/${fileId}/embed`;
}

function buildFilemoonEmbedUrlWithSlug(fileId, slug, baseUrlOrDomain) {
  if (!fileId) return "";
  const host = extractDomainFromUrl(baseUrlOrDomain || "https://filemoon.org");
  const cleanSlug = String(slug || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (cleanSlug) {
    return `https://${host}/e/${fileId}/${cleanSlug}`;
  }
  return buildFilemoonEmbedUrl(fileId, baseUrlOrDomain);
}

function buildFilemoonDownloadUrlWithSlug(fileId, slug, baseUrlOrDomain) {
  if (!fileId) return "";
  const host = extractDomainFromUrl(baseUrlOrDomain || "https://filemoon.org");
  const cleanSlug = String(slug || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (cleanSlug) {
    return `https://${host}/d/${fileId}/${cleanSlug}`;
  }
  return buildFilemoonPageUrl(fileId, baseUrlOrDomain);
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

function resolveFilemoonMediaLinks({
  downloadUrl,
  watchUrl,
  embedUrl,
  embedCode,
  fileId,
  baseDomain,
} = {}) {
  const downloadInput = stripIframeAndExtractUrl(downloadUrl);
  const embedInput = stripIframeAndExtractUrl(embedUrl);
  const watchInput = stripIframeAndExtractUrl(watchUrl);
  const anyUrlForDomain =
    baseDomain || downloadInput || watchInput || embedInput || "";

  let resolvedFileId = String(fileId || "").trim();
  if (!resolvedFileId) {
    resolvedFileId =
      extractFilemoonFileIdFromUrl(downloadInput) ||
      extractFilemoonFileIdFromUrl(watchInput) ||
      extractFilemoonFileIdFromUrl(embedInput);
  }

  const anyUrlWithContent = downloadInput || watchInput || embedInput || "";
  const slugSuffix =
    extractFilemoonSlugSuffix(downloadInput, resolvedFileId) ||
    extractFilemoonSlugSuffix(embedInput, resolvedFileId) ||
    extractFilemoonSlugSuffix(watchInput, resolvedFileId) ||
    extractFilemoonSlugSuffix(anyUrlWithContent, resolvedFileId) ||
    "";

  const downloadStartsWithE =
    downloadInput && /^https?:\/\/[^/]+\/e\//i.test(downloadInput);
  const embedStartsWithE =
    embedInput && /^https?:\/\/[^/]+\/e\//i.test(embedInput);
  const downloadStartsWithD =
    downloadInput && /^https?:\/\/[^/]+\/d\//i.test(downloadInput);
  const embedStartsWithD =
    embedInput && /^https?:\/\/[^/]+\/d\//i.test(embedInput);

  let resolvedEmbedUrl = "";
  let resolvedDownloadUrl = "";

  if (embedStartsWithE) {
    resolvedEmbedUrl = embedInput;
  } else if (downloadStartsWithE) {
    resolvedEmbedUrl = downloadInput;
  } else if (embedStartsWithD && resolvedFileId && slugSuffix) {
    resolvedEmbedUrl = buildFilemoonEmbedUrlWithSlug(
      resolvedFileId,
      slugSuffix,
      embedInput,
    );
  } else if (downloadStartsWithD && resolvedFileId && slugSuffix) {
    resolvedEmbedUrl = buildFilemoonEmbedUrlWithSlug(
      resolvedFileId,
      slugSuffix,
      downloadInput,
    );
  } else if (embedInput) {
    resolvedEmbedUrl = embedInput;
  } else if (resolvedFileId) {
    resolvedEmbedUrl = slugSuffix
      ? buildFilemoonEmbedUrlWithSlug(
          resolvedFileId,
          slugSuffix,
          anyUrlForDomain,
        )
      : buildFilemoonEmbedUrl(resolvedFileId, anyUrlForDomain);
  }

  if (downloadStartsWithD) {
    resolvedDownloadUrl = downloadInput;
  } else if (embedStartsWithD) {
    resolvedDownloadUrl = embedInput;
  } else if (downloadStartsWithE && resolvedFileId && slugSuffix) {
    resolvedDownloadUrl = buildFilemoonDownloadUrlWithSlug(
      resolvedFileId,
      slugSuffix,
      downloadInput,
    );
  } else if (embedStartsWithE && resolvedFileId && slugSuffix) {
    resolvedDownloadUrl = buildFilemoonDownloadUrlWithSlug(
      resolvedFileId,
      slugSuffix,
      embedInput,
    );
  } else if (downloadInput) {
    resolvedDownloadUrl = downloadInput;
  } else if (resolvedFileId) {
    resolvedDownloadUrl = slugSuffix
      ? buildFilemoonDownloadUrlWithSlug(
          resolvedFileId,
          slugSuffix,
          anyUrlForDomain,
        )
      : buildFilemoonPageUrl(resolvedFileId, anyUrlForDomain);
  }

  const resolvedWatchUrl =
    watchInput ||
    (resolvedFileId
      ? buildFilemoonWatchUrl(resolvedFileId, anyUrlForDomain)
      : "");

  const embedOk =
    resolvedEmbedUrl &&
    /^(https?:)?\/\//i.test(resolvedEmbedUrl) &&
    resolvedEmbedUrl.includes(`/${resolvedFileId}/`);
  if (!embedOk && resolvedFileId && slugSuffix) {
    resolvedEmbedUrl = buildFilemoonEmbedUrlWithSlug(
      resolvedFileId,
      slugSuffix,
      anyUrlForDomain,
    );
  }
  if (!resolvedDownloadUrl && resolvedFileId) {
    resolvedDownloadUrl = slugSuffix
      ? buildFilemoonDownloadUrlWithSlug(
          resolvedFileId,
          slugSuffix,
          anyUrlForDomain,
        )
      : buildFilemoonPageUrl(resolvedFileId, anyUrlForDomain);
  }

  return {
    fileId: resolvedFileId,
    downloadUrl: resolvedDownloadUrl,
    watchUrl: resolvedWatchUrl,
    embedUrl: resolvedEmbedUrl,
    embedCode: embedCode || buildEmbedCode(resolvedEmbedUrl),
  };
}

function mergeManualOverride(parsedFile, override = {}) {
  const result = { ...(parsedFile || {}) };
  const overrideTmdbId = Number(override.tmdbId);
  if (Number.isInteger(overrideTmdbId) && overrideTmdbId >= 1) {
    result.tmdbId = overrideTmdbId;
  }
  const overrideSeason = Number(override.seasonNumber);
  if (Number.isInteger(overrideSeason) && overrideSeason >= 1) {
    result.seasonNumber = overrideSeason;
  }
  const overrideEpisode = Number(override.episodeNumber);
  if (Number.isInteger(overrideEpisode) && overrideEpisode >= 1) {
    result.episodeNumber = overrideEpisode;
  }
  if (override.mediaType) {
    result.mediaType = override.mediaType;
  }
  return result;
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

function parseKrakenFilenameLenient(fileName, fallback = {}) {
  const baseName = stripExtension(fileName);
  const fromSlug = baseName
    ? extractSeasonEpisodeFromSlug(baseName)
    : { seasonNumber: null, episodeNumber: null };

  const tmdbIdNum = Number(fallback.tmdbId);
  const mediaType =
    fallback.mediaType || (fromSlug.episodeNumber ? "tv" : "tv");

  const seasonOverride = Number(fallback.seasonNumber);
  const episodeOverride = Number(fallback.episodeNumber);
  let seasonNumber =
    Number.isInteger(seasonOverride) && seasonOverride >= 1
      ? seasonOverride
      : fromSlug.seasonNumber || 1;
  let episodeNumber =
    Number.isInteger(episodeOverride) && episodeOverride >= 1
      ? episodeOverride
      : fromSlug.episodeNumber;

  const parts = baseName.split("-").filter(Boolean);
  let quality = "";
  let releaseYear = "";
  let sourceTag = "";
  const titleTokens = [];

  for (const rawPart of parts) {
    const part = String(rawPart).trim();
    if (!part) continue;
    if (!sourceTag && IGNORED_TOKENS.has(part.toLowerCase())) {
      sourceTag = part;
      continue;
    }
    if (!quality && QUALITY_PATTERN.test(part)) {
      quality = part.toLowerCase();
      continue;
    }
    if (SEASON_PATTERN.test(part) || EPISODE_PATTERN.test(part)) continue;
    if (!releaseYear && YEAR_PATTERN.test(part)) {
      releaseYear = part;
      continue;
    }
    titleTokens.push(part);
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
    fileName: path.basename(String(fileName || "")),
    rawName: baseName,
    mediaType,
    tmdbId: Number.isInteger(tmdbIdNum) && tmdbIdNum >= 1 ? tmdbIdNum : 0,
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
  buildFilemoonEmbedUrl,
  buildFilemoonPageUrl,
  buildFilemoonWatchUrl,
  buildKrakenDownloadUrl,
  buildKrakenEmbedUrl,
  extractDomainFromUrl,
  extractFilemoonFileIdFromUrl,
  extractKrakenFileIdFromUrl,
  extractSeasonEpisodeFromSlug,
  mergeManualOverride,
  parseKrakenFilename,
  parseKrakenFilenameLenient,
  resolveFilemoonMediaLinks,
  resolveKrakenMediaLinks,
};
