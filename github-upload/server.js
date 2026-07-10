const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const root = __dirname;
const preferredPort = Number(process.env.PORT || 5173);
const env = loadEnv();
const dataDir = path.join(root, ".data");
const dbPath = path.join(dataDir, "libcon-db.json");
let supabaseStatus = isSupabaseConfigured() ? "configured" : "disabled";
let relationalSupabaseWarned = false;
let memoryDb = null;
let dbHydrated = false;
let dbHydrationPromise = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  try {
    if (requestUrl.pathname.startsWith("/api/")) {
      await ensureDbHydrated();
    }

    if (requestUrl.pathname === "/api/config") {
      const googleClientId = getEnv("GOOGLE_CLIENT_ID");
      sendJson(response, 200, {
        kakaoJsKey: getEnv("KAKAO_JS_API_KEY"),
        googleClientId,
        hasKakaoRestKey: Boolean(getEnv("KAKAO_REST_API_KEY")),
        supabaseReady: supabaseStatus === "connected",
        supabaseStatus,
        hasGoogleClientId: Boolean(googleClientId),
        googleOAuthReady: isValidGoogleClientId(googleClientId),
        googleOAuthError: googleClientId && !isValidGoogleClientId(googleClientId)
          ? "INVALID_GOOGLE_CLIENT_ID"
          : "",
        defaultLocation: {
          latitude: 37.566826,
          longitude: 126.9786567,
        },
      });
      return;
    }

    if (requestUrl.pathname === "/api/auth/google/start") {
      handleGoogleStart(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/auth/google/callback") {
      await handleGoogleCallback(request, requestUrl, response);
      return;
    }

    if (requestUrl.pathname === "/api/auth/me") {
      handleAuthMe(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/auth/login" && request.method === "POST") {
      await handleAuthLogin(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/auth/refresh" && request.method === "POST") {
      await handleAuthRefresh(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/auth/logout" && request.method === "POST") {
      handleAuthLogout(response);
      return;
    }

    if (requestUrl.pathname === "/api/users/me") {
      handleUserMe(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/users/check-nickname") {
      handleCheckNickname(requestUrl, response);
      return;
    }

    if (requestUrl.pathname === "/api/users/profile" && request.method === "POST") {
      await handleUserProfile(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/users/faction" && request.method === "POST") {
      await handleUserFaction(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/users/me/books") {
      handleUserBooks(request, requestUrl, response);
      return;
    }

    if (requestUrl.pathname === "/api/users/me/sessions") {
      handleUserSessions(request, requestUrl, response);
      return;
    }

    if (requestUrl.pathname === "/api/users/me/libraries") {
      handleUserLibraries(request, requestUrl, response);
      return;
    }

    if (requestUrl.pathname === "/api/factions") {
      if (request.method === "GET") {
        handleFactions(response);
        return;
      }
      if (request.method === "POST") {
        await handleCreateFaction(request, response);
        return;
      }
    }

    if (requestUrl.pathname === "/api/libraries") {
      await handleLibraries(requestUrl, response);
      return;
    }

    const libraryDetailMatch = requestUrl.pathname.match(/^\/api\/libraries\/([^/]+)$/);
    if (libraryDetailMatch) {
      handleLibraryDetail(libraryDetailMatch[1], response);
      return;
    }

    const bookMatch = requestUrl.pathname.match(/^\/api\/books\/isbn\/([^/]+)$/);
    if (bookMatch) {
      await handleBookByIsbn(bookMatch[1], response);
      return;
    }

    if (requestUrl.pathname === "/api/sessions/start" && request.method === "POST") {
      await handleSessionStart(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/sessions/ping" && request.method === "POST") {
      await handleSessionPing(request, response);
      return;
    }

    const submitMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/submit$/);
    if (submitMatch && request.method === "POST") {
      await handleSessionSubmit(submitMatch[1], request, response);
      return;
    }

    const completeMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/complete$/);
    if (completeMatch && request.method === "POST") {
      handleSessionComplete(completeMatch[1], request, response);
      return;
    }

    const testAddMinutesMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/test-add-minutes$/);
    if (testAddMinutesMatch && request.method === "POST") {
      await handleSessionTestAddMinutes(testAddMinutesMatch[1], request, response);
      return;
    }

    const cancelMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/cancel$/);
    if (cancelMatch && request.method === "POST") {
      handleSessionCancel(cancelMatch[1], request, response);
      return;
    }

    if (requestUrl.pathname === "/api/verify/llm" && request.method === "POST") {
      await handleVerifyLlm(request, response);
      return;
    }

    const verifyMatch = requestUrl.pathname.match(/^\/api\/verify\/([^/]+)$/);
    if (verifyMatch) {
      handleVerifyResult(verifyMatch[1], request, response);
      return;
    }

    if (requestUrl.pathname === "/api/ranking/users") {
      handleUserRanking(requestUrl, response);
      return;
    }

    if (requestUrl.pathname === "/api/ranking/factions") {
      handleFactionRanking(requestUrl, response);
      return;
    }

    serveStatic(requestUrl.pathname, response);
  } catch (error) {
    const isTimeout = error?.name === "AbortError";
    sendJson(response, isTimeout ? 504 : 500, {
      message: isTimeout ? "카카오 API 응답 시간이 초과되었습니다." : error.message || "서버 오류가 발생했습니다.",
    });
  }
}

let server = null;
if (require.main === module) {
  server = http.createServer(handleRequest);
  hydrateDbFromSupabase()
    .catch((error) => {
      console.warn(`Supabase hydrate skipped: ${error.message}`);
    })
    .finally(() => startServer(preferredPort));
}

function startServer(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port !== 5174) {
      console.log(`Port ${port} is already in use. Trying http://localhost:5174`);
      startServer(5174);
      return;
    }
    throw error;
  });

  server.listen(port, () => {
    console.log(`LIBCON frontend server running at http://localhost:${port}`);
  });
}

function handleGoogleStart(request, response) {
  const clientId = getEnv("GOOGLE_CLIENT_ID");
  const redirectUri = googleRedirectUri(request);

  if (!clientId) {
    sendHtml(response, 503, setupPage("GOOGLE_CLIENT_ID가 설정되지 않았습니다."));
    return;
  }

  if (!isValidGoogleClientId(clientId)) {
    sendHtml(response, 503, setupPage(
      "GOOGLE_CLIENT_ID 형식이 올바르지 않습니다. Google Cloud Console의 OAuth 2.0 웹 애플리케이션 클라이언트 ID를 입력해 주세요.",
    ));
    return;
  }

  const state = createOAuthState();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  response.writeHead(302, {
    Location: authUrl.toString(),
    "Set-Cookie": cookie("google_oauth_state", state, {
      maxAge: 600,
      httpOnly: true,
      secure: isHttpsRequest(request),
    }),
  });
  response.end();
}

async function handleGoogleCallback(request, requestUrl, response) {
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const state = requestUrl.searchParams.get("state");
  const cookies = parseCookies(request.headers.cookie || "");

  if (error) {
    sendHtml(response, 400, setupPage(`Google 로그인 실패: ${escapeHtml(error)}`));
    return;
  }

  const hasValidState = Boolean(state) && (
    state === cookies.google_oauth_state
    || verifyOAuthState(state)
  );
  if (!hasValidState) {
    sendHtml(response, 400, setupPage("Google 로그인 요청 상태가 일치하지 않습니다. 다시 시도해 주세요."));
    return;
  }

  if (!code) {
    sendHtml(response, 400, setupPage("Google 인증 코드가 없습니다."));
    return;
  }

  const clientId = getEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = googleRedirectUriFromHost(requestUrl.host);

  if (!clientId || !clientSecret) {
    sendHtml(response, 503, setupPage("GOOGLE_CLIENT_ID 또는 GOOGLE_CLIENT_SECRET이 설정되지 않았습니다."));
    return;
  }

  const tokenResponse = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  }, 10000);

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    sendHtml(response, tokenResponse.status, setupPage(tokenPayload.error_description || "Google 토큰 교환에 실패했습니다."));
    return;
  }

  const userResponse = await fetchWithTimeout("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
  }, 10000);
  const user = await userResponse.json().catch(() => ({}));

  if (!userResponse.ok || !user.email) {
    sendHtml(response, userResponse.status || 500, setupPage("Google 사용자 정보를 불러오지 못했습니다."));
    return;
  }

  const sessionUser = {
    provider: "google",
    socialId: user.sub,
    name: user.name || "",
    email: user.email,
    picture: user.picture || "",
  };
  const db = readDb();
  const localUser = upsertUser(db, sessionUser, { write: true });
  const accessToken = createJwt(localUser.userId);
  const refreshToken = createJwt(localUser.userId, "refresh");
  const tokenHash = new URLSearchParams({
    accessToken,
    refreshToken,
  }).toString();

  response.writeHead(302, {
    Location: `/?auth=success#${tokenHash}`,
    "Set-Cookie": [
      cookie("libcon_user", Buffer.from(JSON.stringify(sessionUser), "utf8").toString("base64url"), {
        maxAge: 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: isHttpsRequest(request),
      }),
      cookie("google_oauth_state", "", {
        maxAge: 0,
        httpOnly: true,
        secure: isHttpsRequest(request),
      }),
    ],
  });
  response.end();
}

function handleAuthMe(request, response) {
  const user = getSessionUser(request);
  if (!user) {
    sendJson(response, 200, { user: null });
    return;
  }

  sendJson(response, 200, { user });
}

async function handleAuthLogin(request, response) {
  const body = await readJsonBody(request);
  const googleUser = body.idToken
    ? await verifyGoogleIdToken(body.idToken).catch(() => null)
    : null;
  if (body.idToken && !googleUser) {
    sendJson(response, 401, { code: "INVALID_GOOGLE_ID_TOKEN", message: "Google ID Token 검증에 실패했습니다." });
    return;
  }
  const socialId = googleUser?.sub || body.socialId || `local-${Date.now()}`;
  const db = readDb();
  const user = upsertUser(db, {
    provider: "google",
    socialId,
    name: googleUser?.name || body.name || "Google User",
    email: googleUser?.email || body.email || `${String(socialId).slice(0, 12)}@local.test`,
    picture: googleUser?.picture || body.picture || "",
  });
  writeDb(db);
  sendJson(response, 200, {
    accessToken: createJwt(user.userId),
    refreshToken: createJwt(user.userId, "refresh"),
    isNewUser: !user.onboardingCompleted,
    onboardingCompleted: Boolean(user.onboardingCompleted),
  });
}

