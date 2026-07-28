const path = require("path");
const { chromium } = require("playwright");
const { buildArtifactPath, ensureDirectory } = require("../utils/file");

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_LOGIN_SELECTORS = {
  usernameSelector: "#user_login",
  passwordSelector: "#user_pass",
  submitSelector: "#wp-submit",
  successSelector: "#wpadminbar",
};
const DEFAULT_EPISODE_SELECTORS = {
  tmdbId: "#idmuvi-core-id",
  seasonNumber: "#idmuvi-core-id-session",
  episodeNumber: "#idmuvi-core-id-episode",
  fetchButton: "#idmuvi-core-id-submit",
  wpTitle: "#title",
  seriesTitle: "#opsi-serie",
  fetchedTitle: "#opsi-title",
  fetchedTmdbId: "#opsi-tmdbid",
  posterUrl: "#opsi-imageposter",
  seoKeyphraseInput: "#focus-keyword-input-metabox",
  seoKeyphraseHidden: "#yoast_wpseo_focuskw",
  playerTitlePrefix: "#opsi-title-player",
  playerEmbedPrefix: "#opsi-player",
  downloadTitlePrefix: "#opsi-title-download",
  downloadUrlPrefix: "#opsi-download",
  saveDraft: "#save-post",
  publish: "#publish",
  successNotice: "#message.updated, .updated, .notice-success",
};
const DEFAULT_TV_SELECTORS = {
  tmdbId: "#idmuvi-core-id",
  fetchButton: "#idmuvi-core-id-submit",
  wpTitle: "#title",
  postStatus: "#post_status",
  fetchedTitle: "#opsi-title",
  fetchedTmdbId: "#opsi-tmdbid",
  posterUrl: "#opsi-imageposter",
  seoKeyphraseInput: "#focus-keyword-input-metabox",
  seoKeyphraseHidden: "#yoast_wpseo_focuskw",
  saveDraft: "#save-post",
  publish: "#publish",
  successNotice: "#message.updated, .updated, .notice-success",
};

