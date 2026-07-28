const {
  runEpisodeAutomation,
  runTvAutomation,
} = require("./wordpressAutomationService");
const { parseKrakenFilename } = require("./krakenFilenameParser");
const { resolveKrakenSource } = require("./krakenSourceService");
const { resolveFilemoonSource } = require("./filemoonSourceService");
const {
  findEpisodeMatch,
  findTvMatch,
  syncWordpressIndex,
  upsertEpisodeIndexEntry,
  upsertTvIndexEntry,
} = require("./wordpressIndexService");
const { normalizeSlug, normalizeText } = require("../utils/normalize");

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function getTmdbBaseUrl() {
  return process.env.TMDB_API_BASE_URL || "https://api.themoviedb.org/3";
}

function getTmdbLanguage(payload) {
  return payload.tmdbLanguage || process.env.TMDB_LANGUAGE || "en-US";
}

async function fetchTmdbTvDetails(tmdbId, payload = {}) {
  const apiKey = payload.tmdbApiKey || process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY belum diisi.");
  }

  const url = new URL(`${getTmdbBaseUrl()}/tv/${tmdbId}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", getTmdbLanguage(payload));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gagal mengambil data TV dari TMDB: ${response.status}`);
  }

  return response.json();
}

function getYearFromTvDetails(tvDetails) {
  const value = String(tvDetails?.first_air_date || "");
  return value.slice(0, 4);
}

function buildSeriesVariants(parsedFile, tvDetails) {
  const year = getYearFromTvDetails(tvDetails) || parsedFile.releaseYear;
  const rawTitles = uniqueValues([
    tvDetails?.name,
    tvDetails?.original_name,
    parsedFile.seriesTitleGuess,
    ...parsedFile.seriesTitleVariants,
  ]);

  const titleVariants = uniqueValues(
    rawTitles.flatMap((title) => {
      const normalizedTitle = normalizeText(title);
      const values = [normalizedTitle];

      if (normalizedTitle && year) {
        values.push(normalizeText(`${title} ${year}`));
      }

      return values;
    }),
  );

  const slugVariants = uniqueValues(
    rawTitles.flatMap((title) => {
      const normalized = normalizeSlug(title);
      const values = [normalized];

      if (normalized && year) {
        values.push(normalizeSlug(`${title} ${year}`));
      }

      return values;
    }),
  );

  return {
    year,
    rawTitles,
    titleVariants,
    slugVariants,
  };
}

function buildExpectedEpisodeVariants({
  parsedFile,
  tvDetails,
  seriesVariants,
}) {
  const titles = uniqueValues(
    seriesVariants.rawTitles.flatMap((title) => [
      `${title} Season ${parsedFile.seasonNumber} Episode ${parsedFile.episodeNumber}`,
      `${title} Session ${parsedFile.seasonNumber} Episode ${parsedFile.episodeNumber}`,
    ]),
  );
  const slugs = uniqueValues(
    seriesVariants.rawTitles.flatMap((title) => [
      `${title} season ${parsedFile.seasonNumber} episode ${parsedFile.episodeNumber}`,
      `${title} session ${parsedFile.seasonNumber} episode ${parsedFile.episodeNumber}`,
    ]),
  );

  if (seriesVariants.year) {
    const titleWithYear = uniqueValues(
      seriesVariants.rawTitles.flatMap((title) => [
        `${title} ${seriesVariants.year} Season ${parsedFile.seasonNumber} Episode ${parsedFile.episodeNumber}`,
        `${title} ${seriesVariants.year} Session ${parsedFile.seasonNumber} Episode ${parsedFile.episodeNumber}`,
      ]),
    );
    const slugWithYear = uniqueValues(
      seriesVariants.rawTitles.flatMap((title) => [
        `${title} ${seriesVariants.year} season ${parsedFile.seasonNumber} episode ${parsedFile.episodeNumber}`,
        `${title} ${seriesVariants.year} session ${parsedFile.seasonNumber} episode ${parsedFile.episodeNumber}`,
      ]),
    );

    titles.push(...titleWithYear);
    slugs.push(...slugWithYear);
  }

  const airDateYear = getYearFromTvDetails(tvDetails);
  if (airDateYear && !seriesVariants.year) {
    titles.push(
      ...uniqueValues(
        seriesVariants.rawTitles.map(
          (title) =>
            `${title} ${airDateYear} Season ${parsedFile.seasonNumber} Episode ${parsedFile.episodeNumber}`,
        ),
      ),
    );
    slugs.push(
      ...uniqueValues(
        seriesVariants.rawTitles.map(
          (title) =>
            `${title} ${airDateYear} season ${parsedFile.seasonNumber} episode ${parsedFile.episodeNumber}`,
        ),
      ),
    );
  }

  return {
    titleVariants: uniqueValues(titles.map((value) => normalizeText(value))),
    slugVariants: uniqueValues(slugs.map((value) => normalizeSlug(value))),
  };
}