async function handleAuthRefresh(request, response) {
  const body = await readJsonBody(request);
  const userId = readUserIdFromToken(body.refreshToken);
  if (!userId) {
    sendJson(response, 401, { code: "UNAUTHORIZED", message: "Refresh Token이 유효하지 않습니다." });
    return;
  }
  sendJson(response, 200, { accessToken: createJwt(userId) });
}

function handleAuthLogout(response) {
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Set-Cookie": cookie("libcon_user", "", { maxAge: 0, httpOnly: true }),
  });
  response.end(JSON.stringify({ message: "로그아웃 완료" }));
}

function handleUserMe(request, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  sendJson(response, 200, serializeUser(user, db));
}

function handleCheckNickname(requestUrl, response) {
  const nickname = normalizeNickname(requestUrl.searchParams.get("nickname"));
  const validation = validateNickname(nickname);
  if (!validation.valid) {
    sendJson(response, 200, { nickname, available: false, message: validation.message });
    return;
  }

  const db = readDb();
  const exists = db.users.some((user) => user.nickname === nickname);
  sendJson(response, 200, {
    nickname,
    available: !exists,
    message: exists ? "이미 사용 중인 닉네임입니다." : "사용 가능한 닉네임입니다.",
  });
}

async function handleUserProfile(request, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;

  const body = await readJsonBody(request);
  const nickname = normalizeNickname(body.nickname);
  const validation = validateNickname(nickname);
  if (!validation.valid) {
    sendJson(response, 400, { code: "INVALID_NICKNAME", message: validation.message });
    return;
  }
  if (db.users.some((item) => item.userId !== user.userId && item.nickname === nickname)) {
    sendJson(response, 409, { code: "DUPLICATE_NICKNAME", message: "이미 사용 중인 닉네임입니다." });
    return;
  }
  const faction = db.factions.find((item) => String(item.factionId) === String(body.factionId));
  if (!faction) {
    sendJson(response, 404, { code: "FACTION_NOT_FOUND", message: "진영을 찾을 수 없습니다." });
    return;
  }

  user.nickname = nickname;
  user.factionId = faction.factionId;
  user.onboardingCompleted = true;
  user.updatedAt = new Date().toISOString();
  writeDb(db);
  sendJson(response, 200, { message: "프로필 등록 완료", onboardingCompleted: true });
}

async function handleUserFaction(request, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;

  const body = await readJsonBody(request);
  const faction = db.factions.find((item) => String(item.factionId) === String(body.factionId));
  if (!faction) {
    sendJson(response, 404, { code: "FACTION_NOT_FOUND", message: "진영을 찾을 수 없습니다." });
    return;
  }

  user.factionId = faction.factionId;
  user.onboardingCompleted = true;
  user.updatedAt = new Date().toISOString();
  writeDb(db);
  sendJson(response, 200, {
    message: "진영 선택 완료",
    faction: {
      factionId: faction.factionId,
      name: faction.name,
      color: faction.color,
    },
  });
}

function handleUserBooks(request, requestUrl, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  const sessions = db.readingSessions.filter((session) => session.userId === user.userId && session.status === "VERIFICATION_PASSED");
  const rows = sessions.map((session) => {
    const book = db.books.find((item) => item.bookId === session.bookId) || {};
    const verification = db.aiVerifications.find((item) => item.sessionId === session.sessionId) || {};
    return {
      bookId: book.bookId,
      title: book.title,
      author: book.author,
      publisher: book.publisher,
      coverImageUrl: book.coverImageUrl,
      minutes: session.durationMinutes,
      review: verification.reviewText || "",
      library: libraryName(db, session.libraryId),
      pages: `p.${session.startPage}-${session.endPage}`,
      date: session.completedAt || session.createdAt,
    };
  });
  sendJson(response, 200, paginateRows(rows, requestUrl));
}

function handleUserSessions(request, requestUrl, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  const rows = db.readingSessions
    .filter((session) => session.userId === user.userId)
    .filter((session) => session.status === "VERIFICATION_PASSED")
    .sort((a, b) => String(b.completedAt || b.createdAt).localeCompare(String(a.completedAt || a.createdAt)))
    .map((session) => ({
      ...session,
      book: db.books.find((book) => book.bookId === session.bookId) || null,
      library: db.libraries.find((library) => String(library.libraryId) === String(session.libraryId)) || null,
    }));
  sendJson(response, 200, paginateRows(rows, requestUrl));
}

function handleUserLibraries(request, requestUrl, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  const logs = db.influenceLogs.filter((log) => log.userId === user.userId);
  const rows = logs.map((log) => ({
    ...log,
    library: db.libraries.find((library) => String(library.libraryId) === String(log.libraryId)) || null,
    faction: db.factions.find((faction) => faction.factionId === log.factionId) || null,
  }));
  sendJson(response, 200, paginateRows(rows, requestUrl));
}

function handleFactions(response) {
  const db = readDb();
  sendJson(response, 200, db.factions.map((faction) => ({
    factionId: faction.factionId,
    id: faction.factionId,
    name: faction.name,
    color: faction.color,
    joinType: faction.joinType,
    description: faction.description,
    desc: faction.description,
    memberCount: db.users.filter((user) => user.factionId === faction.factionId).length,
  })));
}

async function handleCreateFaction(request, response) {
  const db = readDb();
  const user = getSessionUser(request);
  const body = await readJsonBody(request);
  const name = String(body.name || "").trim().slice(0, 24);
  if (!name) {
    sendJson(response, 400, { code: "INVALID_FACTION_NAME", message: "진영 이름이 필요합니다." });
    return;
  }
  const faction = {
    factionId: nextId(db, "factionId"),
    name,
    color: safeHexColor(body.color),
    joinType: body.joinType === "APPROVAL" || body.joinType === "승인 가입" ? "APPROVAL" : "FREE",
    description: String(body.description || body.desc || "").trim().slice(0, 120),
    createdByUserId: user?.userId || null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.factions.push(faction);
  let joined = false;
  if (user) {
    const dbUser = db.users.find((item) => item.userId === user.userId);
    if (dbUser) {
      dbUser.factionId = faction.factionId;
      dbUser.onboardingCompleted = Boolean(dbUser.nickname);
      dbUser.updatedAt = new Date().toISOString();
      joined = true;
    }
  }
  writeDb(db);
  sendJson(response, 201, {
    factionId: faction.factionId,
    faction: {
      factionId: faction.factionId,
      name: faction.name,
      color: faction.color,
    },
    joined,
    message: joined ? "진영 생성 및 가입 완료" : "진영 생성 완료",
  });
}

async function handleLibraries(requestUrl, response) {
  const kakaoRestKey = getEnv("KAKAO_REST_API_KEY");
  const libraryApiKey = getEnv("LIBRARY_API_KEY");

  const latitude = Number(requestUrl.searchParams.get("lat"));
  const longitude = Number(requestUrl.searchParams.get("lng"));
  const radiusParam = String(requestUrl.searchParams.get("radius") || "all").toLowerCase();
  const allDistances = radiusParam === "all" || radiusParam === "전체" || Number(radiusParam) <= 0;
  const radius = allDistances ? Infinity : clampNumber(Number(radiusParam || 5000), 100, 20000);
  const rawQuery = String(requestUrl.searchParams.get("query") || "").trim();
  const query = normalizeLibraryQuery(rawQuery);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    sendJson(response, 400, {
      message: "lat, lng 쿼리 파라미터가 필요합니다.",
    });
    return;
  }

  if (!kakaoRestKey && !libraryApiKey) {
    sendJson(response, 503, {
      message: "KAKAO_REST_API_KEY 또는 LIBRARY_API_KEY가 설정되어야 합니다.",
    });
    return;
  }

  const [kakaoResult, data4LibraryResult] = await Promise.allSettled([
    kakaoRestKey
      ? fetchKakaoLibraries({ kakaoRestKey, query, latitude, longitude, radius })
      : Promise.resolve([]),
    libraryApiKey
      ? fetchLibrariesFromData4Library({ query, latitude, longitude, radius })
      : Promise.resolve([]),
  ]);

  if (kakaoResult.status === "rejected" && data4LibraryResult.status === "rejected") {
    sendJson(response, 502, {
      code: "LIBRARY_SEARCH_FAILED",
      message: "도서관 검색 API 호출에 실패했습니다.",
      details: [kakaoResult.reason?.message, data4LibraryResult.reason?.message].filter(Boolean),
    });
    return;
  }

  const libraries = rankLibrariesForQuery(mergeLibraries(
    kakaoResult.status === "fulfilled" ? kakaoResult.value : [],
    data4LibraryResult.status === "fulfilled" ? data4LibraryResult.value : [],
  ), rawQuery);

  const db = readDb();
  libraries.forEach((library) => upsertLibrary(db, library));
  writeDb(db);

  sendJson(response, 200, {
    source: libraries.some((library) => library.source === "data4library-libSrch")
      ? "kakao-local+data4library-libSrch"
      : "kakao-local",
    center: { latitude, longitude },
    radius: allDistances ? "all" : radius,
    query,
    total: libraries.length,
    libraries: libraries.map((library) => {
      const stored = db.libraries.find((item) => item.libraryId === library.libraryId);
      return stored ? { ...library, ...serializeLibraryDetail(db, stored) } : library;
    }),
  });
}

function handleLibraryDetail(libraryId, response) {
  const db = readDb();
  const library = db.libraries.find((item) => String(item.libraryId) === String(libraryId) || String(item.externalLibraryCode) === String(libraryId));
  if (!library) {
    sendJson(response, 404, { code: "LIBRARY_NOT_FOUND", message: "도서관을 찾을 수 없습니다." });
    return;
  }
  sendJson(response, 200, serializeLibraryDetail(db, library));
}