function sanitizeUrl(rawUrl) {
  if (!rawUrl) {
    return rawUrl;
  }

  return String(rawUrl)
    .trim()
    .replace(/[`"' ]+/g, "");
}

function buildDefaultLoginConfig(targetUrl) {
  const envLoginUrl = sanitizeUrl(process.env.WORDPRESS_LOGIN_URL);
  const envUsername = process.env.WORDPRESS_USERNAME;
  const envPassword = process.env.WORDPRESS_PASSWORD;

  if (!envLoginUrl || !envUsername || !envPassword) {
    return null;
  }

  return {
    url: envLoginUrl,
    username: envUsername,
    password: envPassword,
    postLoginUrl: targetUrl,
    ...DEFAULT_LOGIN_SELECTORS,
  };
}

function normalizePayload(payload, envTargetKey = "WORDPRESS_TARGET_URL") {
  const targetUrl = sanitizeUrl(payload.targetUrl || process.env[envTargetKey]);
  const envLogin = buildDefaultLoginConfig(targetUrl);

  return {
    ...payload,
    targetUrl,
    login: {
      ...envLogin,
      ...(payload.login || {}),
    },
  };
}

function assertPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload harus berupa object.");
  }

  if (!payload.targetUrl) {
    throw new Error("`targetUrl` wajib diisi.");
  }

  if (!Array.isArray(payload.fields)) {
    throw new Error("`fields` wajib berupa array.");
  }
}

function assertEpisodePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload episode harus berupa object.");
  }

  if (!payload.tmdbId) {
    throw new Error("`tmdbId` wajib diisi.");
  }

  if (!payload.seasonNumber && payload.seasonNumber !== 0) {
    throw new Error("`seasonNumber` wajib diisi.");
  }

  if (!payload.episodeNumber && payload.episodeNumber !== 0) {
    throw new Error("`episodeNumber` wajib diisi.");
  }

  if (!payload.embedCode) {
    throw new Error("`embedCode` wajib diisi.");
  }
}

function assertTvPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload tv harus berupa object.");
  }

  if (!payload.tmdbId) {
    throw new Error("`tmdbId` wajib diisi.");
  }
}

async function getFieldValue(page, selector) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT });

  return locator.evaluate((element) => String(element.value || "").trim());
}

function getTmdbApiKey(payload) {
  return String(payload.tmdbApiKey || process.env.TMDB_API_KEY || "").trim();
}

function buildTmdbImageUrl(pathname) {
  if (!pathname) {
    return "";
  }

  return `https://image.tmdb.org/t/p/original${pathname}`;
}

async function fetchTmdbJson(endpoint, apiKey) {
  const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "id-ID");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `TMDB request gagal: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

async function resolveEpisodePosterUrl(payload) {
  const apiKey = getTmdbApiKey(payload);
  if (!apiKey) {
    return "";
  }

  const [episodeData, tvData] = await Promise.all([
    fetchTmdbJson(
      `/tv/${payload.tmdbId}/season/${payload.seasonNumber}/episode/${payload.episodeNumber}`,
      apiKey,
    ).catch(() => null),
    fetchTmdbJson(`/tv/${payload.tmdbId}`, apiKey).catch(() => null),
  ]);

  return (
    buildTmdbImageUrl(episodeData?.still_path) ||
    buildTmdbImageUrl(tvData?.poster_path) ||
    buildTmdbImageUrl(tvData?.backdrop_path) ||
    ""
  );
}

async function resolveTvPosterUrl(payload) {
  const apiKey = getTmdbApiKey(payload);
  if (!apiKey) {
    return "";
  }

  const tvData = await fetchTmdbJson(`/tv/${payload.tmdbId}`, apiKey).catch(
    () => null,
  );

  return (
    buildTmdbImageUrl(tvData?.poster_path) ||
    buildTmdbImageUrl(tvData?.backdrop_path) ||
    ""
  );
}

async function fillPosterIfEmpty(page, selector, posterUrlResolver, payload) {
  const currentPosterUrl = await getFieldValue(page, selector);
  if (currentPosterUrl) {
    return {
      filled: false,
      reason: "Poster sudah terisi dari WordPress/TMDB.",
      posterUrl: currentPosterUrl,
    };
  }

  const resolvedPosterUrl = await posterUrlResolver(payload);
  if (!resolvedPosterUrl) {
    return {
      filled: false,
      reason: "Poster TMDB tidak ditemukan atau TMDB_API_KEY belum diisi.",
      posterUrl: "",
    };
  }

  await setFieldValue(page, selector, resolvedPosterUrl);

  return {
    filled: true,
    reason: "Poster diisi dari TMDB fallback.",
    posterUrl: resolvedPosterUrl,
  };
}

async function waitForEpisodeTitleLoaded(page, tmdbId, timeout) {
  await page.waitForFunction(
    ({ wpTitleSelector, titleSelector, tmdbSelector, expectedTmdbId }) => {
      const wpTitleInput = document.querySelector(wpTitleSelector);
      const fetchedTitleInput = document.querySelector(titleSelector);
      const tmdbInput = document.querySelector(tmdbSelector);

      return Boolean(
        wpTitleInput &&
        wpTitleInput.value.trim() &&
        fetchedTitleInput &&
        fetchedTitleInput.value.trim() &&
        tmdbInput &&
        tmdbInput.value.trim() === expectedTmdbId,
      );
    },
    {
      wpTitleSelector: DEFAULT_EPISODE_SELECTORS.wpTitle,
      titleSelector: DEFAULT_EPISODE_SELECTORS.fetchedTitle,
      tmdbSelector: DEFAULT_EPISODE_SELECTORS.fetchedTmdbId,
      expectedTmdbId: String(tmdbId),
    },
    { timeout },
  );

  return page.evaluate(
    ({ wpTitleSelector, titleSelector, seriesTitleSelector }) => ({
      wpTitle: document.querySelector(wpTitleSelector)?.value.trim() || "",
      seriesTitle:
        document.querySelector(seriesTitleSelector)?.value.trim() || "",
      episodeTitle: document.querySelector(titleSelector)?.value.trim() || "",
    }),
    {
      wpTitleSelector: DEFAULT_EPISODE_SELECTORS.wpTitle,
      seriesTitleSelector: DEFAULT_EPISODE_SELECTORS.seriesTitle,
      titleSelector: DEFAULT_EPISODE_SELECTORS.fetchedTitle,
    },
  );
}

async function waitForTvTitleLoaded(page, tmdbId, timeout) {
  await page.waitForFunction(
    ({ wpTitleSelector, titleSelector, tmdbSelector, expectedTmdbId }) => {
      const wpTitleInput = document.querySelector(wpTitleSelector);
      const fetchedTitleInput = document.querySelector(titleSelector);
      const tmdbInput = document.querySelector(tmdbSelector);

      return Boolean(
        wpTitleInput &&
        wpTitleInput.value.trim() &&
        fetchedTitleInput &&
        fetchedTitleInput.value.trim() &&
        tmdbInput &&
        tmdbInput.value.trim() === expectedTmdbId,
      );
    },
    {
      wpTitleSelector: DEFAULT_TV_SELECTORS.wpTitle,
      titleSelector: DEFAULT_TV_SELECTORS.fetchedTitle,
      tmdbSelector: DEFAULT_TV_SELECTORS.fetchedTmdbId,
      expectedTmdbId: String(tmdbId),
    },
    { timeout },
  );

  return page.evaluate(
    ({ wpTitleSelector, titleSelector }) => ({
      wpTitle: document.querySelector(wpTitleSelector)?.value.trim() || "",
      tvTitle: document.querySelector(titleSelector)?.value.trim() || "",
    }),
    {
      wpTitleSelector: DEFAULT_TV_SELECTORS.wpTitle,
      titleSelector: DEFAULT_TV_SELECTORS.fetchedTitle,
    },
  );
}

async function runWithWordpressPage(payload, runner) {
  const normalizedPayload = normalizePayload(payload);
  assertPayload({
    ...normalizedPayload,
    fields: normalizedPayload.fields || [],
  });

  const {
    targetUrl,
    headless = true,
    navigationTimeout = DEFAULT_TIMEOUT,
    actionDelayMs = 200,
    login,
  } = normalizedPayload;

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  const executionLog = [];

  page.setDefaultTimeout(navigationTimeout);

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    executionLog.push(`Open target URL: ${targetUrl}`);

    if (login && login.url) {
      await page.goto(login.url, { waitUntil: "domcontentloaded" });
      executionLog.push(`Open login URL: ${login.url}`);

      if (login.usernameSelector) {
        await page
          .locator(login.usernameSelector)
          .fill(String(login.username || ""));
      }

      if (login.passwordSelector) {
        await page
          .locator(login.passwordSelector)
          .fill(String(login.password || ""));
      }

      if (login.submitSelector) {
        await page.locator(login.submitSelector).click();
      }

      if (login.successSelector) {
        await page.waitForSelector(login.successSelector, {
          timeout: navigationTimeout,
        });
      }

      if (login.postLoginUrl) {
        await page.goto(login.postLoginUrl, { waitUntil: "domcontentloaded" });
      } else {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
      }

      executionLog.push("Login selesai.");
    }

    const runnerResult =
      (await runner({
        page,
        executionLog,
        payload: normalizedPayload,
        navigationTimeout,
        actionDelayMs,
      })) || {};

    const finalUrl = page.url();

    await browser.close();

    return {
      ok: true,
      finalUrl,
      executionLog,
      ...runnerResult,
    };
  } catch (error) {
    const screenshotName = `failure-${Date.now()}.png`;
    const screenshotPath = buildArtifactPath(screenshotName);
    await ensureDirectory(path.dirname(screenshotPath));

    await page
      .screenshot({ path: screenshotPath, fullPage: true })
      .catch(() => null);
    await browser.close();

    return {
      ok: false,
      error: error.message,
      executionLog,
      screenshotPath,
    };
  }
}

async function fillField(page, field) {
  const {
    selector,
    type = "fill",
    value,
    values,
    waitForSelector = true,
    timeout = DEFAULT_TIMEOUT,
  } = field;

  if (!selector) {
    throw new Error("Setiap field wajib memiliki `selector`.");
  }

  if (waitForSelector) {
    await page.waitForSelector(selector, { timeout });
  }

  switch (type) {
    case "fill":
      await page.locator(selector).fill(String(value ?? ""));
      break;
    case "click":
      await page.locator(selector).click({ timeout });
      break;
    case "check":
      await page.locator(selector).check({ timeout });
      break;
    case "uncheck":
      await page.locator(selector).uncheck({ timeout });
      break;
    case "select":
      await page.locator(selector).selectOption(value);
      break;
    case "multi-select":
      await page.locator(selector).selectOption(values || []);
      break;
    case "press":
      await page.locator(selector).press(String(value || "Enter"));
      break;
    default:
      throw new Error(`Tipe field tidak didukung: ${type}`);
  }
}

async function setFieldValue(page, selector, value) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT });

  if (await locator.isVisible().catch(() => false)) {
    await locator.fill(String(value ?? ""));
    return;
  }

  await locator.evaluate(
    (element, nextValue) => {
      element.value = nextValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    },
    String(value ?? ""),
  );
}

async function clickAttachedElement(page, selector, timeout = DEFAULT_TIMEOUT) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: "attached", timeout });

  if (await locator.isVisible().catch(() => false)) {
    try {
      await locator.click({ timeout: Math.min(timeout, 2000) });
      return;
    } catch (_error) {
      // Fall back to DOM click when WordPress admin controls are attached but not interactable.
    }
  }

  await locator.evaluate((element) => {
    element.click();
  });
}

async function setSeoKeyphrase(page, value) {
  const nextValue = String(value ?? "").trim();

  if (!nextValue) {
    return;
  }

  await setFieldValue(
    page,
    DEFAULT_EPISODE_SELECTORS.seoKeyphraseInput,
    nextValue,
  );

  const hiddenLocator = page.locator(
    DEFAULT_EPISODE_SELECTORS.seoKeyphraseHidden,
  );
  if (await hiddenLocator.count()) {
    await hiddenLocator.evaluate((element, hiddenValue) => {
      element.value = hiddenValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, nextValue);
  }
}

async function setSeoKeyphraseWithSelectors(page, value, selectors) {
  const nextValue = String(value ?? "").trim();

  if (!nextValue) {
    return;
  }

  await setFieldValue(page, selectors.seoKeyphraseInput, nextValue);

  const hiddenLocator = page.locator(selectors.seoKeyphraseHidden);
  if (await hiddenLocator.count()) {
    await hiddenLocator.evaluate((element, hiddenValue) => {
      element.value = hiddenValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, nextValue);
  }
}

function buildAdminUrl(pathname) {
  const loginUrl = new URL(process.env.WORDPRESS_LOGIN_URL);
  return new URL(pathname, loginUrl.origin).toString();
}

async function findMatchingTvPost(page, { seriesTitle, tmdbId }) {
  const searchUrl = buildAdminUrl(
    `/wp-admin/edit.php?post_type=tv&s=${encodeURIComponent(seriesTitle)}`,
  );
  await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const candidates = await page.evaluate(() =>
    [...document.querySelectorAll("#the-list tr")]
      .map((row) => ({
        rowId: row.id || "",
        title: row.querySelector(".row-title")?.textContent?.trim() || "",
        editLink: row.querySelector(".row-title")?.href || "",
      }))
      .filter((item) => item.editLink),
  );

  const matches = [];

  for (const candidate of candidates) {
    await page.goto(candidate.editLink, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    const meta = await page.evaluate(
      ({ tmdbSelector, statusSelector }) => ({
        tmdbId: document.querySelector(tmdbSelector)?.value.trim() || "",
        postStatus: document.querySelector(statusSelector)?.value || "",
      }),
      {
        tmdbSelector: DEFAULT_TV_SELECTORS.fetchedTmdbId,
        statusSelector: DEFAULT_TV_SELECTORS.postStatus,
      },
    );

    if (meta.tmdbId === String(tmdbId)) {
      matches.push({
        ...candidate,
        ...meta,
      });
    }
  }

  const preferredMatch =
    matches.find((candidate) => candidate.postStatus === "publish") ||
    matches[0] ||
    null;

  return preferredMatch;
}

async function touchLinkedTvShow(
  page,
  { seriesTitle, tmdbId, navigationTimeout, linkedTvDateMode = "publish-now" },
) {
  if (!seriesTitle || !tmdbId) {
    return {
      updated: false,
      reason: "Series title atau tmdbId tidak tersedia.",
    };
  }

  const match = await findMatchingTvPost(page, {
    seriesTitle,
    tmdbId,
  });

  if (!match) {
    return {
      updated: false,
      reason: "TV Show terkait tidak ditemukan.",
    };
  }

  if (match.postStatus === "publish" && linkedTvDateMode === "publish-now") {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");

    await page.evaluate(
      ({ aa, mm, jj, hh, mn }) => {
        const assign = (selector, value) => {
          const input = document.querySelector(selector);

          if (!input) {
            return;
          }

          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };

        assign("#aa", aa);
        assign("#mm", mm);
        assign("#jj", jj);
        assign("#hh", hh);
        assign("#mn", mn);
      },
      {
        aa: String(now.getFullYear()),
        mm: pad(now.getMonth() + 1),
        jj: pad(now.getDate()),
        hh: "00",
        mn: "01",
      },
    );
  }

  const submitSelector =
    match.postStatus === "publish"
      ? DEFAULT_TV_SELECTORS.publish
      : DEFAULT_TV_SELECTORS.saveDraft;

  await clickAttachedElement(page, submitSelector, navigationTimeout);
  await page.waitForSelector(DEFAULT_TV_SELECTORS.successNotice, {
    timeout: navigationTimeout,
  });

  return {
    updated: true,
    editLink: match.editLink,
    title: match.title,
    postStatus: match.postStatus,
  };
}

async function runWordpressAutomation(payload) {
  return runWithWordpressPage(
    payload,
    async ({
      page,
      executionLog,
      payload: normalizedPayload,
      navigationTimeout,
      actionDelayMs,
    }) => {
      const { beforeSubmit, fields, submit, success } = normalizedPayload;

      if (beforeSubmit?.clickSelectors?.length) {
        for (const selector of beforeSubmit.clickSelectors) {
          await page.locator(selector).click();
          executionLog.push(`Click before submit: ${selector}`);
        }
      }

      for (const field of fields) {
        await fillField(page, field);
        executionLog.push(
          `Field ${field.selector} diproses dengan tipe ${field.type || "fill"}.`,
        );

        if (actionDelayMs > 0) {
          await page.waitForTimeout(actionDelayMs);
        }
      }

      if (submit?.selector) {
        await page
          .locator(submit.selector)
          .click({ timeout: navigationTimeout });
        executionLog.push(`Submit form: ${submit.selector}`);

        if (submit.waitForNavigation) {
          await page.waitForLoadState("networkidle", {
            timeout: navigationTimeout,
          });
        }
      }

      if (success?.selector) {
        await page.waitForSelector(success.selector, {
          timeout: success.timeout || navigationTimeout,
        });
        executionLog.push(`Success selector ditemukan: ${success.selector}`);
      }
    },
  );
}

async function runEpisodeAutomation(payload) {
  assertEpisodePayload(payload);

  return runWithWordpressPage(
    payload,
    async ({
      page,
      executionLog,
      payload: normalizedPayload,
      navigationTimeout,
    }) => {
      const {
        tmdbId,
        seasonNumber,
        episodeNumber,
        embedCode,
        serverNumber = 1,
        serverTitle,
        downloadNumber = 1,
        downloadTitle,
        downloadUrl,
        dryRun = false,
        touchLinkedTvShowAfterSave = false,
        submitAction = "save",
      } = normalizedPayload;

      const playerTitleSelector = `${DEFAULT_EPISODE_SELECTORS.playerTitlePrefix}${serverNumber}`;
      const playerEmbedSelector = `${DEFAULT_EPISODE_SELECTORS.playerEmbedPrefix}${serverNumber}`;
      const downloadTitleSelector = `${DEFAULT_EPISODE_SELECTORS.downloadTitlePrefix}${downloadNumber}`;
      const downloadUrlSelector = `${DEFAULT_EPISODE_SELECTORS.downloadUrlPrefix}${downloadNumber}`;
      const submitSelector =
        submitAction === "publish"
          ? DEFAULT_EPISODE_SELECTORS.publish
          : DEFAULT_EPISODE_SELECTORS.saveDraft;

      await page.locator(DEFAULT_EPISODE_SELECTORS.tmdbId).fill(String(tmdbId));
      await page
        .locator(DEFAULT_EPISODE_SELECTORS.seasonNumber)
        .fill(String(seasonNumber));
      await page
        .locator(DEFAULT_EPISODE_SELECTORS.episodeNumber)
        .fill(String(episodeNumber));
      executionLog.push(
        `Isi data episode: tmdbId=${tmdbId}, season=${seasonNumber}, episode=${episodeNumber}.`,
      );

      await page.locator(DEFAULT_EPISODE_SELECTORS.fetchButton).click();
      executionLog.push("Klik Ambil Informasi.");

      const resolvedTitles = await waitForEpisodeTitleLoaded(
        page,
        tmdbId,
        navigationTimeout,
      );
      executionLog.push(
        `Informasi episode berhasil dimuat. Judul WordPress: ${resolvedTitles.wpTitle}.`,
      );

      const posterFillResult = await fillPosterIfEmpty(
        page,
        DEFAULT_EPISODE_SELECTORS.posterUrl,
        resolveEpisodePosterUrl,
        normalizedPayload,
      );
      executionLog.push(
        posterFillResult.filled
          ? "Poster episode kosong, diisi dari TMDB fallback."
          : `Poster episode tidak diubah: ${posterFillResult.reason}`,
      );

      await setSeoKeyphrase(page, resolvedTitles.wpTitle);
      executionLog.push("Isi Frasa kunci utama dari judul WordPress.");

      if (serverTitle) {
        await setFieldValue(page, playerTitleSelector, serverTitle);
        executionLog.push(`Isi judul server ${serverNumber}.`);
      }

      await setFieldValue(page, playerEmbedSelector, embedCode);
      executionLog.push(`Isi kode embed untuk server ${serverNumber}.`);

      if (downloadTitle) {
        await setFieldValue(page, downloadTitleSelector, downloadTitle);
        executionLog.push(`Isi judul download ${downloadNumber}.`);
      }

      if (downloadUrl) {
        await setFieldValue(page, downloadUrlSelector, downloadUrl);
        executionLog.push(`Isi URL download ${downloadNumber}.`);
      }

      if (dryRun) {
        executionLog.push("Dry run aktif, submit dilewati.");

        return {
          dryRun: true,
          downloadNumber,
          posterFillResult,
          resolvedTitles,
          serverNumber,
        };
      }

      await clickAttachedElement(page, submitSelector, navigationTimeout);
      executionLog.push(
        submitAction === "publish" ? "Klik Terbitkan." : "Klik Simpan Draf.",
      );

      await page.waitForSelector(DEFAULT_EPISODE_SELECTORS.successNotice, {
        timeout: navigationTimeout,
      });
      executionLog.push("Notifikasi sukses ditemukan.");

      let linkedTvUpdate = {
        updated: false,
        reason: "Tidak dijalankan.",
      };

      if (touchLinkedTvShowAfterSave) {
        linkedTvUpdate = await touchLinkedTvShow(page, {
          seriesTitle: resolvedTitles.seriesTitle,
          tmdbId,
          linkedTvDateMode: normalizedPayload.linkedTvDateMode || "publish-now",
          navigationTimeout,
        });

        if (linkedTvUpdate.updated) {
          executionLog.push(
            `TV Show terkait berhasil di-update: ${linkedTvUpdate.title}.`,
          );
        } else {
          executionLog.push(
            `TV Show terkait tidak di-update: ${linkedTvUpdate.reason}`,
          );
        }
      }

      return {
        downloadNumber,
        linkedTvUpdate,
        posterFillResult,
        resolvedTitles,
        submitAction,
        serverNumber,
      };
    },
  );
}

async function runTvAutomation(payload) {
  const payloadWithDefaultTarget = {
    ...payload,
    targetUrl:
      payload.targetUrl ||
      process.env.WORDPRESS_TV_TARGET_URL ||
      "https://drakorid.fun/wp-admin/post-new.php?post_type=tv",
  };
  assertTvPayload(payloadWithDefaultTarget);

  return runWithWordpressPage(
    payloadWithDefaultTarget,
    async ({
      page,
      executionLog,
      payload: normalizedPayload,
      navigationTimeout,
    }) => {
      const {
        tmdbId,
        dryRun = false,
        submitAction = "save",
      } = normalizedPayload;

      const submitSelector =
        submitAction === "publish"
          ? DEFAULT_TV_SELECTORS.publish
          : DEFAULT_TV_SELECTORS.saveDraft;

      await page.locator(DEFAULT_TV_SELECTORS.tmdbId).fill(String(tmdbId));
      executionLog.push(`Isi data tv: tmdbId=${tmdbId}.`);

      await page.locator(DEFAULT_TV_SELECTORS.fetchButton).click();
      executionLog.push("Klik Ambil Informasi TV.");

      const resolvedTitles = await waitForTvTitleLoaded(
        page,
        tmdbId,
        navigationTimeout,
      );
      executionLog.push(
        `Informasi TV berhasil dimuat. Judul WordPress: ${resolvedTitles.wpTitle}.`,
      );

      const posterFillResult = await fillPosterIfEmpty(
        page,
        DEFAULT_TV_SELECTORS.posterUrl,
        resolveTvPosterUrl,
        normalizedPayload,
      );
      executionLog.push(
        posterFillResult.filled
          ? "Poster TV kosong, diisi dari TMDB fallback."
          : `Poster TV tidak diubah: ${posterFillResult.reason}`,
      );

      await setSeoKeyphraseWithSelectors(
        page,
        resolvedTitles.wpTitle,
        DEFAULT_TV_SELECTORS,
      );
      executionLog.push("Isi Frasa kunci utama dari judul WordPress.");

      if (dryRun) {
        executionLog.push("Dry run aktif, submit dilewati.");

        return {
          dryRun: true,
          posterFillResult,
          resolvedTitles,
        };
      }

      await clickAttachedElement(page, submitSelector, navigationTimeout);
      executionLog.push(
        submitAction === "publish" ? "Klik Terbitkan." : "Klik Simpan Draf.",
      );

      await page.waitForSelector(DEFAULT_TV_SELECTORS.successNotice, {
        timeout: navigationTimeout,
      });
      executionLog.push("Notifikasi sukses ditemukan.");

      return {
        posterFillResult,
        resolvedTitles,
        submitAction,
      };
    },
  );
}

module.exports = {
  runEpisodeAutomation,
  runTvAutomation,
  runWordpressAutomation,
};
