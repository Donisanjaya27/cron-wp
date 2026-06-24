const {
  runEpisodeAutomation,
  runTvAutomation,
} = require("./wordpressAutomationService");
const { parseKrakenFilename } = require("./krakenFilenameParser");
const { resolveKrakenSource } = require("./krakenSourceService");
const {
  findEpisodeMatch,
  findTvMatch,
  syncWordpressIndex,
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
  return {
    ...payload,
    tmdbId: parsedFile.tmdbId,
    seasonNumber: parsedFile.seasonNumber,
    episodeNumber: parsedFile.episodeNumber,
    embedCode: mediaLinks.embedCode,
    downloadUrl: mediaLinks.downloadUrl,
    serverTitle: payload.serverTitle || parsedFile.quality || "krakenfiles",
    downloadTitle: payload.downloadTitle || parsedFile.quality || "krakenfiles",
    submitAction: payload.episodeSubmitAction || payload.submitAction || "save",
    touchLinkedTvShowAfterSave: false,
  };
}

function buildTvPayload(payload, parsedFile) {
  return {
    ...payload,
    tmdbId: parsedFile.tmdbId,
    submitAction: payload.tvSubmitAction || payload.submitAction || "save",
  };
}

function buildMovieUnsupportedResult({
  checkOnly,
  krakenSource,
  parsedFile,
  mediaLinks,
  syncResult,
}) {
  const processLog = [
    "Mulai proses upload Kraken.",
    krakenSource.fileId
      ? `Kraken file terdeteksi: ${krakenSource.fileId}.`
      : "Kraken file ID tidak ditemukan dari URL.",
    `Nama file Kraken: ${krakenSource.fileName}.`,
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
    krakenSource,
    parsedFile,
    mediaLinks,
    syncResult,
    message:
      "File bertipe movie terdeteksi, tetapi workflow create movie belum tersedia.",
  };
}

async function processKrakenUpload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload harus berupa object.");
  }

  const processLog = [];
  processLog.push("Mulai proses upload Kraken.");

  const krakenSource = await resolveKrakenSource(payload);
  processLog.push(
    krakenSource.fileId
      ? `Kraken file terdeteksi: ${krakenSource.fileId}.`
      : "Kraken file ID tidak ditemukan dari URL.",
  );
  if (!krakenSource.fileName) {
    throw new Error(
      "Nama file Kraken tidak bisa ditentukan. Isi `fileName` atau kirim `downloadUrl`/`embedUrl` Kraken yang valid.",
    );
  }
  processLog.push(`Nama file Kraken: ${krakenSource.fileName}.`);

  const parsedFile = parseKrakenFilename(krakenSource.fileName);
  processLog.push(
    `Hasil parse: tmdbId=${parsedFile.tmdbId}, season=${parsedFile.seasonNumber}, episode=${parsedFile.episodeNumber}.`,
  );
  const mediaLinks = krakenSource.mediaLinks;
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
      krakenSource,
      parsedFile,
      mediaLinks,
      syncResult,
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
  processLog.push(
    tvMatch
      ? `TV sudah ada: ${tvMatch.slug}.`
      : "TV belum ada di index, akan dibuat bila checkOnly=false.",
  );
  processLog.push(
    episodeMatch
      ? `Episode sudah ada: ${episodeMatch.slug}.`
      : "Episode belum ada di index, akan dibuat bila checkOnly=false.",
  );
  let tvAction = {
    created: false,
    skipped: Boolean(tvMatch) || checkOnly,
    existing: tvMatch,
    result: null,
    reason: tvMatch
      ? "TV sudah ada di sitemap."
      : checkOnly
        ? "Check only aktif, create TV dilewati."
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

  if (!tvMatch && !checkOnly) {
    processLog.push("Mulai create TV Show ke WordPress.");
    tvAction.result = await runTvAutomation(
      buildTvPayload(payload, parsedFile),
    );
    tvAction.created = Boolean(tvAction.result?.ok);
    tvAction.skipped = false;
    processLog.push(
      tvAction.created
        ? "TV Show berhasil dibuat."
        : `TV Show gagal dibuat: ${tvAction.result?.error || "unknown error"}.`,
    );
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
        buildEpisodePayload(payload, parsedFile, mediaLinks),
      );
      episodeAction.created = Boolean(episodeAction.result?.ok);
      episodeAction.skipped = false;
      processLog.push(
        episodeAction.created
          ? "Episode berhasil dibuat."
          : `Episode gagal dibuat: ${episodeAction.result?.error || "unknown error"}.`,
      );
    }
  }

  if (checkOnly) {
    processLog.push("Mode checkOnly aktif, tidak ada post yang dibuat.");
  }

  return {
    ok:
      Boolean(tvMatch || tvAction.created || tvAction.skipped) &&
      Boolean(episodeMatch || episodeAction.created || episodeAction.skipped),
    mode: checkOnly ? "check-only" : "process-upload",
    processLog,
    krakenSource,
    parsedFile,
    mediaLinks,
    syncResult,
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

module.exports = {
  processKrakenUpload,
};