function buildEpisodePayload(payload, parsedFile, mediaLinks) {
  const sourceLabel = payload.sourceLabel || "server";

  return {
    ...payload,
    tmdbId: parsedFile.tmdbId,
    seasonNumber: parsedFile.seasonNumber,
    episodeNumber: parsedFile.episodeNumber,
    embedCode: mediaLinks.embedCode,
    downloadUrl: mediaLinks.downloadUrl,
    serverTitle: payload.serverTitle || parsedFile.quality || sourceLabel,
    downloadTitle: payload.downloadTitle || parsedFile.quality || sourceLabel,
    submitAction:
      payload.episodeSubmitAction || payload.submitAction || "publish",
    touchLinkedTvShowAfterSave:
      payload.touchLinkedTvShowAfterSave !== undefined
        ? Boolean(payload.touchLinkedTvShowAfterSave)
        : true,
    linkedTvDateMode: payload.linkedTvDateMode || "publish-now",
  };
}

function buildTvPayload(payload, parsedFile) {
  return {
    ...payload,
    tmdbId: parsedFile.tmdbId,
    submitAction: payload.tvSubmitAction || payload.submitAction || "publish",
  };
}

async function rememberCreatedTv({
  parsedFile,
  tvDetails,
  seriesVariants,
  tvAction,
}) {
  if (!tvAction?.created || !tvAction.result?.ok) {
    return null;
  }

  const title =
    tvAction.result?.resolvedTitles?.tvTitle ||
    tvAction.result?.resolvedTitles?.wpTitle ||
    tvDetails?.name ||
    parsedFile.seriesTitleGuess;
  const slug =
    seriesVariants?.slugVariants?.[0] ||
    normalizeSlug(title || parsedFile.seriesSlugGuess);
  const url = tvAction.result?.finalUrl || `local-tv-${slug}`;

  await upsertTvIndexEntry({
    url,
    slug,
    title,
  });

  return {
    url,
    slug,
    title,
  };
}

async function rememberCreatedEpisode({
  parsedFile,
  tvDetails,
  episodeAction,
}) {
  if (!episodeAction?.created || !episodeAction.result?.ok) {
    return null;
  }

  const title =
    episodeAction.result?.resolvedTitles?.wpTitle ||
    `${tvDetails?.name || parsedFile.seriesTitleGuess} Season ${parsedFile.seasonNumber} Episode ${parsedFile.episodeNumber}`;
  const slug = normalizeSlug(title);
  const url = episodeAction.result?.finalUrl || `local-episode-${slug}`;
  const seriesKey = normalizeText(tvDetails?.name || parsedFile.seriesTitleGuess);

  await upsertEpisodeIndexEntry({
    url,
    slug,
    title,
    seriesKey,
    seasonNumber: parsedFile.seasonNumber,
    episodeNumber: parsedFile.episodeNumber,
  });

  return {
    url,
    slug,
    title,
  };
}

function buildMovieUnsupportedResult({
  checkOnly,
  source,
  parsedFile,
  mediaLinks,
  syncResult,
  providerTitle,
}) {
  const processLog = [
    `Mulai proses ${providerTitle}.`,
    source.fileId
      ? `${providerTitle} file terdeteksi: ${source.fileId}.`
      : `${providerTitle} file ID tidak ditemukan dari input.`,
    `Nama file ${providerTitle}: ${source.fileName}.`,
    `Hasil parse: mediaType=${parsedFile.mediaType}, tmdbId=${parsedFile.tmdbId}.`,
    syncResult.skipped
      ? `Index sitemap dipakai dari cache. TV=${syncResult.tvCount}, Episode=${syncResult.episodeCount}.`
      : `Index sitemap disegarkan. TV=${syncResult.tvCount}, Episode=${syncResult.episodeCount}.`,
    "Prefix `movie-` terdeteksi.",
    checkOnly
      ? "Mode checkOnly aktif, create movie belum dijalankan."
      : "Workflow create movie belum tersedia di backend saat ini.",
  ];

  return {
    ok: false,
    mode: checkOnly ? "check-only" : "process-upload",
    processLog,
    source,
    parsedFile,
    mediaLinks,
    syncResult,
    message:
      "File bertipe movie terdeteksi, tetapi workflow create movie belum tersedia.",
  };
}