async function handleBookByIsbn(isbn, response) {
  const cleanIsbn = String(isbn || "").replace(/[^0-9Xx]/g, "");
  if (!cleanIsbn) {
    sendJson(response, 400, { code: "INVALID_ISBN", message: "ISBN이 필요합니다." });
    return;
  }
  const db = readDb();
  let book = db.books.find((item) => item.isbn === cleanIsbn);
  if (!book) {
    book = await fetchBookFromLibraryApi(cleanIsbn).catch(() => null);
    if (!book) {
      book = {
        isbn: cleanIsbn,
        title: `ISBN ${cleanIsbn}`,
        author: "저자 미확인",
        publisher: "출판사 미확인",
        coverImageUrl: "",
        totalPages: 0,
        description: "외부 도서 API에서 상세 정보를 찾지 못했습니다.",
        externalSource: "manual",
      };
    }
    book.bookId = nextId(db, "bookId");
    book.createdAt = new Date().toISOString();
    book.updatedAt = new Date().toISOString();
    db.books.push(book);
    writeDb(db);
  }
  sendJson(response, 200, serializeBook(book));
}

async function handleSessionStart(request, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  const body = await readJsonBody(request);
  const library = db.libraries.find((item) => String(item.libraryId) === String(body.libraryId) || String(item.externalLibraryCode) === String(body.libraryId));
  if (!library) {
    sendJson(response, 404, { code: "LIBRARY_NOT_FOUND", message: "도서관을 찾을 수 없습니다." });
    return;
  }
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const distance = distanceMeters(latitude, longitude, library.latitude, library.longitude);
  if (!Number.isFinite(distance) || distance > 250) {
    sendJson(response, 400, { code: "OUT_OF_CHECKIN_RANGE", message: "도서관 반경 250m 이내에서만 독서를 시작할 수 있습니다." });
    return;
  }
  let book = db.books.find((item) => item.isbn === String(body.isbn || "").replace(/[^0-9Xx]/g, ""));
  if (!book) {
    const fakeResponse = createMemoryResponse();
    await handleBookByIsbn(body.isbn, fakeResponse);
    const refreshedDb = readDb();
    Object.assign(db, refreshedDb);
    book = db.books.find((item) => item.isbn === String(body.isbn || "").replace(/[^0-9Xx]/g, ""));
  }
  const now = new Date().toISOString();
  const session = {
    sessionId: nextId(db, "sessionId"),
    userId: user.userId,
    factionId: user.factionId || null,
    libraryId: library.libraryId,
    bookId: book?.bookId || null,
    startTime: now,
    endTime: null,
    durationMinutes: 0,
    startPage: null,
    endPage: null,
    isMinimumTimeMet: false,
    isLocationValid: true,
    status: "IN_PROGRESS",
    failReason: "",
    submittedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.readingSessions.push(session);
  db.locationLogs.push(createLocationLog(db, session, latitude, longitude, distance, Number(body.accuracyMeters || 0)));
  writeDb(db);
  sendJson(response, 201, {
    sessionId: session.sessionId,
    bookId: session.bookId,
    startTime: session.startTime,
    status: session.status,
  });
}

async function handleSessionPing(request, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  const body = await readJsonBody(request);
  const session = db.readingSessions.find((item) => String(item.sessionId) === String(body.sessionId) && item.userId === user.userId);
  if (!session) {
    sendJson(response, 404, { code: "SESSION_NOT_FOUND", message: "독서 세션을 찾을 수 없습니다." });
    return;
  }
  const library = db.libraries.find((item) => item.libraryId === session.libraryId);
  const distance = distanceMeters(Number(body.latitude), Number(body.longitude), library?.latitude, library?.longitude);
  const log = createLocationLog(db, session, Number(body.latitude), Number(body.longitude), distance, Number(body.accuracyMeters || 0));
  db.locationLogs.push(log);
  if (log.isOutOfRange) session.isLocationValid = false;
  const elapsed = Math.floor((Date.now() - new Date(session.startTime).getTime()) / 60000);
  session.durationMinutes = Math.max(session.durationMinutes, elapsed);
  if (session.durationMinutes >= 20 && session.status === "IN_PROGRESS") {
    session.status = "READY_TO_VERIFY";
    session.isMinimumTimeMet = true;
  }
  session.updatedAt = new Date().toISOString();
  writeDb(db);
  sendJson(response, 200, {
    sessionId: session.sessionId,
    distanceFromLibrary: Math.round(distance),
    isOutOfRange: log.isOutOfRange,
    status: log.status,
  });
}

async function handleSessionSubmit(sessionId, request, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  const session = db.readingSessions.find((item) => String(item.sessionId) === String(sessionId) && item.userId === user.userId);
  if (!session) {
    sendJson(response, 404, { code: "SESSION_NOT_FOUND", message: "독서 세션을 찾을 수 없습니다." });
    return;
  }
  const body = await readJsonBody(request);
  const startPage = Number(body.startPage);
  const endPage = Number(body.endPage);
  if (!Number.isInteger(startPage) || !Number.isInteger(endPage) || startPage <= 0 || endPage < startPage) {
    sendJson(response, 400, { code: "INVALID_PAGES", message: "시작 페이지와 종료 페이지를 확인해 주세요." });
    return;
  }
  const now = new Date().toISOString();
  session.startPage = startPage;
  session.endPage = endPage;
  session.endTime = now;
  session.durationMinutes = Math.max(session.durationMinutes, Math.floor((Date.now() - new Date(session.startTime).getTime()) / 60000));
  session.isMinimumTimeMet = session.durationMinutes >= 20;
  session.status = "SUBMITTED";
  session.submittedAt = now;
  session.updatedAt = now;
  const verification = ensureVerification(db, session);
  verification.submittedCoverImageUrl = String(body.submittedCoverImageUrl || "");
  verification.reviewText = String(body.reviewText || "").trim();
  verification.pageValidationPassed = validatePageSpeed(session);
  verification.locationValidationPassed = Boolean(session.isLocationValid);
  writeDb(db);
  sendJson(response, 200, { sessionId: session.sessionId, status: session.status, message: "인증 정보가 제출되었습니다." });
}

async function handleVerifyLlm(request, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  const body = await readJsonBody(request);
  const session = db.readingSessions.find((item) => String(item.sessionId) === String(body.sessionId) && item.userId === user.userId);
  if (!session) {
    sendJson(response, 404, { code: "SESSION_NOT_FOUND", message: "독서 세션을 찾을 수 없습니다." });
    return;
  }
  const verification = ensureVerification(db, session);
  verification.reviewText = String(body.reviewText || verification.reviewText || "").trim();
  const book = db.books.find((item) => item.bookId === session.bookId) || {};
  const aiResult = await geminiVerifyReview(book, verification.reviewText).catch(() => null);
  const localResult = validateReviewLocally(book, verification.reviewText);
  verification.llmConfidence = aiResult?.confidence ?? localResult.confidence;
  verification.llmPassed = Boolean(aiResult ? aiResult.passed && localResult.passed : localResult.passed);
  verification.verifiedAt = new Date().toISOString();
  writeDb(db);
  sendJson(response, 200, {
    sessionId: session.sessionId,
    llmPassed: verification.llmPassed,
    llmConfidence: verification.llmConfidence,
    message: verification.llmPassed ? "감상평이 제출 기준을 충족합니다." : localResult.reason,
  });
}

function handleVerifyResult(sessionId, request, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  const session = db.readingSessions.find((item) => String(item.sessionId) === String(sessionId) && item.userId === user.userId);
  if (!session) {
    sendJson(response, 404, { code: "SESSION_NOT_FOUND", message: "독서 세션을 찾을 수 없습니다." });
    return;
  }
  const verification = ensureVerification(db, session);
  finalizeVerification(session, verification);
  writeDb(db);
  sendJson(response, 200, serializeVerification(session, verification));
}

function handleSessionComplete(sessionId, request, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  const session = db.readingSessions.find((item) => String(item.sessionId) === String(sessionId) && item.userId === user.userId);
  if (!session) {
    sendJson(response, 404, { code: "SESSION_NOT_FOUND", message: "독서 세션을 찾을 수 없습니다." });
    return;
  }
  const verification = ensureVerification(db, session);
  finalizeVerification(session, verification);
  if (!verification.isPassed) {
    session.status = "VERIFICATION_FAILED";
    session.failReason = verification.failReason;
    writeDb(db);
    sendJson(response, 200, {
      sessionId: session.sessionId,
      status: session.status,
      reward: { exp: 0, influence: 0 },
      failReason: verification.failReason,
    });
    return;
  }
  const reward = applyReward(db, session);
  writeDb(db);
  sendJson(response, 200, {
    sessionId: session.sessionId,
    status: "VERIFICATION_PASSED",
    reward: { exp: reward.exp, influence: reward.influence },
    occupation: reward.occupation,
    ranking: { userRank: userRankPosition(db, session.userId) },
  });
}

async function handleSessionTestAddMinutes(sessionId, request, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  const session = db.readingSessions.find((item) => String(item.sessionId) === String(sessionId) && item.userId === user.userId);
  if (!session) {
    sendJson(response, 404, { code: "SESSION_NOT_FOUND", message: "독서 세션을 찾을 수 없습니다." });
    return;
  }
  if (!["IN_PROGRESS", "READY_TO_VERIFY"].includes(session.status)) {
    sendJson(response, 400, { code: "SESSION_NOT_ACTIVE", message: "진행 중인 독서 세션에만 테스트 시간을 추가할 수 있습니다." });
    return;
  }
  const body = await readJsonBody(request);
  const minutes = clampNumber(Number(body.minutes || 10), 1, 60);
  const previousStartTime = new Date(session.startTime).getTime();
  const safeStartTime = Number.isFinite(previousStartTime) ? previousStartTime : Date.now();
  session.startTime = new Date(safeStartTime - minutes * 60 * 1000).toISOString();
  const elapsed = Math.floor((Date.now() - new Date(session.startTime).getTime()) / 60000);
  session.durationMinutes = Math.max(session.durationMinutes || 0, elapsed);
  if (session.durationMinutes >= 20) {
    session.status = "READY_TO_VERIFY";
    session.isMinimumTimeMet = true;
  }
  session.updatedAt = new Date().toISOString();
  writeDb(db);
  sendJson(response, 200, {
    sessionId: session.sessionId,
    startTime: session.startTime,
    durationMinutes: session.durationMinutes,
    status: session.status,
    isMinimumTimeMet: session.isMinimumTimeMet,
  });
}

function handleSessionCancel(sessionId, request, response) {
  const db = readDb();
  const user = requireUser(request, response, db);
  if (!user) return;
  const session = db.readingSessions.find((item) => String(item.sessionId) === String(sessionId) && item.userId === user.userId);
  if (!session) {
    sendJson(response, 404, { code: "SESSION_NOT_FOUND", message: "독서 세션을 찾을 수 없습니다." });
    return;
  }
  if (session.status === "VERIFICATION_PASSED") {
    sendJson(response, 409, { code: "SESSION_ALREADY_COMPLETED", message: "이미 완료된 세션은 취소할 수 없습니다." });
    return;
  }
  session.status = "CANCELED";
  session.failReason = "사용자가 독서 세션을 취소했습니다.";
  session.endTime = new Date().toISOString();
  session.updatedAt = session.endTime;
  writeDb(db);
  sendJson(response, 200, { sessionId: session.sessionId, status: session.status, message: "독서 세션이 취소되었습니다." });
}

async function verifyGoogleIdToken(idToken) {
  const url = new URL("https://oauth2.googleapis.com/tokeninfo");
  url.searchParams.set("id_token", idToken);
  const response = await fetchWithTimeout(url, {}, 8000);
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  if (!payload) return null;
  if (payload.aud !== getEnv("GOOGLE_CLIENT_ID")) return null;
  return payload;
}

function handleUserRanking(requestUrl, response) {
  const db = readDb();
  const rows = db.users
    .map((user, index) => ({
      rankingId: index + 1,
      userId: user.userId,
      name: user.nickname || user.name || "독서가",
      factionId: user.factionId || null,
      factionName: db.factions.find((faction) => faction.factionId === user.factionId)?.name || "",
      exp: user.exp || 0,
      booksRead: db.readingSessions.filter((session) => session.userId === user.userId && session.status === "VERIFICATION_PASSED").length,
      totalSessions: db.readingSessions.filter((session) => session.userId === user.userId).length,
    }))
    .sort((a, b) => b.exp - a.exp)
    .map((row, index) => ({ ...row, rank: index + 1, rankingId: index + 1 }));
  db.userRankings = rows;
  writeDb(db);
  sendJson(response, 200, paginateRows(rows, requestUrl));
}

function handleFactionRanking(requestUrl, response) {
  const db = readDb();
  const rows = db.factions
    .map((faction) => {
      const influences = db.libraryInfluences.filter((item) => item.factionId === faction.factionId);
      return {
        factionId: faction.factionId,
        name: faction.name,
        color: faction.color,
        desc: faction.description,
        occupiedLibraries: db.libraries.filter((library) => library.currentOccupiedFactionId === faction.factionId).length,
        totalInfluence: influences.reduce((sum, item) => sum + item.influenceScore, 0),
        memberCount: db.users.filter((user) => user.factionId === faction.factionId).length,
      };
    })
    .sort((a, b) => b.occupiedLibraries - a.occupiedLibraries || b.totalInfluence - a.totalInfluence)
    .map((row, index) => ({ ...row, rank: index + 1, rankingId: index + 1 }));
  db.factionRankings = rows;
  writeDb(db);
  sendJson(response, 200, paginateRows(rows, requestUrl));
}

function normalizeLibraryQuery(value) {
  const query = String(value || "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!query) return "도서관";
  return query.includes("도서관") || query.toLowerCase().includes("library")
    ? query
    : `${query} 도서관`;
}

async function fetchKakaoLibraries({ kakaoRestKey, query, latitude, longitude, radius }) {
  const kakaoUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  kakaoUrl.searchParams.set("query", query);
  kakaoUrl.searchParams.set("x", String(longitude));
  kakaoUrl.searchParams.set("y", String(latitude));
  if (Number.isFinite(radius)) {
    kakaoUrl.searchParams.set("radius", String(radius));
  }
  kakaoUrl.searchParams.set("sort", "distance");
  kakaoUrl.searchParams.set("size", "15");

  const kakaoResponse = await fetchWithTimeout(kakaoUrl, {
    headers: {
      Authorization: `KakaoAK ${kakaoRestKey}`,
    },
  }, 8000);
  const payload = await kakaoResponse.json().catch(() => ({}));
  if (!kakaoResponse.ok) {
    const upstreamMessage = payload.msg || payload.message || "";
    const error = new Error(upstreamMessage || "카카오 로컬 API 호출에 실패했습니다.");
    error.code = upstreamMessage.includes("OPEN_MAP_AND_LOCAL")
      ? "KAKAO_MAP_SERVICE_DISABLED"
      : "KAKAO_LOCAL_API_ERROR";
    throw error;
  }
  return (payload.documents || [])
    .filter((place) => isLibraryPlace(place))
    .map((place) => normalizeKakaoLibrary(place));
}

async function fetchLibrariesFromData4Library({ query, latitude, longitude, radius }) {
  const apiKey = getEnv("LIBRARY_API_KEY");
  if (!apiKey) return [];
  const url = new URL("http://data4library.kr/api/libSrch");
  url.searchParams.set("authKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("pageSize", "100");
  const libName = query.replace(/도서관/g, "").trim();
  if (libName) url.searchParams.set("libName", libName);

  const response = await fetchWithTimeout(url, {}, 10000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.response?.error || payload?.message || `정보나루 libSrch 호출 실패: ${response.status}`);
  }
  const rows = normalizeData4LibraryRows(payload)
    .map((row) => normalizeData4LibraryLibrary(row, latitude, longitude))
    .filter((library) => library && Number.isFinite(library.latitude) && Number.isFinite(library.longitude))
    .filter((library) => !Number.isFinite(radius) || library.distanceMeters <= radius);
  return rows.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 30);
}

function normalizeData4LibraryRows(payload) {
  const response = payload?.response || payload || {};
  const rows = response.libs || response.lib || response.items || [];
  return Array.isArray(rows) ? rows.map((row) => row.lib || row) : [];
}

function normalizeData4LibraryLibrary(row, latitude, longitude) {
  const lat = Number(row.latitude || row.lat || row.ydn || row.y);
  const lng = Number(row.longitude || row.lng || row.xcn || row.x);
  const distance = Number.isFinite(lat) && Number.isFinite(lng)
    ? distanceMeters(latitude, longitude, lat, lng)
    : Number(row.distance || 0);
  const name = String(row.libName || row.libname || row.name || "").trim();
  if (!name) return null;
  return {
    id: String(row.libCode || row.libcode || row.libCd || row.libId || `${name}-${row.address || row.addr || ""}`),
    name,
    shortName: shortLibraryName(name),
    address: row.address || row.addr || "주소 미제공",
    latitude: lat,
    longitude: lng,
    distanceMeters: distance,
    distance: formatDistance(distance),
    phone: row.tel || row.phone || "",
    placeUrl: row.homepage || row.homepageUrl || row.url || "",
    operatingHours: row.operatingTime || row.operatingHours || row.operatinghour || "",
    closedDays: row.closed || row.closedDays || row.closedday || "",
    source: "data4library-libSrch",
  };
}

function mergeLibraries(primary, secondary) {
  const seen = new Set();
  return [...primary, ...secondary].filter((library) => {
    const key = [
      library.id,
      library.name,
      library.address,
      Number(library.latitude).toFixed(5),
      Number(library.longitude).toFixed(5),
    ].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rankLibrariesForQuery(libraries, rawQuery) {
  const terms = searchTerms(rawQuery);
  if (!terms.length) {
    return libraries.sort((a, b) => Number(a.distanceMeters || Infinity) - Number(b.distanceMeters || Infinity));
  }
  const ranked = libraries
    .map((library) => ({ library, score: librarySearchScore(library, terms) }));
  const hasRelevant = ranked.some((item) => item.score > 0);
  return ranked
    .filter((item) => !hasRelevant || item.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.library.distanceMeters || Infinity) - Number(b.library.distanceMeters || Infinity))
    .map((item) => item.library);
}

function searchTerms(rawQuery) {
  const base = String(rawQuery || "")
    .trim()
    .replace(/도서관/g, " ")
    .replace(/\s+/g, " ");
  if (!base) return [];
  const terms = new Set();
  base.split(" ").forEach((term) => {
    const cleaned = term.trim();
    if (cleaned.length < 2) return;
    terms.add(cleaned);
    if (cleaned.endsWith("구") && cleaned.length > 2) terms.add(cleaned.slice(0, -1));
    if (cleaned.endsWith("시") && cleaned.length > 2) terms.add(cleaned.slice(0, -1));
  });
  return [...terms];
}

function librarySearchScore(library, terms) {
  const name = String(library.name || library.libraryName || "");
  const address = String(library.address || "");
  return terms.reduce((score, term) => {
    if (name.includes(term)) score += 8;
    if (address.includes(term)) score += 12;
    return score;
  }, 0);
}

function normalizeKakaoLibrary(place) {
  const distanceMeters = Number(place.distance || 0);
  return {
    id: place.id,
    name: place.place_name,
    shortName: shortLibraryName(place.place_name),
    address: place.road_address_name || place.address_name || "주소 미제공",
    latitude: Number(place.y),
    longitude: Number(place.x),
    distanceMeters,
    distance: formatDistance(distanceMeters),
    phone: place.phone || "",
    placeUrl: place.place_url || "",
    source: "kakao-local",
  };
}

function isLibraryPlace(place) {
  const haystack = `${place.place_name || ""} ${place.category_name || ""}`;
  return haystack.includes("도서관") || haystack.toLowerCase().includes("library");
}

function shortLibraryName(name) {
  return name.replace(/도서관$/, "").trim() || name;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return "거리 미제공";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

function readDb() {
  if (memoryDb) return memoryDb;
  if (!canWriteLocalData()) {
    memoryDb = createInitialDb();
    return memoryDb;
  }
  ensureDataDir();
  if (!fs.existsSync(dbPath)) {
    const initial = createInitialDb();
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    memoryDb = initial;
    return initial;
  }
  try {
    memoryDb = {
      ...createInitialDb(),
      ...JSON.parse(fs.readFileSync(dbPath, "utf8")),
    };
    return memoryDb;
  } catch {
    memoryDb = createInitialDb();
    return memoryDb;
  }
}

function writeDb(db) {
  memoryDb = db;
  dbHydrated = true;
  if (canWriteLocalData()) {
    ensureDataDir();
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  }
  syncDbToSupabase(db).catch((error) => {
    console.warn(`Supabase sync skipped: ${error.message}`);
  });
  syncRelationalTables(db).catch((error) => {
    if (!relationalSupabaseWarned) {
      relationalSupabaseWarned = true;
      console.warn(`Supabase relational sync skipped: ${error.message}`);
    }
  });
}

function isSupabaseConfigured() {
  return Boolean(getEnv("SUPABASE_URL") && supabaseServiceKey());
}

function supabaseServiceKey() {
  return getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_ANON_KEY");
}

function supabaseRestUrl(table, query = "") {
  const base = String(getEnv("SUPABASE_URL") || "").replace(/\/+$/, "");
  return `${base}/rest/v1/${table}${query}`;
}

async function hydrateDbFromSupabase() {
  if (!isSupabaseConfigured()) return;

  if (await hydrateDbFromRelational().catch(() => false)) {
    await syncDbToSupabase(readDb());
    return;
  }

  const response = await supabaseRequest("app_state?id=eq.default&select=data", {
    method: "GET",
  });
  if (!response.ok) {
    supabaseStatus = response.status === 404 ? "schema-missing" : "error";
    throw new Error(response.status === 404
      ? "Supabase app_state table is missing. Run docs/06-supabase-setup.sql in the Supabase SQL editor."
      : `Supabase read failed: ${response.status}`);
  }

  supabaseStatus = "connected";
  const rows = await response.json().catch(() => []);
  const remoteDb = rows?.[0]?.data;
  if (remoteDb && typeof remoteDb === "object") {
    writeDb({ ...createInitialDb(), ...remoteDb });
    return;
  }

  await syncDbToSupabase(readDb());
}

async function ensureDbHydrated() {
  if (!isSupabaseConfigured() || dbHydrated) return;
  if (!dbHydrationPromise) {
    dbHydrationPromise = hydrateDbFromSupabase()
      .then(() => {
        dbHydrated = true;
      })
      .catch((error) => {
        console.warn(`Supabase hydrate skipped: ${error.message}`);
      })
      .finally(() => {
        dbHydrationPromise = null;
      });
  }
  await dbHydrationPromise;
}

async function hydrateDbFromRelational() {
  const [
    users,
    factions,
    libraries,
    libraryInfluences,
    books,
    readingSessions,
    locationLogs,
    aiVerifications,
    influenceLogs,
    userRankings,
    factionRankings,
  ] = await Promise.all([
    fetchRelationalRows("users"),
    fetchRelationalRows("factions"),
    fetchRelationalRows("libraries"),
    fetchRelationalRows("library_influences"),
    fetchRelationalRows("books"),
    fetchRelationalRows("reading_sessions"),
    fetchRelationalRows("location_logs"),
    fetchRelationalRows("ai_verifications"),
    fetchRelationalRows("influence_logs"),
    fetchRelationalRows("user_rankings"),
    fetchRelationalRows("faction_rankings"),
  ]);
  const hasRows = [users, factions, libraries, books, readingSessions].some((rows) => rows.length > 0);
  if (!hasRows) return false;
  const db = {
    ...createInitialDb(),
    users: users.map(fromUserRow),
    factions: factions.map(fromFactionRow),
    libraries: libraries.map(fromLibraryRow),
    libraryInfluences: libraryInfluences.map(fromLibraryInfluenceRow),
    books: books.map(fromBookRow),
    readingSessions: readingSessions.map(fromReadingSessionRow),
    locationLogs: locationLogs.map(fromLocationLogRow),
    aiVerifications: aiVerifications.map(fromAiVerificationRow),
    influenceLogs: influenceLogs.map(fromInfluenceLogRow),
    userRankings: userRankings.map(fromUserRankingRow),
    factionRankings: factionRankings.map(fromFactionRankingRow),
  };
  writeDb(db);
  supabaseStatus = "connected";
  return true;
}

async function fetchRelationalRows(table) {
  const response = await supabaseRequest(`${table}?select=*`, { method: "GET" });
  if (!response.ok) throw new Error(`${table} read failed: ${response.status}`);
  return response.json().catch(() => []);
}

async function syncDbToSupabase(db) {
  if (!isSupabaseConfigured()) return;

  const response = await supabaseRequest("app_state?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: "default",
      data: db,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    if (response.status === 404) supabaseStatus = "schema-missing";
    throw new Error(message || `Supabase write failed: ${response.status}`);
  }
  supabaseStatus = "connected";
}

async function syncRelationalTables(db) {
  if (!isSupabaseConfigured()) return;
  await upsertRelational("factions", mapFactions(db.factions), "faction_id");
  await upsertRelational("users", mapUsers(db.users), "user_id");
  await upsertRelational("libraries", mapLibraries(db.libraries), "library_id");
  await upsertRelational("library_influences", mapLibraryInfluences(db.libraryInfluences), "influence_id");
  await upsertRelational("books", mapBooks(db.books), "book_id");
  await upsertRelational("reading_sessions", mapReadingSessions(db.readingSessions), "session_id");
  await upsertRelational("location_logs", mapLocationLogs(db.locationLogs), "location_log_id");
  await upsertRelational("ai_verifications", mapAiVerifications(db.aiVerifications), "verification_id");
  await upsertRelational("influence_logs", mapInfluenceLogs(db.influenceLogs), "log_id");
  await upsertRelational("user_rankings", mapUserRankings(db.userRankings), "ranking_id");
  await upsertRelational("faction_rankings", mapFactionRankings(db.factionRankings), "ranking_id");
}

async function upsertRelational(table, rows, conflictKey) {
  if (!rows.length) return;
  const response = await supabaseRequest(`${table}?on_conflict=${conflictKey}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    if (response.status === 404) {
      throw new Error(`정규 테이블 ${table}이 없습니다. docs/07-supabase-relational-schema.sql을 실행해 주세요.`);
    }
    throw new Error(message || `${table} upsert failed: ${response.status}`);
  }
}

function mapUsers(rows = []) {
  return rows.map((user) => ({
    user_id: user.userId,
    faction_id: user.factionId || null,
    social_provider: user.socialProvider || "",
    social_id: user.socialId || "",
    email: user.email || "",
    name: user.name || "",
    nickname: user.nickname || "",
    exp: Number(user.exp || 0),
    role: user.role || "USER",
    onboarding_completed: Boolean(user.onboardingCompleted),
    picture: user.picture || "",
    last_login_at: user.lastLoginAt || null,
    created_at: user.createdAt || null,
    updated_at: user.updatedAt || null,
  }));
}

function mapFactions(rows = []) {
  return rows.map((faction) => ({
    faction_id: faction.factionId,
    faction_name: faction.name,
    faction_color: faction.color,
    join_type: faction.joinType || "FREE",
    description: faction.description || "",
    created_by_user_id: faction.createdByUserId || null,
    is_active: faction.isActive !== false,
    created_at: faction.createdAt || null,
    updated_at: faction.updatedAt || null,
  }));
}

function mapLibraries(rows = []) {
  return rows.map((library) => ({
    library_id: library.libraryId,
    external_library_code: library.externalLibraryCode || "",
    library_name: library.libraryName,
    address: library.address || "",
    latitude: finiteOrNull(library.latitude),
    longitude: finiteOrNull(library.longitude),
    region: library.region || "",
    phone: library.phone || "",
    homepage_url: library.homepageUrl || "",
    operating_hours: library.operatingHours || "",
    closed_days: library.closedDays || "",
    current_occupied_faction_id: library.currentOccupiedFactionId || null,
    source: library.source || "",
    created_at: library.createdAt || null,
    updated_at: library.updatedAt || null,
  }));
}

function mapLibraryInfluences(rows = []) {
  return rows.map((item) => ({
    influence_id: item.influenceId,
    library_id: item.libraryId,
    faction_id: item.factionId,
    influence_score: Number(item.influenceScore || 0),
    last_contributed_at: item.lastContributedAt || null,
    created_at: item.createdAt || null,
    updated_at: item.updatedAt || null,
  }));
}

function mapBooks(rows = []) {
  return rows.map((book) => ({
    book_id: book.bookId,
    isbn: book.isbn || "",
    title: book.title || "제목 미확인",
    author: book.author || "",
    publisher: book.publisher || "",
    cover_image_url: book.coverImageUrl || "",
    total_pages: Number(book.totalPages || 0),
    description: book.description || "",
    external_source: book.externalSource || "",
    created_at: book.createdAt || null,
    updated_at: book.updatedAt || null,
  }));
}

function mapReadingSessions(rows = []) {
  return rows.map((session) => ({
    session_id: session.sessionId,
    user_id: session.userId,
    faction_id: session.factionId || null,
    library_id: session.libraryId || null,
    book_id: session.bookId || null,
    start_time: session.startTime || null,
    end_time: session.endTime || null,
    duration_minutes: Number(session.durationMinutes || 0),
    start_page: Number(session.startPage || 0),
    end_page: Number(session.endPage || 0),
    is_minimum_time_met: Boolean(session.isMinimumTimeMet),
    is_location_valid: Boolean(session.isLocationValid),
    status: session.status || "",
    fail_reason: session.failReason || "",
    submitted_at: session.submittedAt || null,
    completed_at: session.completedAt || null,
    created_at: session.createdAt || null,
    updated_at: session.updatedAt || null,
  }));
}

function mapLocationLogs(rows = []) {
  return rows.map((log) => ({
    location_log_id: log.locationLogId,
    session_id: log.sessionId,
    latitude: finiteOrNull(log.latitude),
    longitude: finiteOrNull(log.longitude),
    accuracy_meters: finiteOrNull(log.accuracyMeters),
    distance_from_library: Number.isFinite(Number(log.distanceFromLibrary)) ? Math.round(Number(log.distanceFromLibrary)) : null,
    is_out_of_range: Boolean(log.isOutOfRange),
    status: log.status || "",
    checked_at: log.checkedAt || null,
  }));
}

function mapAiVerifications(rows = []) {
  return rows.map((verification) => ({
    verification_id: verification.verificationId,
    session_id: verification.sessionId,
    submitted_cover_image_url: verification.submittedCoverImageUrl || "",
    registered_cover_image_url: verification.registeredCoverImageUrl || "",
    review_text: verification.reviewText || "",
    vision_confidence: finiteOrNull(verification.visionConfidence) || 0,
    llm_confidence: finiteOrNull(verification.llmConfidence) || 0,
    vision_passed: Boolean(verification.visionPassed),
    llm_passed: Boolean(verification.llmPassed),
    page_validation_passed: Boolean(verification.pageValidationPassed),
    location_validation_passed: Boolean(verification.locationValidationPassed),
    is_passed: Boolean(verification.isPassed),
    fail_reason: verification.failReason || "",
    model_name: verification.modelName || "",
    verified_at: verification.verifiedAt || null,
    created_at: verification.createdAt || null,
  }));
}

function mapInfluenceLogs(rows = []) {
  return rows.map((log) => ({
    log_id: log.logId,
    user_id: log.userId || null,
    library_id: log.libraryId || null,
    faction_id: log.factionId || null,
    session_id: log.sessionId || null,
    score_delta: Number(log.scoreDelta || 0),
    influence_before: Number(log.influenceBefore || 0),
    influence_after: Number(log.influenceAfter || 0),
    previous_occupied_faction_id: log.previousOccupiedFactionId || null,
    new_occupied_faction_id: log.newOccupiedFactionId || null,
    is_occupation_changed: Boolean(log.isOccupationChanged),
    action_type: log.actionType || "",
    created_at: log.createdAt || null,
  }));
}

function mapUserRankings(rows = []) {
  return rows.map((ranking) => ({
    ranking_id: ranking.rankingId,
    user_id: ranking.userId,
    faction_id: ranking.factionId || null,
    rank: ranking.rank,
    total_exp: Number(ranking.exp || ranking.totalExp || 0),
    total_books: Number(ranking.booksRead || ranking.totalBooks || 0),
    total_sessions: Number(ranking.totalSessions || 0),
    updated_at: new Date().toISOString(),
  }));
}

function mapFactionRankings(rows = []) {
  return rows.map((ranking) => ({
    ranking_id: ranking.rankingId,
    faction_id: ranking.factionId,
    rank: ranking.rank,
    total_influence: Number(ranking.totalInfluence || 0),
    occupied_library_count: Number(ranking.occupiedLibraries || ranking.occupiedLibraryCount || 0),
    member_count: Number(ranking.memberCount || 0),
    updated_at: new Date().toISOString(),
  }));
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fromUserRow(row) {
  return {
    userId: row.user_id,
    factionId: row.faction_id,
    socialProvider: row.social_provider,
    socialId: row.social_id,
    email: row.email,
    name: row.name,
    nickname: row.nickname,
    exp: row.exp,
    role: row.role,
    onboardingCompleted: row.onboarding_completed,
    picture: row.picture,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromFactionRow(row) {
  return {
    factionId: row.faction_id,
    name: row.faction_name,
    color: row.faction_color,
    joinType: row.join_type,
    description: row.description,
    createdByUserId: row.created_by_user_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromLibraryRow(row) {
  return {
    libraryId: row.library_id,
    externalLibraryCode: row.external_library_code,
    libraryName: row.library_name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    region: row.region,
    phone: row.phone,
    homepageUrl: row.homepage_url,
    operatingHours: row.operating_hours,
    closedDays: row.closed_days,
    currentOccupiedFactionId: row.current_occupied_faction_id,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromLibraryInfluenceRow(row) {
  return {
    influenceId: row.influence_id,
    libraryId: row.library_id,
    factionId: row.faction_id,
    influenceScore: row.influence_score,
    lastContributedAt: row.last_contributed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromBookRow(row) {
  return {
    bookId: row.book_id,
    isbn: row.isbn,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    coverImageUrl: row.cover_image_url,
    totalPages: row.total_pages,
    description: row.description,
    externalSource: row.external_source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromReadingSessionRow(row) {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    factionId: row.faction_id,
    libraryId: row.library_id,
    bookId: row.book_id,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes,
    startPage: row.start_page,
    endPage: row.end_page,
    isMinimumTimeMet: row.is_minimum_time_met,
    isLocationValid: row.is_location_valid,
    status: row.status,
    failReason: row.fail_reason,
    submittedAt: row.submitted_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromLocationLogRow(row) {
  return {
    locationLogId: row.location_log_id,
    sessionId: row.session_id,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracy_meters,
    distanceFromLibrary: row.distance_from_library,
    isOutOfRange: row.is_out_of_range,
    status: row.status,
    checkedAt: row.checked_at,
  };
}

function fromAiVerificationRow(row) {
  return {
    verificationId: row.verification_id,
    sessionId: row.session_id,
    submittedCoverImageUrl: row.submitted_cover_image_url,
    registeredCoverImageUrl: row.registered_cover_image_url,
    reviewText: row.review_text,
    visionConfidence: row.vision_confidence,
    llmConfidence: row.llm_confidence,
    visionPassed: row.vision_passed,
    llmPassed: row.llm_passed,
    pageValidationPassed: row.page_validation_passed,
    locationValidationPassed: row.location_validation_passed,
    isPassed: row.is_passed,
    failReason: row.fail_reason,
    modelName: row.model_name,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  };
}

function fromInfluenceLogRow(row) {
  return {
    logId: row.log_id,
    userId: row.user_id,
    libraryId: row.library_id,
    factionId: row.faction_id,
    sessionId: row.session_id,
    scoreDelta: row.score_delta,
    influenceBefore: row.influence_before,
    influenceAfter: row.influence_after,
    previousOccupiedFactionId: row.previous_occupied_faction_id,
    newOccupiedFactionId: row.new_occupied_faction_id,
    isOccupationChanged: row.is_occupation_changed,
    actionType: row.action_type,
    createdAt: row.created_at,
  };
}

function fromUserRankingRow(row) {
  return {
    rankingId: row.ranking_id,
    userId: row.user_id,
    factionId: row.faction_id,
    rank: row.rank,
    exp: row.total_exp,
    totalExp: row.total_exp,
    booksRead: row.total_books,
    totalBooks: row.total_books,
    totalSessions: row.total_sessions,
  };
}

function fromFactionRankingRow(row) {
  return {
    rankingId: row.ranking_id,
    factionId: row.faction_id,
    rank: row.rank,
    totalInfluence: row.total_influence,
    occupiedLibraries: row.occupied_library_count,
    occupiedLibraryCount: row.occupied_library_count,
    memberCount: row.member_count,
  };
}

function supabaseRequest(pathAndQuery, options = {}) {
  const key = supabaseServiceKey();
  return fetchWithTimeout(supabaseRestUrl(pathAndQuery), {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  }, 10000);
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function canWriteLocalData() {
  return process.env.VERCEL !== "1";
}

function createInitialDb() {
  const now = new Date().toISOString();
  return {
    users: [],
    factions: [
      {
        factionId: 1,
        name: "기본 진영",
        color: "#3ba7ee",
        joinType: "FREE",
        description: "처음 시작하는 사용자를 위한 기본 진영",
        createdByUserId: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    libraries: [],
    libraryInfluences: [],
    books: [],
    readingSessions: [],
    locationLogs: [],
    aiVerifications: [],
    influenceLogs: [],
    userRankings: [],
    factionRankings: [],
  };
}

function nextId(db, key) {
  const collections = [db.users, db.factions, db.libraries, db.books, db.readingSessions, db.locationLogs, db.aiVerifications, db.influenceLogs, db.libraryInfluences, db.userRankings, db.factionRankings];
  return collections.flat().reduce((max, item) => Math.max(max, Number(item?.[key]) || 0), 0) + 1;
}

function paginateRows(rows, requestUrl) {
  const page = Math.max(0, Number.parseInt(requestUrl.searchParams.get("page") || "0", 10) || 0);
  const size = Math.min(100, Math.max(1, Number.parseInt(requestUrl.searchParams.get("size") || "20", 10) || 20));
  const start = page * size;
  return {
    content: rows.slice(start, start + size),
    page,
    size,
    totalElements: rows.length,
  };
}

function getSessionUser(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  if (cookies.libcon_user) {
    try {
      const sessionUser = JSON.parse(Buffer.from(cookies.libcon_user, "base64url").toString("utf8"));
      const db = readDb();
      return upsertUser(db, sessionUser, { write: true });
    } catch {}
  }

  const auth = String(request.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const userId = readUserIdFromToken(token);
  if (!userId) return null;
  const db = readDb();
  return db.users.find((user) => user.userId === userId) || null;
}

function requireUser(request, response, db) {
  const sessionUser = getSessionUser(request);
  if (!sessionUser) {
    sendJson(response, 401, { code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
    return null;
  }
  return db.users.find((user) => user.userId === sessionUser.userId) || sessionUser;
}

function upsertUser(db, sessionUser, options = {}) {
  const provider = sessionUser.provider || sessionUser.socialProvider || "google";
  const socialId = sessionUser.socialId || sessionUser.sub || sessionUser.email || "local";
  let user = db.users.find((item) => item.socialProvider === provider && item.socialId === socialId);
  const now = new Date().toISOString();
  if (!user) {
    user = {
      userId: nextId(db, "userId"),
      factionId: null,
      socialProvider: provider,
      socialId,
      email: sessionUser.email || "",
      name: sessionUser.name || "",
      nickname: "",
      exp: 0,
      role: "USER",
      onboardingCompleted: false,
      picture: sessionUser.picture || "",
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(user);
  } else {
    user.email = sessionUser.email || user.email;
    user.name = sessionUser.name || user.name;
    user.picture = sessionUser.picture || user.picture;
    user.lastLoginAt = now;
  }
  if (options.write) writeDb(db);
  return user;
}

function serializeUser(user, db) {
  const faction = db.factions.find((item) => item.factionId === user.factionId);
  return {
    userId: user.userId,
    factionId: user.factionId || null,
    nickname: user.nickname,
    email: user.email,
    name: user.name,
    exp: user.exp || 0,
    faction: faction ? {
      factionId: faction.factionId,
      name: faction.name,
      color: faction.color,
    } : null,
    onboardingCompleted: Boolean(user.onboardingCompleted),
  };
}

function normalizeNickname(value) {
  return String(value || "").trim();
}

function validateNickname(nickname) {
  if (nickname.length < 2 || nickname.length > 12) {
    return { valid: false, message: "닉네임은 2자 이상 12자 이하로 입력해 주세요." };
  }
  if (!/^[가-힣a-zA-Z0-9]+$/.test(nickname)) {
    return { valid: false, message: "닉네임은 한글, 영문, 숫자만 사용할 수 있습니다." };
  }
  return { valid: true, message: "" };
}

function safeHexColor(value) {
  const color = String(value || "");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#3ba7ee";
}

function normalizeLibraryAvailability(value) {
  const text = String(value || "").trim();
  if (!text || text === "운영 시간 미제공" || text === "휴관일 미제공") return "";
  return text;
}

function upsertLibrary(db, library) {
  let item = db.libraries.find((entry) => String(entry.externalLibraryCode) === String(library.id));
  const now = new Date().toISOString();
  if (!item) {
    item = {
      libraryId: nextId(db, "libraryId"),
      externalLibraryCode: String(library.id),
      libraryName: library.name,
      address: library.address,
      latitude: library.latitude,
      longitude: library.longitude,
      region: "",
      phone: library.phone || "",
      homepageUrl: library.placeUrl || "",
      operatingHours: normalizeLibraryAvailability(library.operatingHours),
      closedDays: normalizeLibraryAvailability(library.closedDays),
      currentOccupiedFactionId: null,
      source: library.source || "",
      createdAt: now,
      updatedAt: now,
    };
    db.libraries.push(item);
  } else {
    item.libraryName = library.name;
    item.address = library.address;
    item.latitude = library.latitude;
    item.longitude = library.longitude;
    item.phone = library.phone || item.phone;
    item.homepageUrl = library.placeUrl || item.homepageUrl;
    item.operatingHours = normalizeLibraryAvailability(library.operatingHours) || normalizeLibraryAvailability(item.operatingHours);
    item.closedDays = normalizeLibraryAvailability(library.closedDays) || normalizeLibraryAvailability(item.closedDays);
    item.source = library.source || item.source;
    item.updatedAt = now;
  }
  library.libraryId = item.libraryId;
  library.currentOccupiedFaction = factionSummary(db, item.currentOccupiedFactionId);
  library.influences = libraryInfluences(db, item.libraryId);
  return item;
}

function serializeLibraryDetail(db, library) {
  return {
    libraryId: library.libraryId,
    libraryName: library.libraryName,
    name: library.libraryName,
    address: library.address,
    latitude: library.latitude,
    longitude: library.longitude,
    operatingHours: normalizeLibraryAvailability(library.operatingHours),
    closedDays: normalizeLibraryAvailability(library.closedDays),
    phone: library.phone,
    homepageUrl: library.homepageUrl,
    currentOccupiedFaction: factionSummary(db, library.currentOccupiedFactionId),
    influences: libraryInfluences(db, library.libraryId),
    canStartReading: false,
  };
}

function factionSummary(db, factionId) {
  const faction = db.factions.find((item) => item.factionId === factionId);
  return faction ? { factionId: faction.factionId, name: faction.name, color: faction.color } : null;
}

function libraryInfluences(db, libraryId) {
  return db.libraryInfluences
    .filter((item) => item.libraryId === libraryId)
    .map((item) => {
      const faction = db.factions.find((entry) => entry.factionId === item.factionId);
      return {
        factionId: item.factionId,
        faction: faction?.name || "알 수 없음",
        name: faction?.name || "알 수 없음",
        color: faction?.color || "#8a94b5",
        score: item.influenceScore,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function libraryName(db, libraryId) {
  return db.libraries.find((library) => library.libraryId === libraryId)?.libraryName || "도서관";
}

async function fetchBookFromLibraryApi(isbn) {
  const key = getEnv("LIBRARY_API_KEY");
  if (!key) return null;
  const url = new URL("http://data4library.kr/api/srchDtlList");
  url.searchParams.set("authKey", key);
  url.searchParams.set("isbn13", isbn);
  url.searchParams.set("format", "json");
  const response = await fetchWithTimeout(url, {}, 8000);
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const doc = payload?.response?.detail?.[0]?.book || payload?.response?.detail?.[0] || null;
  if (!doc) return null;
  return {
    isbn,
    title: doc.bookname || doc.title || `ISBN ${isbn}`,
    author: doc.authors || doc.author || "저자 미확인",
    publisher: doc.publisher || "출판사 미확인",
    coverImageUrl: doc.bookImageURL || doc.coverImageUrl || "",
    totalPages: Number(doc.bookDtlUrl ? 0 : doc.totalPages || 0),
    description: doc.description || "",
    externalSource: "data4library",
  };
}

function serializeBook(book) {
  return {
    bookId: book.bookId,
    isbn: book.isbn,
    title: book.title,
    author: book.author,
    publisher: book.publisher,
    coverImageUrl: book.coverImageUrl,
    totalPages: book.totalPages,
    description: book.description,
  };
}

function createLocationLog(db, session, latitude, longitude, distance, accuracyMeters) {
  const isOutOfRange = !Number.isFinite(distance) || distance > 250;
  return {
    locationLogId: nextId(db, "locationLogId"),
    sessionId: session.sessionId,
    latitude,
    longitude,
    accuracyMeters,
    distanceFromLibrary: Number.isFinite(distance) ? Math.round(distance) : null,
    isOutOfRange,
    status: isOutOfRange ? "OUT_OF_RANGE" : distance > 200 ? "WARNING" : "NORMAL",
    checkedAt: new Date().toISOString(),
  };
}

function ensureVerification(db, session) {
  let verification = db.aiVerifications.find((item) => item.sessionId === session.sessionId);
  if (!verification) {
    verification = {
      verificationId: nextId(db, "verificationId"),
      sessionId: session.sessionId,
      submittedCoverImageUrl: "",
      registeredCoverImageUrl: "",
      reviewText: "",
      visionConfidence: 0,
      llmConfidence: 0,
      visionPassed: false,
      llmPassed: false,
      pageValidationPassed: false,
      locationValidationPassed: Boolean(session.isLocationValid),
      isPassed: false,
      failReason: "",
      modelName: "local-rule-check",
      verifiedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.aiVerifications.push(verification);
  }
  return verification;
}

function validatePageSpeed(session) {
  const pages = Number(session.endPage) - Number(session.startPage) + 1;
  if (!Number.isFinite(pages) || pages <= 0) return false;
  if (!session.durationMinutes) return pages <= 80;
  return pages / Math.max(1, session.durationMinutes) <= 4;
}

function finalizeVerification(session, verification) {
  verification.pageValidationPassed = validatePageSpeed(session);
  verification.locationValidationPassed = Boolean(session.isLocationValid);
  verification.isPassed = Boolean(
    verification.llmPassed
    && verification.pageValidationPassed
    && verification.locationValidationPassed
    && session.isMinimumTimeMet
  );
  verification.failReason = verification.isPassed ? "" : firstFailReason(session, verification);
  verification.verifiedAt = new Date().toISOString();
}

function firstFailReason(session, verification) {
  if (!session.isMinimumTimeMet) return "최소 20분 독서 조건을 충족하지 못했습니다.";
  if (!verification.llmPassed) return "감상평 검증을 통과하지 못했습니다.";
  if (!verification.pageValidationPassed) return "독서 시간 대비 페이지 수가 비정상적입니다.";
  if (!verification.locationValidationPassed) return "독서 중 위치 조건을 충족하지 못했습니다.";
  return "인증 조건을 충족하지 못했습니다.";
}

function serializeVerification(session, verification) {
  return {
    sessionId: session.sessionId,
    visionPassed: verification.visionPassed,
    llmPassed: verification.llmPassed,
    pageValidationPassed: verification.pageValidationPassed,
    locationValidationPassed: verification.locationValidationPassed,
    minimumTimeMet: session.isMinimumTimeMet,
    isPassed: verification.isPassed,
    failReason: verification.failReason || null,
  };
}

async function geminiVerifyReview(book, reviewText) {
  const key = getEnv("GEMINI_API_KEY");
  if (!key || !reviewText) return null;
  const text = await callGeminiJson([
    "You verify whether a Korean reading review is specifically related to the registered book.",
    "Fail if the review is mostly self-introduction, daily chatter, gaming talk, generic praise, random text, or does not mention concrete concepts from the book.",
    "Pass only when it references the book title, author, subject, characters, exam/topic terms, or specific content/learning from the book.",
    `Book title: ${book.title || ""}`,
    `Book author: ${book.author || ""}`,
    `Book description: ${book.description || ""}`,
    `Review: ${reviewText}`,
    "Return only JSON: {\"passed\": boolean, \"confidence\": number, \"reason\": string}",
  ].join("\n"));
  return parseAiVerdict(text);
}

function validateReviewLocally(book, reviewText) {
  const review = normalizeKoreanText(reviewText);
  if (review.length < 30) {
    return { passed: false, confidence: 0.25, reason: "감상평을 책 내용과 관련 있게 30자 이상 작성해 주세요." };
  }

  const offTopicTerms = [
    "오버워치", "롤", "리그오브레전드", "배그", "발로란트", "게임", "집가고", "집을가고",
    "정태민", "안녕하십니까", "하하", "짱짱", "테스트", "아무말", "배고파", "졸려",
  ];
  const offTopicHits = offTopicTerms.filter((term) => review.includes(normalizeKoreanText(term))).length;
  const bookTerms = bookKeywordCandidates(book);
  const matchedTerms = bookTerms.filter((term) => review.includes(term));
  const contentTerms = [
    "내용", "주제", "저자", "작가", "등장인물", "인물", "사건", "배경", "문장", "챕터", "느꼈",
    "배웠", "알게", "이해", "생각", "기억", "설명", "개념", "문제", "필기", "시험", "정보처리",
    "산업기사", "프로그래밍", "데이터베이스", "운영체제", "네트워크", "알고리즘", "보안",
  ];
  const contentHits = contentTerms.filter((term) => review.includes(normalizeKoreanText(term))).length;
  const passed = offTopicHits === 0 && (matchedTerms.length >= 1 || contentHits >= 2);
  return {
    passed,
    confidence: passed ? 0.78 : 0.32,
    reason: passed
      ? "감상평이 책 내용과 관련 있습니다."
      : "감상평에 책 제목, 저자, 주제, 배운 내용 등 책과 관련된 내용을 구체적으로 작성해 주세요.",
  };
}

function bookKeywordCandidates(book) {
  const source = [book.title, book.author, book.publisher, book.description].filter(Boolean).join(" ");
  const compact = normalizeKoreanText(source);
  const rawTokens = String(source)
    .split(/[^0-9A-Za-z가-힣]+/)
    .map(normalizeKoreanText)
    .filter((token) => token.length >= 2);
  const stopwords = new Set(["과정평가형", "필기", "실기", "문제집", "기출", "개정판", "저자", "출판사"]);
  return Array.from(new Set([
    compact,
    ...rawTokens.filter((token) => !stopwords.has(token)),
  ].filter((token) => token.length >= 2))).slice(0, 30);
}

function normalizeKoreanText(value) {
  return String(value || "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

async function callGeminiJson(prompt, imageDataUrl = "") {
  const key = getEnv("GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;
  const parts = [{ text: prompt }];
  const image = parseDataImage(imageDataUrl);
  if (image) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.base64,
      },
    });
  }
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  }, 12000);
  if (!response.ok) return "";
  const payload = await response.json().catch(() => ({}));
  return payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function parseDataImage(value) {
  const match = String(value || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function parseAiVerdict(text) {
  try {
    const parsed = JSON.parse(String(text || "").replace(/^```json|```$/g, "").trim());
    return {
      passed: Boolean(parsed.passed),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reason: String(parsed.reason || ""),
    };
  } catch {
    return null;
  }
}

function applyReward(db, session) {
  if (session.status === "VERIFICATION_PASSED") {
    return { exp: 0, influence: 0, occupation: { changed: false } };
  }
  const user = db.users.find((item) => item.userId === session.userId);
  const library = db.libraries.find((item) => item.libraryId === session.libraryId);
  const factionId = session.factionId || user?.factionId;
  const exp = 10;
  const influence = 10;
  if (user) user.exp = (user.exp || 0) + exp;
  let influenceRow = db.libraryInfluences.find((item) => item.libraryId === session.libraryId && item.factionId === factionId);
  if (!influenceRow) {
    influenceRow = {
      influenceId: nextId(db, "influenceId"),
      libraryId: session.libraryId,
      factionId,
      influenceScore: 0,
      lastContributedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.libraryInfluences.push(influenceRow);
  }
  const before = influenceRow.influenceScore;
  influenceRow.influenceScore += influence;
  influenceRow.lastContributedAt = new Date().toISOString();
  influenceRow.updatedAt = new Date().toISOString();
  const previousFactionId = library?.currentOccupiedFactionId || null;
  const top = db.libraryInfluences
    .filter((item) => item.libraryId === session.libraryId)
    .sort((a, b) => b.influenceScore - a.influenceScore)[0];
  if (library && top && top.influenceScore > 0) {
    if (!previousFactionId || top.influenceScore > (db.libraryInfluences.find((item) => item.libraryId === session.libraryId && item.factionId === previousFactionId)?.influenceScore || 0)) {
      library.currentOccupiedFactionId = top.factionId;
    }
  }
  session.status = "VERIFICATION_PASSED";
  session.completedAt = new Date().toISOString();
  db.influenceLogs.push({
    logId: nextId(db, "logId"),
    userId: session.userId,
    libraryId: session.libraryId,
    factionId,
    sessionId: session.sessionId,
    scoreDelta: influence,
    influenceBefore: before,
    influenceAfter: influenceRow.influenceScore,
    previousOccupiedFactionId: previousFactionId,
    newOccupiedFactionId: library?.currentOccupiedFactionId || null,
    isOccupationChanged: previousFactionId !== (library?.currentOccupiedFactionId || null),
    actionType: previousFactionId !== (library?.currentOccupiedFactionId || null) ? "OCCUPATION_CHANGED" : "INFLUENCE_GAINED",
    createdAt: new Date().toISOString(),
  });
  return {
    exp,
    influence,
    occupation: {
      previousFaction: factionSummary(db, previousFactionId)?.name || null,
      currentFaction: factionSummary(db, library?.currentOccupiedFactionId)?.name || null,
      changed: previousFactionId !== (library?.currentOccupiedFactionId || null),
    },
  };
}

function userRankPosition(db, userId) {
  return db.users
    .slice()
    .sort((a, b) => (b.exp || 0) - (a.exp || 0))
    .findIndex((user) => user.userId === userId) + 1;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
  const radius = 6371000;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createJwt(userId, type = "access") {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: String(userId),
    type,
    iat: now,
    exp: now + (type === "refresh" ? 60 * 60 * 24 * 30 : 60 * 60 * 2),
  };
  const encodedHeader = Buffer.from(JSON.stringify(header), "utf8").toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signJwt(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function readUserIdFromToken(token) {
  try {
    const [encodedHeader, encodedPayload, signature] = String(token || "").split(".");
    if (!encodedHeader || !encodedPayload || !signature) return null;
    const expected = signJwt(`${encodedHeader}.${encodedPayload}`);
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return Number(payload.sub) || null;
  } catch {
    return null;
  }
}

function signJwt(value) {
  const secret = getEnv("JWT_SECRET") || getEnv("GOOGLE_CLIENT_SECRET") || getEnv("GOOGLE_CLIENT_ID") || "libcon-local-dev";
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function createMemoryResponse() {
  return {
    writeHead() {},
    end() {},
  };
}

function serveStatic(pathname, response) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(root, safePath));
  if (!filePath.startsWith(root)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(response, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (status === 204) {
    response.end();
    return;
  }
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(text);
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

function loadEnv() {
  if (process.env.LIBCON_SKIP_ENV === "1") {
    return {};
  }

  const values = {};
  const candidates = [
    path.join(root, ".env"),
    "C:/Users/209-08/Downloads/동아리/해커톤/Environment variable.env",
  ];

  candidates.forEach((filePath) => {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const index = trimmed.indexOf("=");
      if (index === -1) return;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && value) values[key] = value;
    });
  });

  return values;
}

function getEnv(name) {
  return process.env[name] || env[name] || "";
}

function isValidGoogleClientId(clientId) {
  return /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(clientId);
}

function createOAuthState() {
  const payload = `${Date.now()}.${crypto.randomBytes(18).toString("hex")}`;
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  return `${encodedPayload}.${signOAuthState(encodedPayload)}`;
}

function verifyOAuthState(state) {
  const [encodedPayload, signature] = String(state || "").split(".");
  if (!encodedPayload || !signature) return false;

  const expected = signOAuthState(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;

  try {
    const [timestamp] = Buffer.from(encodedPayload, "base64url").toString("utf8").split(".");
    const age = Date.now() - Number(timestamp);
    return Number.isFinite(age) && age >= 0 && age <= 10 * 60 * 1000;
  } catch {
    return false;
  }
}

function signOAuthState(payload) {
  const secret = getEnv("OAUTH_STATE_SECRET")
    || getEnv("GOOGLE_CLIENT_SECRET")
    || getEnv("GOOGLE_CLIENT_ID");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function isHttpsRequest(request) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return forwardedProto === "https";
}

function googleRedirectUri(request) {
  return getEnv("GOOGLE_REDIRECT_URI") || googleRedirectUriFromHost(request.headers.host);
}

function googleRedirectUriFromHost(host) {
  return getEnv("GOOGLE_REDIRECT_URI") || `http://${host}/api/auth/google/callback`;
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${value}`, "Path=/", "SameSite=Lax"];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

function parseCookies(header) {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), part.slice(index + 1)];
      }),
  );
}

function setupPage(message) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LIBCON 설정 필요</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #070a10; color: #f5f7ff; font-family: system-ui, sans-serif; }
    main { width: min(420px, calc(100vw - 32px)); padding: 24px; border: 1px solid #293041; border-radius: 8px; background: #121722; }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { color: #c1c8dc; line-height: 1.6; }
    code { display: block; margin: 12px 0; padding: 12px; border-radius: 8px; background: #070a10; color: #32d17a; white-space: pre-wrap; }
    a { color: #3ba7ee; font-weight: 800; }
  </style>
</head>
<body>
  <main>
    <h1>Google 로그인 설정이 필요합니다</h1>
    <p>${escapeHtml(message)}</p>
    <code>GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback</code>
    <p>Google Cloud Console의 승인된 리디렉션 URI에도 위 주소를 등록해 주세요.</p>
    <a href="/">앱으로 돌아가기</a>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

module.exports = {
  handleRequest,
};
