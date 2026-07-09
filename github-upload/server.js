const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const root = __dirname;
const preferredPort = Number(process.env.PORT || 5173);
const env = loadEnv();

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
    if (requestUrl.pathname === "/api/config") {
      const googleClientId = getEnv("GOOGLE_CLIENT_ID");
      sendJson(response, 200, {
        kakaoJsKey: getEnv("KAKAO_JS_API_KEY"),
        hasKakaoRestKey: Boolean(getEnv("KAKAO_REST_API_KEY")),
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

    if (requestUrl.pathname === "/api/libraries") {
      await handleLibraries(requestUrl, response);
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
  startServer(preferredPort);
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

  const state = crypto.randomBytes(18).toString("hex");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  response.writeHead(302, {
    Location: authUrl.toString(),
    "Set-Cookie": cookie("google_oauth_state", state, { maxAge: 600, httpOnly: true }),
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

  if (!state || state !== cookies.google_oauth_state) {
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

  response.writeHead(302, {
    Location: "/?auth=success",
    "Set-Cookie": [
      cookie("libcon_user", Buffer.from(JSON.stringify(sessionUser), "utf8").toString("base64url"), {
        maxAge: 60 * 60 * 24 * 7,
        httpOnly: true,
      }),
      cookie("google_oauth_state", "", { maxAge: 0, httpOnly: true }),
    ],
  });
  response.end();
}

function handleAuthMe(request, response) {
  const cookies = parseCookies(request.headers.cookie || "");
  const rawUser = cookies.libcon_user;
  if (!rawUser) {
    sendJson(response, 200, { user: null });
    return;
  }

  try {
    const user = JSON.parse(Buffer.from(rawUser, "base64url").toString("utf8"));
    sendJson(response, 200, { user });
  } catch {
    sendJson(response, 200, { user: null });
  }
}

async function handleLibraries(requestUrl, response) {
  const kakaoRestKey = getEnv("KAKAO_REST_API_KEY");
  if (!kakaoRestKey) {
    sendJson(response, 503, {
      message: "KAKAO_REST_API_KEY가 설정되지 않았습니다.",
    });
    return;
  }

  const latitude = Number(requestUrl.searchParams.get("lat"));
  const longitude = Number(requestUrl.searchParams.get("lng"));
  const radius = clampNumber(Number(requestUrl.searchParams.get("radius") || 5000), 100, 20000);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    sendJson(response, 400, {
      message: "lat, lng 쿼리 파라미터가 필요합니다.",
    });
    return;
  }

  const kakaoUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  kakaoUrl.searchParams.set("query", "도서관");
  kakaoUrl.searchParams.set("x", String(longitude));
  kakaoUrl.searchParams.set("y", String(latitude));
  kakaoUrl.searchParams.set("radius", String(radius));
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
    sendJson(response, kakaoResponse.status, {
      code: upstreamMessage.includes("OPEN_MAP_AND_LOCAL")
        ? "KAKAO_MAP_SERVICE_DISABLED"
        : "KAKAO_LOCAL_API_ERROR",
      message: upstreamMessage || "카카오 로컬 API 호출에 실패했습니다.",
    });
    return;
  }

  const libraries = (payload.documents || [])
    .filter((place) => isLibraryPlace(place))
    .map((place) => normalizeKakaoLibrary(place));

  sendJson(response, 200, {
    source: "kakao-local",
    center: { latitude, longitude },
    radius,
    total: libraries.length,
    libraries,
  });
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
    "Access-Control-Allow-Methods": "GET,OPTIONS",
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

function googleRedirectUri(request) {
  return getEnv("GOOGLE_REDIRECT_URI") || googleRedirectUriFromHost(request.headers.host);
}

function googleRedirectUriFromHost(host) {
  return getEnv("GOOGLE_REDIRECT_URI") || `http://${host}/api/auth/google/callback`;
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${value}`, "Path=/", "SameSite=Lax"];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
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