async function processProviderUpload(
  payload,
  { providerName, providerTitle, sourceLabel, resolveSource },
) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload harus berupa object.");
  }

  const processLog = [];
  processLog.push(`Mulai proses ${providerTitle}.`);

  const source = await resolveSource(payload);
  processLog.push(
    source.fileId
      ? `${providerTitle} file terdeteksi: ${source.fileId}.`
      : `${providerTitle} file ID tidak ditemukan dari input.`,
  );
  if (!source.fileName) {
    throw new Error(
      `Nama file ${providerTitle} tidak bisa ditentukan. Isi \`fileName\` atau kirim URL/file ID ${providerTitle} yang valid.`,
    );
  }
  processLog.push(`Nama file ${providerTitle}: ${source.fileName}.`);

  const parsedFile = parseKrakenFilename(source.fileName);
  processLog.push(
    `Hasil parse: tmdbId=${parsedFile.tmdbId}, season=${parsedFile.seasonNumber}, episode=${parsedFile.episodeNumber}.`,
  );
  const mediaLinks = source.mediaLinks;
  const syncResult = await syncWordpressIndex({
    force: Boolean(payload.forceSync),
    maxAgeMinutes: payload.maxIndexAgeMinutes,
  });
  processLog.push(
    syncResult.skipped
      ? `Index sitemap dipakai dari cache. TV=${syncResult.tvCount}, Episode=${syncResult.episodeCount}.`
      : `Index sitemap disegarkan. TV=${syncResult.tvCount}, Episode=${syncResult.episodeCount}.`,
  );

  if (parsedFile.mediaType === "movie") {
    return buildMovieUnsupportedResult({
      checkOnly: Boolean(payload.checkOnly),
      source,
      parsedFile,
      mediaLinks,
      syncResult,
      providerTitle,
    });
  }

  const tvDetails = await fetchTmdbTvDetails(parsedFile.tmdbId, payload);
  processLog.push(`TMDB cocok ke serial: ${tvDetails.name}.`);
  const seriesVariants = buildSeriesVariants(parsedFile, tvDetails);
  const expectedEpisodeVariants = buildExpectedEpisodeVariants({
    parsedFile,
    tvDetails,
    seriesVariants,
  });

  const tvMatch = await findTvMatch({
    titleVariants: seriesVariants.titleVariants,
    slugVariants: seriesVariants.slugVariants,
  });
  const episodeMatch = await findEpisodeMatch({
    seasonNumber: parsedFile.seasonNumber,
    episodeNumber: parsedFile.episodeNumber,
    seriesVariants: seriesVariants.titleVariants,
    expectedTitleVariants: expectedEpisodeVariants.titleVariants,
    expectedSlugVariants: expectedEpisodeVariants.slugVariants,
  });

  const checkOnly = Boolean(payload.checkOnly);
  const createTvIfMissing = Boolean(payload.createTvIfMissing);
  processLog.push(
    tvMatch
      ? `TV sudah ada: ${tvMatch.slug}.`
      : createTvIfMissing
        ? "TV belum ada di index, akan dibuat bila checkOnly=false."
        : "TV belum ada di index, tetapi auto-create TV dimatikan.",
  );
  processLog.push(
    episodeMatch
      ? `Episode sudah ada: ${episodeMatch.slug}.`
      : "Episode belum ada di index, akan dibuat bila checkOnly=false.",
  );
  let tvAction = {
    created: false,
    skipped: Boolean(tvMatch) || checkOnly || !createTvIfMissing,
    existing: tvMatch,
    result: null,
    reason: tvMatch
      ? "TV sudah ada di sitemap."
      : checkOnly
        ? "Check only aktif, create TV dilewati."
        : !createTvIfMissing
          ? "Auto-create TV dimatikan."
        : "",
  };
  let episodeAction = {
    created: false,
    skipped: Boolean(episodeMatch) || checkOnly,
    existing: episodeMatch,
    result: null,
    reason: episodeMatch
      ? "Episode sudah ada di sitemap."
      : checkOnly
        ? "Check only aktif, create episode dilewati."
        : "",
  };

  if (!tvMatch && !checkOnly && createTvIfMissing) {
    processLog.push("Mulai create TV Show ke WordPress.");
    tvAction.result = await runTvAutomation(
      buildTvPayload({ ...payload, sourceLabel, provider: providerName }, parsedFile),
    );
    tvAction.created = Boolean(tvAction.result?.ok);
    tvAction.skipped = false;
    processLog.push(
      tvAction.created
        ? "TV Show berhasil dibuat."
        : `TV Show gagal dibuat: ${tvAction.result?.error || "unknown error"}.`,
    );

    const rememberedTv = await rememberCreatedTv({
      parsedFile,
      tvDetails,
      seriesVariants,
      tvAction,
    });
    if (rememberedTv) {
      tvAction.existing = rememberedTv;
      processLog.push(`TV lokal index diupdate: ${rememberedTv.slug}.`);
    }
  }

  if (!episodeMatch && !checkOnly) {
    if (!mediaLinks.embedCode) {
      episodeAction.reason =
        "Episode belum ada, tetapi `downloadUrl`, `embedUrl`, atau `embedCode` belum diisi.";
      episodeAction.skipped = true;
      processLog.push("Episode dilewati karena embed belum tersedia.");
    } else {
      processLog.push("Mulai create episode ke WordPress.");
      episodeAction.result = await runEpisodeAutomation(
        buildEpisodePayload(
          { ...payload, sourceLabel, provider: providerName },
          parsedFile,
          mediaLinks,
        ),
      );
      episodeAction.created = Boolean(episodeAction.result?.ok);
      episodeAction.skipped = false;
      processLog.push(
        episodeAction.created
          ? "Episode berhasil dibuat."
          : `Episode gagal dibuat: ${episodeAction.result?.error || "unknown error"}.`,
      );

      const rememberedEpisode = await rememberCreatedEpisode({
        parsedFile,
        tvDetails,
        episodeAction,
      });
      if (rememberedEpisode) {
        episodeAction.existing = rememberedEpisode;
        processLog.push(`Episode lokal index diupdate: ${rememberedEpisode.slug}.`);
      }

      const linkedTvUpdate = episodeAction.result?.linkedTvUpdate;
      if (episodeAction.created && linkedTvUpdate) {
        processLog.push(
          linkedTvUpdate.updated
            ? `Tanggal TV ikut di-update: ${linkedTvUpdate.title}.`
            : `Tanggal TV tidak berubah: ${linkedTvUpdate.reason || "unknown reason"}.`,
        );
      }
    }
  }

  if (checkOnly) {
    processLog.push("Mode checkOnly aktif, tidak ada post yang dibuat.");
  }

  return {
    ok: Boolean(episodeMatch || episodeAction.created || episodeAction.skipped),
    mode: checkOnly ? "check-only" : "process-upload",
    processLog,
    source,
    parsedFile,
    mediaLinks,
    syncResult,
    sourceProvider: providerName,
    tmdb: {
      id: tvDetails.id,
      name: tvDetails.name,
      originalName: tvDetails.original_name,
      firstAirDate: tvDetails.first_air_date,
    },
    tv: tvAction,
    episode: episodeAction,
  };
}

async function processKrakenUpload(payload) {
  const result = await processProviderUpload(payload, {
    providerName: "kraken",
    providerTitle: "Kraken",
    sourceLabel: "krakenfiles",
    resolveSource: resolveKrakenSource,
  });

  return {
    ...result,
    krakenSource: result.source,
  };
}

async function processFilemoonUpload(payload) {
  const result = await processProviderUpload(payload, {
    providerName: "filemoon",
    providerTitle: "Filemoon",
    sourceLabel: "filemoon",
    resolveSource: resolveFilemoonSource,
  });

  return {
    ...result,
    filemoonSource: result.source,
  };
}

module.exports = {
  processFilemoonUpload,
  processKrakenUpload,
};
