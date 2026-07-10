const factions = [];

const PROFILE_STORAGE_KEY = "libcon-profile-v1";
const TOKEN_STORAGE_KEY = "libcon-auth-tokens-v1";
const savedProfile = loadSavedProfile();
if (Array.isArray(savedProfile.customFactions)) {
  savedProfile.customFactions.forEach((faction) => {
    if (faction?.id && faction?.name) factions.push(faction);
  });
}

const userBooks = [];
const userSessions = [];
const userContributions = [];
const userRankings = [];
const factionRankings = [];

const defaultLocation = {
  latitude: 37.566826,
  longitude: 126.9786567,
  label: "서울 시청",
};

const state = {
  screen: "login",
  selectedFaction: savedProfile.selectedFaction ?? null,
  exp: Number.isFinite(savedProfile.exp) ? savedProfile.exp : 0,
  selectedLibrary: null,
  rankingTab: "users",
  rankingPage: 0,
  rankingPageInfo: { page: 0, size: 5, totalElements: 0 },
  myTab: "books",
  myPage: 0,
  myPageInfo: { page: 0, size: 5, totalElements: 0 },
  mySummary: { booksRead: 0, totalReadingMinutes: 0, contributionLibraries: 0 },
  expandedReviews: new Set(),
  config: null,
  configStatus: "idle",
  libraries: [],
  libraryStatus: "idle",
  libraryError: "",
  librarySearchQuery: "",
  activeLibraryQuery: "",
  location: null,
  locationSource: "",
  locationAccuracy: null,
  mapSelectMode: false,
  mapStatus: "idle",
  authUser: null,
  authStatus: "idle",
  loginError: "",
  nickname: savedProfile.nickname || "",
  nicknameStatus: "idle",
  nicknameMessage: "",
  factionStatus: "idle",
  myDataStatus: "idle",
  rankingStatus: "idle",
  sessionMessage: "",
  activeSession: null,
  sessionIsbn: "",
  lookupBook: null,
  lookupBookStatus: "idle",
  timerStartedAt: null,
  timerElapsedSeconds: 0,
  timerId: null,
  verificationResult: null,
  scannerMessage: "",
  confirmCancelSession: false,
  locationWarning: "",
  outOfRangeCount: 0,
};

const app = document.querySelector("#app");
let resolvedApiBase = null;
let apiBasePromise = null;

let kakaoSdkPromise = null;
let kakaoMapInstance = null;
let kakaoMarkerInstances = [];

function getStoredTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveTokens(tokens) {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens || {}));
}

function factionById(id) {
  return factions.find((faction) => String(faction.id) === String(id));
}

function libraryById(id) {
  return state.libraries.find((library) => String(library.id) === String(id));
}

function setScreen(screen) {
  state.screen = screen;
  render();
}

function render() {
  const renderers = {
    login: renderLogin,
    nickname: renderNickname,
    onboarding: renderOnboarding,
    createFaction: renderCreateFaction,
    guide: renderGuide,
    home: renderHome,
    detail: renderDetail,
    reading: renderReadingSession,
    verify: renderVerifyForm,
    result: renderResult,
    ranking: renderRanking,
    my: renderMyPage,
  };
  app.innerHTML = renderers[state.screen]() + renderModal();
  bindEvents();
  afterRender();
}

function afterRender() {
  if (state.screen === "login") {
    loadCurrentUser();
  }
  if (state.screen === "onboarding") {
    loadFactions();
  }
  if (state.screen === "home") {
    loadFactions();
    loadLibraries();
    requestAnimationFrame(initMapIfPossible);
  }
  if (state.screen === "ranking" && state.rankingStatus === "idle") loadRankings();
  if (state.screen === "my") {
    loadMyPageData();
  }
  if (state.screen === "reading") {
    startReadingTicker();
  } else {
    stopReadingTicker();
  }
}

function renderLogin() {
  return `
    <section class="screen no-nav login-screen">
      <div>
        <div class="brand-mark large"><span class="book-icon"></span></div>
        <h1 class="brand-title">LIBCON</h1>
        <p class="brand-subtitle">LIBRARY CONQUEST</p>
      </div>
      <div class="hero-copy">
        <h2>도서관을 점령하라.</h2>
        <p>독서로 진영의 영향력을 높이고 전국 도서관을 정복하세요.</p>
      </div>
      <button class="primary-button" data-action="login">
        <span class="google-g">G</span>
        <span>Google로 시작하기</span>
      </button>
      ${state.loginError ? `<p class="login-error">${state.loginError}</p>` : ""}
      <p class="terms">로그인 시 서비스 이용약관에 동의하는 것으로 간주됩니다</p>
    </section>
  `;
}

function renderOnboarding() {
  const canContinue = Boolean(factionById(state.selectedFaction));
  return `
    <section class="screen no-nav">
      <p class="eyebrow">02 / 03</p>
      <h1 class="screen-title">진영 선택</h1>
      <p class="section-kicker">함께 싸울 진영을 선택하세요</p>
      <div class="cards">
        ${renderFactionList()}
      </div>
      <button class="ghost-button" data-action="create-faction" style="width:100%; margin-top:16px">새 진영 생성하기</button>
      ${state.sessionMessage ? `<p class="form-note">${escapeHtml(state.sessionMessage)}</p>` : ""}
      <button class="primary-button" data-action="guide" style="margin-top:14px" ${canContinue ? "" : "disabled"}>
        ${canContinue ? "이 진영으로 시작하기" : "진영을 선택하세요"}
      </button>
    </section>
  `;
}

function renderNickname() {
  const canContinue = state.nicknameStatus === "available";
  return `
    <section class="screen no-nav">
      <p class="eyebrow">01 / 03</p>
      <h1 class="screen-title">닉네임 설정</h1>
      <p class="section-kicker">랭킹과 마이페이지에 표시될 이름을 정하세요</p>
      <form id="nickname-form" class="faction-form">
        <label class="form-field">
          <span>닉네임</span>
          <input name="nickname" maxlength="12" required value="${escapeHtml(state.nickname)}" placeholder="예: 정태민" autocomplete="off">
        </label>
        ${state.nicknameMessage ? `<p class="form-note ${canContinue ? "success-note" : ""}">${escapeHtml(state.nicknameMessage)}</p>` : ""}
        <button class="ghost-button" type="submit">${state.nicknameStatus === "checking" ? "확인 중" : "중복 확인"}</button>
        <button class="primary-button" type="button" data-action="nickname-next" ${canContinue ? "" : "disabled"}>다음</button>
      </form>
    </section>
  `;
}

function renderFactionList() {
  if (state.factionStatus === "loading") {
    return renderEmptyState("진영을 불러오는 중입니다", "잠시만 기다려 주세요.");
  }
  return factions.length
    ? factions.map(renderFactionCard).join("")
    : renderEmptyState("아직 생성된 진영이 없습니다", "새 진영을 만들어 온보딩을 계속해 주세요.");
}

function renderCreateFaction() {
  return `
    <section class="screen no-nav">
      <div class="form-header">
        <button class="icon-button" data-action="back-onboarding" aria-label="진영 선택으로 돌아가기" title="뒤로 가기">←</button>
        <div>
          <p class="eyebrow">NEW FACTION</p>
          <h1 class="screen-title small">새 진영 만들기</h1>
        </div>
      </div>
      <form id="create-faction-form" class="faction-form">
        <label class="form-field">
          <span>진영 이름</span>
          <input name="name" maxlength="16" required placeholder="예: 새벽의 서재" autocomplete="off">
        </label>
        <label class="form-field">
          <span>진영 소개</span>
          <textarea name="desc" maxlength="60" required placeholder="어떤 독서 진영인지 소개해 주세요"></textarea>
        </label>
        <fieldset class="form-field">
          <legend>대표 색상</legend>
          <div class="color-options">
            ${["#ff554a", "#3ba7ee", "#32d17a", "#b45be6", "#f5b82e"]
              .map(
                (color, index) => `
                  <label class="color-option" style="--swatch:${color}">
                    <input type="radio" name="color" value="${color}" ${index === 2 ? "checked" : ""}>
                    <span aria-hidden="true"></span>
                  </label>
                `,
              )
              .join("")}
          </div>
        </fieldset>
        <label class="form-field">
          <span>가입 방식</span>
          <select name="joinType">
            <option value="자유 가입">자유 가입</option>
            <option value="승인 가입">승인 후 가입</option>
          </select>
        </label>
        <p class="form-note">새 진영은 멤버 1명, 영향력 0, EXP 0으로 시작합니다.</p>
        <button class="primary-button" type="submit">진영 생성하기</button>
      </form>
    </section>
  `;
}

function renderFactionCard(faction) {
  const active = String(state.selectedFaction) === String(faction.id) ? " active" : "";
  const memberCount = Number(faction.members);
  return `
    <button class="faction-card${active}" data-action="select-faction" data-id="${escapeHtml(faction.id)}" style="color:${safeColor(faction.color)}">
      <span class="faction-icon"><span class="shield-icon"></span></span>
      <span>
        <strong class="faction-name">${escapeHtml(faction.name)}</strong>
        <span class="faction-desc">${escapeHtml(faction.desc)}</span>
      </span>
      <span class="faction-meta">
        <strong>${Number.isFinite(memberCount) ? `${Math.max(0, memberCount)}명` : "인원 미집계"}</strong>
        <span>${escapeHtml(faction.joinType)}</span>
      </span>
    </button>
  `;
}

function renderGuide() {
  const items = [
    ["도서관 탐색", "지도에서 주변 도서관을 발견하고 점령 현황을 확인하세요."],
    ["250m 체크인", "도서관 반경 250m 이내에서만 독서 세션을 시작할 수 있습니다."],
    ["20분 이상 독서", "최소 20분 독서 후 AI 인증을 통해 영향력을 획득합니다."],
    ["진영 점령권 쟁탈", "가장 높은 영향력을 가진 진영이 도서관을 점령합니다."],
  ];
  return `
    <section class="screen no-nav">
      <p class="eyebrow">03 / 03</p>
      <h1 class="screen-title">전투 지침서</h1>
      <p class="section-kicker">서비스 이용 안내를 확인하세요</p>
      <div class="guide-list">
        ${items
          .map(
            ([title, desc]) => `
              <article class="guide-item">
                <span class="faction-icon"><span class="book-icon"></span></span>
                <span>
                  <h3>${title}</h3>
                  <p class="small-text">${desc}</p>
                </span>
              </article>
            `,
          )
          .join("")}
      </div>
      <button class="primary-button" data-action="home" style="margin-top:42px">전장으로 출격</button>
    </section>
  `;
}

function renderHome() {
  const selectedFaction = factionById(state.selectedFaction);
  return `
    <section class="screen">
      <div class="top-row">
        <div>
          <p class="eyebrow">LIBCON</p>
          <h1 class="screen-title small">주변 도서관 ${renderFactionChip(selectedFaction)}</h1>
        </div>
        <span class="chip exp-pill">${formatNumber(state.exp)} EXP</span>
      </div>
      ${renderLibrarySearch()}
      ${renderMapPanel()}
      ${renderLocationNotice()}
      <div class="library-list">
        ${renderLibraryList()}
      </div>
      ${renderBottomNav("home")}
    </section>
  `;
}

function renderLibrarySearch() {
  const value = escapeHtml(state.librarySearchQuery);
  const activeQuery = state.activeLibraryQuery
    ? `<p class="search-caption">"${escapeHtml(state.activeLibraryQuery)}" 검색 결과</p>`
    : "";
  return `
    <form id="library-search-form" class="library-search" role="search">
      <label class="search-field">
        <span class="library-icon"></span>
        <input name="query" value="${value}" maxlength="40" placeholder="도서관 이름 또는 지역 검색" autocomplete="off">
      </label>
      <button class="ghost-button compact" type="submit">검색</button>
      ${state.activeLibraryQuery ? `<button class="ghost-button compact" type="button" data-action="clear-library-search">초기화</button>` : ""}
      ${activeQuery}
    </form>
  `;
}

function renderMapPanel() {
  const canUseKakaoMap = Boolean(state.config?.kakaoJsKey);
  if (canUseKakaoMap && state.mapStatus !== "error") {
    return `
      <div class="map-panel real-map">
        <div id="kakao-map" class="map-canvas" aria-label="카카오 지도"></div>
        <span class="chip radius-chip">전체거리</span>
        ${renderMapStatus()}
      </div>
    `;
  }

  return `
    <div class="map-panel">
      <span class="road one"></span>
      <span class="road two"></span>
      <span class="road three"></span>
      <span class="chip radius-chip">전체거리</span>
      ${clusterLibraries(state.libraries).map(renderFallbackPin).join("")}
      <span class="me-dot" title="내 위치"></span>
      <div class="legend">
        <span><i class="dot"></i>내 위치</span>
        <span><i class="dot empty"></i>주변 도서관</span>
      </div>
      ${renderMapStatus()}
    </div>
  `;
}

function renderMapStatus() {
  if (state.mapSelectMode) {
    return `<div class="map-status">지도에서 현재 위치를 눌러 지정해 주세요</div>`;
  }

  if (state.mapStatus === "error") {
    return `<div class="map-status subtle">좌표 기반 미니맵으로 표시합니다</div>`;
  }

  if (state.libraryStatus === "loading") {
    return `<div class="map-status">현재 위치 기준 도서관을 불러오는 중입니다</div>`;
  }

  if (state.libraryStatus === "error") {
    return `<div class="map-status error">${state.libraryError}</div>`;
  }

  if (state.config && !state.config.kakaoJsKey) {
    return `<div class="map-status subtle">KAKAO_JS_API_KEY가 없어서 좌표 기반 미니맵으로 표시합니다</div>`;
  }

  return "";
}

function renderFallbackPin(library) {
  const x = library.mapX ?? 50;
  const y = library.mapY ?? 50;
  const pinColor = library.currentOccupiedFaction?.color || "#32d17a";
  const isCluster = Number(library.clusterCount) > 1;
  return `
    <button class="pin external-pin ${isCluster ? "cluster-pin" : ""}" data-action="library-detail" data-id="${library.id}" style="left:${x}%; top:${y}%; --pin:${safeColor(pinColor)};" aria-label="${library.name}">
      ${isCluster ? `<strong>${library.clusterCount}</strong>` : `<span class="book-icon"></span>`}
      <label>${isCluster ? "도서관" : library.shortName}</label>
    </button>
  `;
}

function clusterLibraries(libraries) {
  const clusters = [];
  libraries.forEach((library) => {
    const found = clusters.find((cluster) => Math.abs((cluster.mapX || 0) - (library.mapX || 0)) < 7 && Math.abs((cluster.mapY || 0) - (library.mapY || 0)) < 7);
    if (!found) {
      clusters.push({ ...library, clusterCount: 1 });
      return;
    }
    found.clusterCount += 1;
    found.name = `${found.clusterCount}개 도서관`;
  });
  return clusters;
}

function renderLocationNotice() {
  if (!state.locationSource) return "";
  const accuracy = Number(state.locationAccuracy);
  const accuracyText = Number.isFinite(accuracy) && accuracy > 0
    ? ` · 정확도 약 ${Math.round(accuracy)}m`
    : "";
  const text = state.locationSource === "current"
    ? `현재 위치 기준으로 ${state.activeLibraryQuery ? "도서관을 검색했습니다" : "주변 도서관을 검색했습니다"}${accuracyText}.`
    : state.locationSource === "manual"
      ? `지도에서 지정한 위치 기준으로 ${state.activeLibraryQuery ? "도서관을 검색했습니다." : "주변 도서관을 검색했습니다."}`
      : `위치 권한이 없어서 서울 시청 기준으로 ${state.activeLibraryQuery ? "도서관을 검색했습니다." : "도서관을 검색했습니다."}`;
  return `
    <div class="location-notice">
      <p class="api-note">${text}</p>
      <div class="location-actions">
        <button class="ghost-button compact" data-action="retry-location">내 위치 다시 찾기</button>
        <button class="ghost-button compact" data-action="pick-location">지도에서 위치 지정</button>
      </div>
      <form id="test-location-form" class="test-location-form">
        <input name="lat" inputmode="decimal" value="${escapeHtml(state.location?.latitude ?? "")}" placeholder="위도">
        <input name="lng" inputmode="decimal" value="${escapeHtml(state.location?.longitude ?? "")}" placeholder="경도">
        <button class="ghost-button compact" type="submit">테스트 위치 적용</button>
      </form>
    </div>
  `;
}

function renderLibraryList() {
  if (state.libraryStatus === "loading") {
    return `
      <article class="library-card skeleton-card">
        <span class="faction-icon"><span class="book-icon"></span></span>
        <span>
          <h3>도서관 검색 중</h3>
          <span class="muted">현재 위치 주변 검색</span>
        </span>
      </article>
    `;
  }

  if (state.libraryStatus === "error") {
    return `
      <article class="info-card">
        <p class="section-kicker">연동 확인 필요</p>
        <h3 class="error-title">${state.libraryError}</h3>
        <p class="small-text">로컬 서버 실행 여부와 KAKAO_REST_API_KEY 값을 확인해 주세요.</p>
        <button class="ghost-button" data-action="reload-libraries" style="width:100%; margin-top:14px">다시 불러오기</button>
      </article>
    `;
  }

  if (!state.libraries.length) {
    return `
      <article class="info-card">
        <p class="section-kicker">검색 결과 없음</p>
        <h3>검색 조건에 맞는 도서관을 찾지 못했습니다</h3>
        <button class="ghost-button" data-action="reload-libraries" style="width:100%; margin-top:14px">다시 불러오기</button>
      </article>
    `;
  }

  return state.libraries.map(renderLibraryCard).join("");
}

function renderLibraryCard(library) {
  return `
    <button class="library-card" data-action="library-detail" data-id="${library.id}">
      <span class="faction-icon external-icon"><span class="book-icon"></span></span>
      <span>
        <h3>${library.name}</h3>
        <span class="muted">${library.distance} · ${library.address}</span>
      </span>
      <i class="chevron"></i>
    </button>
  `;
}

function renderDetail() {
  const library = libraryById(state.selectedLibrary) || state.libraries[0];
  if (!library) {
    return `
      <section class="screen no-nav detail-screen">
        <button class="icon-button" data-action="home" aria-label="뒤로"><span class="arrow-icon"></span></button>
        <article class="info-card" style="margin-top:24px">
          <h1>도서관 정보가 없습니다</h1>
          <p class="small-text">지도 화면에서 도서관을 다시 선택해 주세요.</p>
        </article>
      </section>
    `;
  }

  const inRange = library.distanceMeters <= 250;
  return `
    <section class="screen no-nav detail-screen">
      <div class="detail-top">
        <button class="icon-button" data-action="home" aria-label="뒤로"><span class="arrow-icon"></span></button>
        <div>
          <h1>${library.name}</h1>
          <p>${library.address}</p>
        </div>
      </div>
      <article class="info-card">
        <p class="section-kicker">도서관 정보</p>
        <div class="info-grid">
          <span class="info-line"><i class="library-icon"></i><span>장소명</span><strong>${library.name}</strong></span>
          <span class="info-line"><i class="book-icon"></i><span>전화번호</span><strong>${library.phone || "미제공"}</strong></span>
          <span class="info-line"><i class="clock-icon"></i><span>거리</span><strong>${library.distance}</strong></span>
          <span class="info-line"><i class="clock-icon"></i><span>운영시간</span><strong>${escapeHtml(library.operatingHours || "운영 시간 미제공")}</strong></span>
          <span class="info-line"><i class="clock-icon"></i><span>휴관일</span><strong>${escapeHtml(library.closedDays || "휴관일 미제공")}</strong></span>
        </div>
        ${
          library.placeUrl
            ? `<a class="external-link" href="${library.placeUrl}" target="_blank" rel="noreferrer">카카오맵 상세 보기</a>`
            : ""
        }
      </article>
      <article class="info-card">
        <p class="section-kicker">좌표</p>
        <p class="small-text">위도 ${library.latitude.toFixed(6)} · 경도 ${library.longitude.toFixed(6)}</p>
      </article>
      <article class="info-card">
        <p class="section-kicker">점령 현황</p>
        ${renderOccupiedFaction(library)}
        ${renderInfluenceList(library)}
      </article>
      <form id="session-start-form" class="faction-form">
        <label class="form-field">
          <span>ISBN / 바코드</span>
          <input name="isbn" inputmode="numeric" required placeholder="읽을 책의 ISBN을 입력하세요" value="${escapeHtml(state.sessionIsbn)}">
        </label>
        ${renderBookLookup()}
        <button class="ghost-button" type="button" data-action="lookup-book">도서 정보 확인</button>
        <button class="ghost-button" type="button" data-action="scan-isbn">카메라로 바코드 스캔</button>
        ${state.scannerMessage ? `<p class="form-note">${escapeHtml(state.scannerMessage)}</p>` : ""}
        ${state.sessionMessage ? `<p class="form-note">${escapeHtml(state.sessionMessage)}</p>` : ""}
        <button class="primary-button" ${inRange ? "" : "disabled"}>
          <span class="${inRange ? "book-icon" : "lock-icon"}"></span>
          <span>${inRange ? "독서 시작하기" : `250m 이내로 이동하세요 (${library.distance})`}</span>
        </button>
      </form>
    </section>
  `;
}

function renderOccupiedFaction(library) {
  const faction = library.currentOccupiedFaction;
  if (!faction) {
    return `<p class="small-text">아직 점령한 진영이 없습니다.</p>`;
  }
  return `<p class="small-text"><span class="chip" style="color:${safeColor(faction.color)}"><span class="shield-icon"></span>${escapeHtml(faction.name)}</span></p>`;
}

function renderInfluenceList(library) {
  const influences = Array.isArray(library.influences) ? library.influences : [];
  if (!influences.length) {
    return `<p class="small-text">인증 성공 후 진영 영향력이 표시됩니다.</p>`;
  }
  return `
    <div class="influence-list">
      ${influences.map((item) => `
        <span class="influence-row">
          <span style="color:${safeColor(item.color)}">${escapeHtml(item.name || item.faction || "진영")}</span>
          <strong>${formatNumber(item.score)} pt</strong>
        </span>
      `).join("")}
    </div>
  `;
}

function renderBookLookup() {
  if (state.lookupBookStatus === "loading") {
    return `<article class="info-card compact-card"><p class="small-text">도서 정보를 확인하는 중입니다.</p></article>`;
  }
  if (!state.lookupBook) return "";
  return `
    <article class="book-card lookup-card">
      <span class="book-cover">${state.lookupBook.coverImageUrl ? `<img src="${escapeHtml(state.lookupBook.coverImageUrl)}" alt="">` : `<span class="book-icon"></span>`}</span>
      <span>
        <h3>${escapeHtml(state.lookupBook.title || "도서 정보")}</h3>
        <p class="small-text">${escapeHtml(state.lookupBook.author || "저자 미확인")} · ${escapeHtml(state.lookupBook.publisher || "출판사 미확인")}</p>
        <p class="small-text">ISBN ${escapeHtml(state.lookupBook.isbn || state.sessionIsbn)}</p>
      </span>
    </article>
  `;
}

function renderModal() {
  if (!state.confirmCancelSession) return "";
  return `
    <div class="modal-backdrop">
      <article class="modal-panel">
        <h3>독서를 취소할까요?</h3>
        <p class="small-text">현재 독서 세션은 CANCELED 상태로 저장되고 보상은 지급되지 않습니다.</p>
        <div class="modal-actions">
          <button class="ghost-button compact" data-action="close-cancel-modal">계속 읽기</button>
          <button class="primary-button compact" data-action="confirm-cancel-session">취소하기</button>
        </div>
      </article>
    </div>
  `;
}

function renderReadingSession() {
  const elapsedMinutes = Math.floor(state.timerElapsedSeconds / 60);
  const elapsedSeconds = state.timerElapsedSeconds % 60;
  const canVerify = elapsedMinutes >= 20;
  return `
    <section class="screen no-nav">
      <div class="detail-top">
        <button class="icon-button" data-action="home" aria-label="홈"><span class="arrow-icon"></span></button>
        <div>
          <p class="eyebrow">READING</p>
          <h1>독서 세션</h1>
        </div>
      </div>
      <article class="info-card timer-card">
        <p class="section-kicker">독서 시간</p>
        <strong class="timer-text">${String(elapsedMinutes).padStart(2, "0")}:${String(elapsedSeconds).padStart(2, "0")}</strong>
        <p class="small-text">최소 20분 이상 독서해야 인증 제출이 가능합니다.</p>
      </article>
      <article class="info-card">
        <p class="section-kicker">위치 확인</p>
        <p class="small-text">${state.locationWarning || state.sessionMessage || "도서관 반경 유지 여부를 주기적으로 확인합니다."}</p>
      </article>
      <button class="primary-button" data-action="verify-form" ${canVerify ? "" : "disabled"}>
        ${canVerify ? "인증 정보 입력" : "20분 후 인증 가능"}
      </button>
      <button class="ghost-button" data-action="test-add-reading-time" style="width:100%; margin-top:12px">
        테스트 +10분
      </button>
      <button class="ghost-button" data-action="cancel-session" style="width:100%; margin-top:12px">독서 취소</button>
    </section>
  `;
}

function renderVerifyForm() {
  return `
    <section class="screen no-nav verify-screen">
      <div class="detail-top">
        <button class="icon-button" data-action="reading" aria-label="뒤로"><span class="arrow-icon"></span></button>
        <div>
          <p class="eyebrow">VERIFY</p>
          <h1>독서 인증</h1>
        </div>
      </div>
      <form id="verify-form" class="faction-form">
        <label class="form-field">
          <span>시작 페이지</span>
          <input name="startPage" inputmode="numeric" required placeholder="예: 1">
        </label>
        <label class="form-field">
          <span>종료 페이지</span>
          <input name="endPage" inputmode="numeric" required placeholder="예: 40">
        </label>
        <label class="form-field">
          <span>감상평</span>
          <textarea name="reviewText" minlength="30" required placeholder="책 제목, 주제, 배운 내용 등을 포함해 30자 이상 작성하세요"></textarea>
        </label>
        ${state.sessionMessage ? `<p class="form-note">${escapeHtml(state.sessionMessage)}</p>` : ""}
        <button class="primary-button" type="submit">인증 제출</button>
      </form>
    </section>
  `;
}

function renderResult() {
  const result = state.verificationResult;
  return `
    <section class="screen no-nav">
      <p class="eyebrow">RESULT</p>
      <h1 class="screen-title">${result?.status === "VERIFICATION_PASSED" ? "인증 성공" : "인증 결과"}</h1>
      <article class="info-card">
        <p class="section-kicker">보상</p>
        <h3>${formatNumber(result?.reward?.exp || 0)} EXP · ${formatNumber(result?.reward?.influence || 0)} 영향력</h3>
        <p class="small-text">${escapeHtml(result?.failReason || result?.occupation?.currentFaction || "결과를 확인했습니다.")}</p>
      </article>
      <button class="primary-button" data-action="my">마이페이지로 이동</button>
      <button class="ghost-button" data-action="home" style="width:100%; margin-top:12px">지도 보기</button>
    </section>
  `;
}

function renderRanking() {
  const isUsers = state.rankingTab === "users";
  return `
    <section class="screen">
      <p class="eyebrow">LIBCON</p>
      <h1 class="screen-title">랭킹보드</h1>
      <div class="tabs" style="--count:2">
        <button class="tab-button ${isUsers ? "active" : ""}" data-action="ranking-tab" data-tab="users">개인 랭킹</button>
        <button class="tab-button ${!isUsers ? "active" : ""}" data-action="ranking-tab" data-tab="factions">진영 랭킹</button>
      </div>
      <div class="ranking-list">
        ${isUsers ? renderUserRanks() : renderFactionRanks()}
      </div>
      ${renderPager("ranking")}
      ${renderBottomNav("ranking")}
    </section>
  `;
}

function renderUserRanks() {
  if (!userRankings.length) {
    return renderEmptyState("개인 랭킹 데이터가 없습니다", "인증 성공 기록이 쌓이면 개인 랭킹을 표시합니다.");
  }

  return userRankings
    .map((rank, index) => `
        <article class="ranking-card">
          <span class="rank-number">${index + 1}</span>
          <span>
            <h3>${escapeHtml(rank.name)}</h3>
            <span class="small-text">${escapeHtml(rank.factionName || "진영 미설정")}</span>
          </span>
          <span class="rank-score">${formatNumber(rank.exp)}<br><small class="muted">${formatNumber(rank.booksRead)}권</small></span>
        </article>
      `)
    .join("");
}

function renderFactionRanks() {
  if (!factionRankings.length) {
    return renderEmptyState("진영 랭킹 데이터가 없습니다", "점령권과 영향력 데이터가 생성되면 진영 랭킹을 표시합니다.");
  }

  return factionRankings
    .map((faction, index) => `
      <article class="ranking-card">
        <span class="rank-number">${index + 1}</span>
        <span>
          <h3 style="color:${safeColor(faction.color)}">${escapeHtml(faction.name)}</h3>
          <span class="small-text">${escapeHtml(faction.desc)}</span>
        </span>
        <span class="rank-score">${formatNumber(faction.occupiedLibraries)}개<br><small class="muted">${formatNumber(faction.totalInfluence)} pt</small></span>
      </article>
    `)
    .join("");
}

function renderMyPage() {
  const selectedFaction = factionById(state.selectedFaction);
  const displayName = state.authUser?.name || state.authUser?.email?.split("@")[0] || "독서가";
  const summary = state.mySummary || {};
  return `
    <section class="screen profile-section">
      <div class="profile-main">
        <div class="avatar">ㅇ</div>
        <div>
          <h1>${escapeHtml(displayName)}</h1>
          ${renderFactionChip(selectedFaction)}
        </div>
        <div class="exp">${formatNumber(state.exp)}<br><small class="muted">EXP</small></div>
      </div>
      <div class="stats">
        <article class="stat-card"><span><strong>${formatNumber(summary.booksRead)}</strong><span class="muted">독서 권수</span></span></article>
        <article class="stat-card"><span><strong>${formatReadingTime(summary.totalReadingMinutes)}</strong><span class="muted">총 독서</span></span></article>
        <article class="stat-card"><span><strong>${formatNumber(summary.contributionLibraries)}</strong><span class="muted">기여 도서관</span></span></article>
      </div>
      <div class="tabs" style="--count:3">
        <button class="tab-button ${state.myTab === "books" ? "active" : ""}" data-action="my-tab" data-tab="books">내 서재</button>
        <button class="tab-button ${state.myTab === "sessions" ? "active" : ""}" data-action="my-tab" data-tab="sessions">독서 기록</button>
        <button class="tab-button ${state.myTab === "libraries" ? "active" : ""}" data-action="my-tab" data-tab="libraries">기여 도서관</button>
      </div>
      <div class="book-list">
        ${renderMyContent()}
      </div>
      ${renderPager("my")}
      ${renderBottomNav("my")}
    </section>
  `;
}

function renderPager(type) {
  const info = type === "ranking" ? state.rankingPageInfo : state.myPageInfo;
  const page = info.page || 0;
  const size = info.size || 5;
  const total = info.totalElements || 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  if (total <= size && page === 0) return "";
  return `
    <div class="pager">
      <button class="ghost-button compact" data-action="${type}-page-prev" ${page <= 0 ? "disabled" : ""}>이전</button>
      <span>${page + 1} / ${totalPages}</span>
      <button class="ghost-button compact" data-action="${type}-page-next" ${page + 1 >= totalPages ? "disabled" : ""}>다음</button>
    </div>
  `;
}

function renderMyContent() {
  if (state.myDataStatus === "loading") {
    return renderEmptyState("불러오는 중입니다", "마이페이지 정보를 최신 상태로 맞추고 있습니다.");
  }

  if (state.myTab === "sessions") {
    if (!userSessions.length) {
      return renderEmptyState("독서 기록이 없습니다", "독서 인증에 성공하면 기록이 표시됩니다.");
    }

    return userSessions
      .map(
        (session) => `
          <article class="book-card reading-record-card">
            <span class="book-cover"><span class="book-icon"></span></span>
            <span class="reading-record-body">
              <span class="reading-record-top">
                <span class="status pass">인증 완료</span>
                <span class="small-text">${escapeHtml(formatDate(session.date))}</span>
              </span>
              <h3>${escapeHtml(session.title)}</h3>
              <p class="small-text">${escapeHtml(session.library)}</p>
              <p class="reading-record-meta">
                <span>${formatNumber(session.minutes)}분</span>
                <span>${escapeHtml(session.pages)}</span>
              </p>
            </span>
          </article>
        `,
      )
      .join("");
  }

  if (state.myTab === "libraries") {
    if (userContributions.length) {
      return userContributions.map(renderContributionCard).join("");
    }
    return renderEmptyState("기여 도서관이 없습니다", "인증에 성공해 영향력을 획득하면 기여 도서관이 표시됩니다.");
  }

  if (!userBooks.length) {
    return renderEmptyState("내 서재가 비어 있습니다", "독서 인증에 성공한 도서가 여기에 쌓입니다.");
  }

  return userBooks
    .map(
      (book, index) => {
        const reviewKey = String(book.bookId ?? `${state.myPage}-${index}`);
        const expanded = state.expandedReviews.has(reviewKey);
        const reviewClass = expanded ? "review review-toggle expanded" : "review review-clamp review-toggle";
        return `
        <article class="book-card reading-record-card">
          <span class="book-cover"><span class="book-icon"></span></span>
          <span class="reading-record-body">
            <span class="reading-record-top">
              <span class="status pass">서재 등록</span>
              <span class="small-text">${escapeHtml(formatDate(book.date))}</span>
            </span>
            <h3>${escapeHtml(book.title)}</h3>
            <p class="small-text">${escapeHtml(book.author)} · ${escapeHtml(book.publisher)}</p>
            <p class="reading-record-meta">
              <span>${formatNumber(book.minutes)}분</span>
              <span>${escapeHtml(book.pages || "페이지 미입력")}</span>
            </p>
            <button class="${reviewClass}" type="button" data-action="toggle-review" data-review-key="${escapeHtml(reviewKey)}" aria-expanded="${expanded ? "true" : "false"}">
              "${escapeHtml(book.review)}"
            </button>
          </span>
        </article>
      `;
      },
    )
    .join("");
}

function renderContributionCard(library) {
  return `
    <article class="book-card reading-record-card">
      <span class="book-cover external-icon"><span class="library-icon"></span></span>
      <span class="reading-record-body">
        <span class="reading-record-top">
          <span class="status pass">영향력 획득</span>
          <span class="small-text">${escapeHtml(library.date ? formatDate(library.date) : "")}</span>
        </span>
        <h3>${library.name}</h3>
        <p class="small-text">${library.address}</p>
        <p class="reading-record-meta">
          <span>${library.distance}</span>
        </p>
      </span>
    </article>
  `;
}

function renderFactionChip(faction) {
  if (!faction) {
    return `<span class="chip muted-chip"><span class="shield-icon"></span>진영 미설정</span>`;
  }
  return `<span class="chip" style="color:${safeColor(faction.color)}"><span class="shield-icon"></span>${escapeHtml(faction.name)}</span>`;
}

function renderEmptyState(title, description) {
  return `
    <article class="info-card empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p class="small-text">${escapeHtml(description)}</p>
    </article>
  `;
}

function renderBottomNav(active) {
  return `
    <nav class="bottom-nav" aria-label="하단 탐색">
      <button class="nav-button ${active === "home" ? "active" : ""}" data-action="home">
        <span class="map-icon"></span>
        <span>지도</span>
      </button>
      <button class="nav-button ${active === "ranking" ? "active" : ""}" data-action="ranking">
        <span class="trophy-icon"></span>
        <span>랭킹</span>
      </button>
      <button class="nav-button ${active === "my" ? "active" : ""}" data-action="my">
        <span class="person-icon"></span>
        <span>마이</span>
      </button>
    </nav>
  `;
}

function bindEvents() {
  app.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", async () => {
      const action = element.dataset.action;
      if (action === "login") startGoogleLogin();
      if (action === "guide") {
        const saved = await saveOnboardingProfile();
        if (saved) setScreen("guide");
      }
      if (action === "nickname-next") setScreen("onboarding");
      if (action === "home") setScreen("home");
      if (action === "ranking") setScreen("ranking");
      if (action === "my") setScreen("my");
      if (action === "reading") setScreen("reading");
      if (action === "verify-form") setScreen("verify");
      if (action === "test-add-reading-time") addTestReadingMinutes();
      if (action === "cancel-session") {
        state.confirmCancelSession = true;
        render();
      }
      if (action === "close-cancel-modal") {
        state.confirmCancelSession = false;
        render();
      }
      if (action === "confirm-cancel-session") cancelReadingSession();
      if (action === "scan-isbn") scanIsbn();
      if (action === "lookup-book") lookupBookByIsbn();
      if (action === "select-faction") {
        state.selectedFaction = element.dataset.id;
        saveProfile();
        render();
      }
      if (action === "create-faction") {
        setScreen("createFaction");
      }
      if (action === "back-onboarding") setScreen("onboarding");
      if (action === "library-detail") {
        state.selectedLibrary = element.dataset.id;
        setScreen("detail");
      }
      if (action === "ranking-tab") {
        state.rankingTab = element.dataset.tab;
        state.rankingPage = 0;
        state.rankingStatus = "idle";
        render();
      }
      if (action === "my-tab") {
        state.myTab = element.dataset.tab;
        state.myPage = 0;
        state.expandedReviews.clear();
        state.myDataStatus = "idle";
        render();
      }
      if (action === "ranking-page-prev" || action === "ranking-page-next") {
        state.rankingPage += action.endsWith("next") ? 1 : -1;
        state.rankingPage = Math.max(0, state.rankingPage);
        state.rankingStatus = "idle";
        render();
      }
      if (action === "my-page-prev" || action === "my-page-next") {
        state.myPage += action.endsWith("next") ? 1 : -1;
        state.myPage = Math.max(0, state.myPage);
        state.expandedReviews.clear();
        state.myDataStatus = "idle";
        render();
      }
      if (action === "toggle-review") {
        const key = element.dataset.reviewKey || "";
        if (state.expandedReviews.has(key)) {
          state.expandedReviews.delete(key);
        } else {
          state.expandedReviews.add(key);
        }
        render();
      }
      if (action === "reload-libraries") {
        state.libraryStatus = "idle";
        loadLibraries({ force: true, useExistingLocation: true });
      }
      if (action === "clear-library-search") {
        state.librarySearchQuery = "";
        state.activeLibraryQuery = "";
        state.libraryStatus = "idle";
        loadLibraries({ force: true, useExistingLocation: true });
      }
      if (action === "retry-location") {
        state.location = null;
        state.locationSource = "";
        state.locationAccuracy = null;
        state.libraryStatus = "idle";
        state.mapStatus = "idle";
        loadLibraries({ force: true });
      }
      if (action === "pick-location") {
        state.mapSelectMode = true;
        render();
      }
    });
  });

  const nicknameForm = app.querySelector("#nickname-form");
  if (nicknameForm) {
    const nicknameInput = nicknameForm.querySelector('input[name="nickname"]');
    nicknameInput?.addEventListener("input", () => {
      state.nickname = nicknameInput.value.trim();
      state.nicknameStatus = "idle";
      state.nicknameMessage = "";
    });
    nicknameForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(nicknameForm);
      state.nickname = String(formData.get("nickname") || "").trim();
      await checkNickname();
    });
  }

  const createFactionForm = app.querySelector("#create-faction-form");
  if (createFactionForm) {
    createFactionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(createFactionForm);
      const name = String(formData.get("name") || "").trim();
      const desc = String(formData.get("desc") || "").trim();
      const color = safeColor(formData.get("color"));
      const joinType = String(formData.get("joinType") || "자유 가입");
      if (!name || !desc) return;

      try {
        const response = await fetchWithTimeout(await apiUrl("/api/factions"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.slice(0, 16),
            color,
            joinType,
            description: desc.slice(0, 60),
          }),
        }, 6000);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "진영 생성에 실패했습니다");
        state.selectedFaction = payload.factionId;
        const createdFaction = {
          id: payload.factionId,
          name: payload.faction?.name || name.slice(0, 16),
          color: payload.faction?.color || color,
          desc: desc.slice(0, 60),
          members: payload.joined ? 1 : 0,
          joinType: joinType === "승인 가입" ? "승인 가입" : "자유 가입",
        };
        const existingIndex = factions.findIndex((faction) => String(faction.id) === String(createdFaction.id));
        if (existingIndex >= 0) {
          factions.splice(existingIndex, 1, createdFaction);
        } else {
          factions.push(createdFaction);
        }
        state.authUser = {
          ...state.authUser,
          factionId: payload.factionId,
          faction: payload.faction || {
            factionId: payload.factionId,
            name: createdFaction.name,
            color: createdFaction.color,
          },
          onboardingCompleted: Boolean(state.nickname),
        };
        state.exp = 0;
        saveProfile();
        state.factionStatus = "idle";
        if (state.nickname) {
          const saved = await saveOnboardingProfile();
          if (saved) {
            setScreen("guide");
            return;
          }
        }
        await loadFactions({ force: true });
        setScreen("onboarding");
      } catch (error) {
        state.sessionMessage = error.message || "진영 생성에 실패했습니다";
        render();
      }
    });
  }

  const sessionStartForm = app.querySelector("#session-start-form");
  if (sessionStartForm) {
    const isbnInput = sessionStartForm.querySelector('input[name="isbn"]');
    isbnInput?.addEventListener("input", () => {
      state.sessionIsbn = isbnInput.value;
      state.lookupBook = null;
      state.lookupBookStatus = "idle";
    });
    sessionStartForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const library = libraryById(state.selectedLibrary) || state.libraries[0];
      const formData = new FormData(sessionStartForm);
      const isbn = String(formData.get("isbn") || "").trim();
      if (!library || !isbn) return;
      try {
        const response = await fetchWithTimeout(await apiUrl("/api/sessions/start"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            libraryId: library.libraryId || library.id,
            isbn,
            latitude: state.location?.latitude || library.latitude,
            longitude: state.location?.longitude || library.longitude,
            accuracyMeters: state.locationAccuracy || 0,
          }),
        }, 8000);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "독서 세션을 시작하지 못했습니다");
        state.activeSession = payload;
        state.sessionIsbn = "";
        state.lookupBook = null;
        state.lookupBookStatus = "idle";
        state.timerStartedAt = Date.now();
        state.timerElapsedSeconds = 0;
        state.locationWarning = "";
        state.outOfRangeCount = 0;
        state.sessionMessage = `세션 #${payload.sessionId} 시작됨`;
        setScreen("reading");
      } catch (error) {
        state.sessionMessage = error.message || "독서 세션을 시작하지 못했습니다";
        render();
      }
    });
  }

  const verifyForm = app.querySelector("#verify-form");
  if (verifyForm) {
    verifyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(verifyForm);
      await submitVerification({
        startPage: Number(formData.get("startPage")),
        endPage: Number(formData.get("endPage")),
        reviewText: String(formData.get("reviewText") || "").trim(),
      });
    });
  }

  const librarySearchForm = app.querySelector("#library-search-form");
  if (librarySearchForm) {
    const searchInput = librarySearchForm.querySelector('input[name="query"]');
    searchInput?.addEventListener("input", () => {
      state.librarySearchQuery = searchInput.value;
    });
    librarySearchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(librarySearchForm);
      state.librarySearchQuery = String(formData.get("query") || "").trim();
      state.activeLibraryQuery = state.librarySearchQuery;
      state.libraryStatus = "idle";
      loadLibraries({ force: true, useExistingLocation: true });
    });
  }

  const testLocationForm = app.querySelector("#test-location-form");
  if (testLocationForm) {
    testLocationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(testLocationForm);
      const latitude = Number(formData.get("lat"));
      const longitude = Number(formData.get("lng"));
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        state.libraryStatus = "error";
        state.libraryError = "테스트 위치의 위도/경도를 올바르게 입력해 주세요.";
        render();
        return;
      }
      state.location = { latitude, longitude };
      state.locationSource = "manual";
      state.locationAccuracy = 0;
      state.libraryStatus = "idle";
      state.mapStatus = "idle";
      loadLibraries({ force: true, useExistingLocation: true });
    });
  }
}

function loadSavedProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveProfile() {
  const customFactions = factions.filter((faction) => faction.custom);
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
    selectedFaction: state.selectedFaction,
    nickname: state.nickname,
    exp: state.exp,
    customFactions,
  }));
}

function contentRows(payload) {
  return Array.isArray(payload) ? payload : Array.isArray(payload?.content) ? payload.content : [];
}

function pageInfo(payload) {
  return Array.isArray(payload)
    ? { page: 0, size: payload.length || 5, totalElements: payload.length }
    : {
        page: Number(payload?.page) || 0,
        size: Number(payload?.size) || 5,
        totalElements: Number(payload?.totalElements) || 0,
      };
}

async function checkNickname() {
  if (!state.nickname) return;
  state.nicknameStatus = "checking";
  state.nicknameMessage = "닉네임을 확인하는 중입니다.";
  render();
  try {
    const params = new URLSearchParams({ nickname: state.nickname });
    const response = await fetchWithTimeout(await apiUrl(`/api/users/check-nickname?${params.toString()}`), {}, 6000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "닉네임 확인 실패");
    state.nicknameStatus = payload.available ? "available" : "unavailable";
    state.nicknameMessage = payload.message || (payload.available ? "사용 가능한 닉네임입니다." : "이미 사용 중인 닉네임입니다.");
    saveProfile();
    render();
  } catch (error) {
    state.nicknameStatus = "error";
    state.nicknameMessage = error.message || "닉네임을 확인하지 못했습니다.";
    render();
  }
}

async function lookupBookByIsbn() {
  const isbn = String(state.sessionIsbn || "").trim();
  if (!isbn) {
    state.scannerMessage = "ISBN을 먼저 입력해 주세요.";
    render();
    return;
  }
  state.lookupBookStatus = "loading";
  state.scannerMessage = "";
  render();
  try {
    const response = await fetchWithTimeout(await apiUrl(`/api/books/isbn/${encodeURIComponent(isbn)}`), {}, 8000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "도서 정보를 찾지 못했습니다.");
    state.lookupBook = payload;
    state.lookupBookStatus = "loaded";
    render();
  } catch (error) {
    state.lookupBookStatus = "error";
    state.scannerMessage = error.message || "도서 정보를 확인하지 못했습니다.";
    render();
  }
}

async function saveOnboardingProfile() {
  if (!state.nickname || !state.selectedFaction) {
    state.sessionMessage = "닉네임과 진영을 모두 선택해 주세요.";
    render();
    return false;
  }
  try {
    const response = await fetchWithTimeout(await apiUrl("/api/users/profile"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: state.nickname,
        factionId: state.selectedFaction,
      }),
    }, 6000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "프로필 저장 실패");
    state.authUser = {
      ...state.authUser,
      nickname: state.nickname,
      factionId: state.selectedFaction,
      onboardingCompleted: true,
    };
    state.myDataStatus = "idle";
    state.rankingStatus = "idle";
    saveProfile();
    return true;
  } catch (error) {
    state.sessionMessage = error.message || "프로필을 저장하지 못했습니다.";
    render();
    return false;
  }
}

async function loadFactions({ force = false } = {}) {
  if (!force && (state.factionStatus === "loading" || state.factionStatus === "loaded")) return;
  state.factionStatus = "loading";
  try {
    const response = await fetchWithTimeout(await apiUrl("/api/factions"), {}, 6000);
    const payload = await response.json();
    if (!response.ok) throw new Error("진영 목록을 불러오지 못했습니다");
    factions.splice(0, factions.length, ...payload.map((faction) => ({
      id: faction.factionId || faction.id,
      name: faction.name,
      color: faction.color,
      desc: faction.description || faction.desc || "",
      members: faction.memberCount,
      joinType: faction.joinType === "APPROVAL" ? "승인 가입" : "자유 가입",
    })));
    state.factionStatus = "loaded";
    render();
  } catch {
    state.factionStatus = "error";
  }
}

async function loadMyPageData({ force = false } = {}) {
  if (!force && (state.myDataStatus === "loading" || state.myDataStatus === "loaded")) return;
  state.myDataStatus = "loading";
  userBooks.splice(0, userBooks.length);
  userSessions.splice(0, userSessions.length);
  userContributions.splice(0, userContributions.length);
  state.myPageInfo = { page: state.myPage, size: 5, totalElements: 0 };
  render();
  try {
    const myQuery = new URLSearchParams({ page: String(state.myPage), size: "5" });
    const sessionQuery = new URLSearchParams({ page: String(state.myPage), size: "5" });
    const [booksResponse, sessionsResponse, librariesResponse, meResponse] = await Promise.all([
      fetchWithTimeout(await apiUrl(`/api/users/me/books?${myQuery.toString()}`), {}, 6000),
      fetchWithTimeout(await apiUrl(`/api/users/me/sessions?${sessionQuery.toString()}`), {}, 6000),
      fetchWithTimeout(await apiUrl(`/api/users/me/libraries?${myQuery.toString()}`), {}, 6000),
      fetchWithTimeout(await apiUrl("/api/users/me"), {}, 6000),
    ]);
    if (meResponse.ok) {
      const me = await meResponse.json();
      state.exp = me.exp || 0;
      state.mySummary = {
        booksRead: Number(me.summary?.booksRead) || 0,
        totalReadingMinutes: Number(me.summary?.totalReadingMinutes) || 0,
        contributionLibraries: Number(me.summary?.contributionLibraries) || 0,
      };
      if (me.faction?.factionId) state.selectedFaction = me.faction.factionId;
    }
    const sessionsPayload = sessionsResponse.ok ? await sessionsResponse.json() : [];
    const sessions = contentRows(sessionsPayload);
    userSessions.splice(0, userSessions.length, ...sessions.map((session) => ({
      title: session.book?.title || `세션 #${session.sessionId}`,
      library: session.library?.libraryName || "도서관",
      minutes: session.durationMinutes || 0,
      pages: session.startPage && session.endPage ? `p.${session.startPage}-${session.endPage}` : "페이지 미입력",
      date: session.completedAt || session.createdAt || "",
    })));
    const booksPayload = booksResponse.ok ? await booksResponse.json() : [];
    const bookRows = contentRows(booksPayload);
    const shelfRows = bookRows.length ? bookRows : sessions.map((session) => ({
      bookId: session.book?.bookId || session.bookId || session.sessionId,
      title: session.book?.title || `세션 #${session.sessionId}`,
      author: session.book?.author || "",
      publisher: session.book?.publisher || "",
      coverImageUrl: session.book?.coverImageUrl || "",
      minutes: session.durationMinutes || 0,
      review: session.reviewText || session.verification?.reviewText || "",
      library: session.library?.libraryName || "도서관",
      pages: session.startPage && session.endPage ? `p.${session.startPage}-${session.endPage}` : "페이지 미입력",
      date: session.completedAt || session.createdAt || "",
    }));
    userBooks.splice(0, userBooks.length, ...shelfRows);
    const contributionPayload = librariesResponse.ok ? await librariesResponse.json() : [];
    const contributionRows = contentRows(contributionPayload);
    userContributions.splice(0, userContributions.length, ...contributionRows.map((row) => ({
      name: row.library?.libraryName || "도서관",
      address: row.library?.address || "",
      distance: `${formatNumber(row.scoreDelta)} pt`,
      date: row.createdAt || row.loggedAt || "",
    })));
    if (state.myTab === "books") state.myPageInfo = bookRows.length ? pageInfo(booksPayload) : pageInfo(sessionsPayload);
    if (state.myTab === "sessions") state.myPageInfo = pageInfo(sessionsPayload);
    if (state.myTab === "libraries") state.myPageInfo = pageInfo(contributionPayload);
    state.myDataStatus = "loaded";
    render();
  } catch {
    state.myDataStatus = "error";
  }
}

async function loadRankings({ force = false } = {}) {
  if (!state.authUser && state.authStatus !== "loading") {
    await loadCurrentUser();
  }
  const serverFactionId = state.authUser?.factionId || state.authUser?.faction?.factionId;
  if (state.selectedFaction && state.authUser && String(serverFactionId || "") !== String(state.selectedFaction)) {
    const synced = await syncSelectedFactionToServer({ silent: true, keepRankingStatus: true });
    force = true;
    if (!synced) {
      const selected = factionById(state.selectedFaction);
      const displayName = state.authUser?.name || state.authUser?.email?.split("@")[0] || "정태민";
      userRankings.splice(0, userRankings.length, {
        name: displayName,
        factionName: selected?.name || "",
        exp: state.exp || 0,
        booksRead: 0,
      });
      state.rankingStatus = "loaded";
      render();
      return;
    }
  }
  if (!force && (state.rankingStatus === "loading" || state.rankingStatus === "loaded")) return;
  state.rankingStatus = "loading";
  try {
    const query = new URLSearchParams({ page: String(state.rankingPage), size: "5" });
    const [usersResponse, factionsResponse] = await Promise.all([
      fetchWithTimeout(await apiUrl(`/api/ranking/users?${query.toString()}`), {}, 6000),
      fetchWithTimeout(await apiUrl(`/api/ranking/factions?${query.toString()}`), {}, 6000),
    ]);
    const usersPayload = usersResponse.ok ? await usersResponse.json() : [];
    const factionsPayload = factionsResponse.ok ? await factionsResponse.json() : [];
    state.rankingPageInfo = pageInfo(state.rankingTab === "users" ? usersPayload : factionsPayload);
    userRankings.splice(0, userRankings.length, ...contentRows(usersPayload));
    factionRankings.splice(0, factionRankings.length, ...contentRows(factionsPayload));
    state.rankingStatus = "loaded";
    render();
  } catch {
    state.rankingStatus = "error";
  }
}

function startReadingTicker() {
  if (!state.activeSession || state.timerId) return;
  state.timerId = window.setInterval(() => {
    state.timerElapsedSeconds = Math.floor((Date.now() - state.timerStartedAt) / 1000);
    if (state.timerElapsedSeconds % 30 === 0) pingReadingLocation();
    render();
  }, 1000);
}

function stopReadingTicker() {
  if (!state.timerId) return;
  window.clearInterval(state.timerId);
  state.timerId = null;
}

async function pingReadingLocation() {
  if (!state.activeSession || !state.location) return;
  try {
    const response = await fetchWithTimeout(await apiUrl("/api/sessions/ping"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: state.activeSession.sessionId,
        latitude: state.location.latitude,
        longitude: state.location.longitude,
        accuracyMeters: state.locationAccuracy || 0,
      }),
    }, 6000);
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      if (payload.isOutOfRange) {
        state.outOfRangeCount += 1;
        state.locationWarning = state.outOfRangeCount >= 2
          ? "도서관 반경을 연속으로 벗어나 세션을 취소합니다."
          : "도서관 반경을 벗어났습니다. 다음 확인 때도 벗어나면 자동 취소됩니다.";
        if (state.outOfRangeCount >= 2) {
          await cancelReadingSession({ auto: true });
        }
      } else {
        state.outOfRangeCount = 0;
        state.locationWarning = "";
        state.sessionMessage = `위치 확인 완료 · ${formatNumber(payload.distanceFromLibrary)}m`;
      }
    }
  } catch {}
}

async function addTestReadingMinutes() {
  if (!state.activeSession) return;
  state.sessionMessage = "테스트 시간 10분을 추가하는 중입니다.";
  render();
  try {
    const response = await fetchWithTimeout(await apiUrl(`/api/sessions/${state.activeSession.sessionId}/test-add-minutes`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: 10 }),
    }, 8000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "테스트 시간을 추가하지 못했습니다.");
    const durationSeconds = Math.max(0, Number(payload.durationMinutes || 0) * 60);
    state.timerStartedAt = Date.now() - durationSeconds * 1000;
    state.timerElapsedSeconds = durationSeconds;
    state.activeSession = {
      ...state.activeSession,
      status: payload.status || state.activeSession.status,
      startTime: payload.startTime || state.activeSession.startTime,
    };
    state.sessionMessage = `테스트 시간 +10분 · 현재 ${formatNumber(payload.durationMinutes)}분`;
    render();
  } catch (error) {
    state.sessionMessage = error.message || "테스트 시간을 추가하지 못했습니다.";
    render();
  }
}

async function scanIsbn() {
  const detectorClass = window.BarcodeDetector;
  if (!detectorClass || !navigator.mediaDevices?.getUserMedia) {
    state.scannerMessage = "이 브라우저에서는 바코드 스캔을 지원하지 않습니다. ISBN 직접 입력 모드로 진행해 주세요.";
    render();
    app.querySelector('#session-start-form input[name="isbn"]')?.focus();
    return;
  }

  state.scannerMessage = "카메라 권한을 요청하는 중입니다.";
  render();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    const detector = new detectorClass({ formats: ["ean_13", "ean_8", "code_128"] });
    const startedAt = Date.now();
    let found = "";
    while (!found && Date.now() - startedAt < 10000) {
      const codes = await detector.detect(video).catch(() => []);
      found = codes[0]?.rawValue || "";
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    stream.getTracks().forEach((track) => track.stop());
    if (found) {
      state.sessionIsbn = found;
      state.scannerMessage = `ISBN ${found} 스캔 완료`;
    } else {
      state.scannerMessage = "바코드를 찾지 못했습니다. ISBN을 직접 입력해 주세요.";
    }
    render();
  } catch {
    state.scannerMessage = "카메라를 사용할 수 없습니다. ISBN을 직접 입력해 주세요.";
    render();
  }
}

async function submitVerification(form) {
  if (!state.activeSession) return;
  state.sessionMessage = "인증 정보를 제출하는 중입니다.";
  render();
  try {
    const sessionId = state.activeSession.sessionId;
    let response = await fetchWithTimeout(await apiUrl(`/api/sessions/${sessionId}/submit`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }, 8000);
    let payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "인증 제출 실패");

    response = await fetchWithTimeout(await apiUrl("/api/verify/llm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, reviewText: form.reviewText }),
    }, 15000);
    payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "감상평 검증 실패");

    response = await fetchWithTimeout(await apiUrl(`/api/sessions/${sessionId}/complete`), {
      method: "POST",
    }, 8000);
    payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "인증 완료 실패");
    state.verificationResult = payload;
    state.activeSession = null;
    state.myDataStatus = "idle";
    state.rankingStatus = "idle";
    setScreen("result");
  } catch (error) {
    state.sessionMessage = error.message || "인증 처리에 실패했습니다.";
    render();
  }
}

async function cancelReadingSession({ auto = false } = {}) {
  if (!state.activeSession) {
    setScreen("home");
    return;
  }
  try {
    const sessionId = state.activeSession.sessionId;
    const response = await fetchWithTimeout(await apiUrl(`/api/sessions/${sessionId}/cancel`), {
      method: "POST",
    }, 8000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "세션 취소 실패");
    state.activeSession = null;
    state.confirmCancelSession = false;
    state.timerElapsedSeconds = 0;
    state.sessionMessage = auto ? "위치 이탈로 독서 세션이 취소되었습니다." : payload.message || "독서 세션이 취소되었습니다.";
    state.locationWarning = "";
    state.outOfRangeCount = 0;
    state.myDataStatus = "idle";
    stopReadingTicker();
    setScreen("home");
  } catch (error) {
    state.sessionMessage = error.message || "독서 세션을 취소하지 못했습니다.";
    render();
  }
}

function formatNumber(value) {
  return Math.max(0, Number(value) || 0).toLocaleString("ko-KR");
}

function formatReadingTime(minutes) {
  const totalMinutes = Math.max(0, Number(minutes) || 0);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 미제공";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function safeColor(value) {
  const color = String(value || "");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#32d17a";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadConfig() {
  if (state.configStatus === "loaded") return state.config;
  if (state.configStatus === "loading") return null;

  state.configStatus = "loading";
  try {
    const response = await fetchWithTimeout(await apiUrl("/api/config"), {}, 6000);
    if (!response.ok) throw new Error("설정 정보를 불러오지 못했습니다");
    state.config = await response.json();
    state.configStatus = "loaded";
    return state.config;
  } catch (error) {
    state.configStatus = "error";
    state.config = { kakaoJsKey: "", hasKakaoRestKey: false };
    throw error;
  }
}

async function loadCurrentUser() {
  if (state.authStatus === "loading" || state.authStatus === "loaded") return;

  consumeAuthRedirectTokens();
  state.authStatus = "loading";
  try {
    const response = await fetchWithTimeout(await apiUrl("/api/auth/me"), {}, 6000);
    if (!response.ok) throw new Error("로그인 상태를 확인하지 못했습니다");
    const payload = await response.json();
    state.authUser = payload.user || null;
    if (state.authUser?.nickname) {
      state.nickname = state.authUser.nickname;
      state.nicknameStatus = "available";
      saveProfile();
    }
    if (state.authUser?.factionId) {
      state.selectedFaction = state.authUser.factionId;
      saveProfile();
    }
    state.authStatus = "loaded";

    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success" && state.authUser) {
      window.history.replaceState({}, "", window.location.pathname);
      setScreen(state.authUser.onboardingCompleted ? "home" : "nickname");
    }
  } catch {
    state.authStatus = "idle";
  }
}

function consumeAuthRedirectTokens() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = params.get("accessToken");
  const refreshToken = params.get("refreshToken");
  if (!accessToken || !refreshToken) return;
  saveTokens({ accessToken, refreshToken });
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
}

async function syncSelectedFactionToServer({ silent = false, keepRankingStatus = false } = {}) {
  if (!state.selectedFaction || !state.authUser) return false;
  try {
    const response = await fetchWithTimeout(await apiUrl("/api/users/faction"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factionId: state.selectedFaction }),
    }, 6000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "진영 선택 저장 실패");
    state.authUser = {
      ...state.authUser,
      factionId: payload.faction?.factionId || state.selectedFaction,
      faction: payload.faction || state.authUser.faction,
      onboardingCompleted: true,
    };
    if (!keepRankingStatus) state.rankingStatus = "idle";
    state.myDataStatus = "idle";
    return true;
  } catch (error) {
    if (!silent) {
      state.sessionMessage = error.message || "진영 선택을 서버에 저장하지 못했습니다.";
      render();
    }
    return false;
  }
}

async function startGoogleLogin() {
  state.loginError = "Google 로그인 서버를 확인하는 중입니다.";
  render();

  try {
    const response = await fetchWithTimeout(await apiUrl("/api/config"), {
      headers: {
        Accept: "application/json",
      },
    }, 5000);
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/json")) {
      throw new Error("LIBCON 앱 서버가 아니라 정적 파일 서버에서 실행 중입니다.");
    }

    const config = await response.json();
    if (!config.hasGoogleClientId) {
      throw new Error("GOOGLE_CLIENT_ID가 설정되지 않았습니다.");
    }
    if (!config.googleOAuthReady) {
      throw new Error(config.googleOAuthError || "INVALID_GOOGLE_CLIENT_ID");
    }

    const idTokenLoginWorked = await startGoogleIdTokenLogin(config.googleClientId);
    if (idTokenLoginWorked) return;
    window.location.assign(await apiUrl("/api/auth/google/start"));
  } catch (error) {
    state.loginError = friendlyLoginError(error);
    render();
  }
}

async function startGoogleIdTokenLogin(clientId) {
  if (!clientId) return false;
  try {
    await loadGoogleIdentityScript();
    if (!window.google?.accounts?.id) return false;
    state.loginError = "Google 계정을 확인하는 중입니다.";
    render();
    const credential = await new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => done(response?.credential || ""),
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) done("");
      });
      window.setTimeout(() => done(""), 8000);
    });
    if (!credential) return false;
    const response = await fetchWithTimeout(await apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: credential }),
    }, 8000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Google ID Token 로그인 실패");
    saveTokens({
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
    });
    state.authStatus = "idle";
    await loadCurrentUser();
    setScreen(payload.onboardingCompleted ? "home" : "nickname");
    return true;
  } catch {
    return false;
  }
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadLibraries({ force = false, useExistingLocation = false } = {}) {
  if (state.screen !== "home") return;
  if (!force && (state.libraryStatus === "loading" || state.libraryStatus === "loaded")) return;

  state.libraryStatus = "loading";
  state.libraryError = "";
  render();

  try {
    await loadConfig();
    const location = useExistingLocation && state.location
      ? {
          coords: state.location,
          source: state.locationSource || "manual",
          accuracy: state.locationAccuracy,
        }
      : await resolveLocation();
    state.location = location.coords;
    state.locationSource = location.source;
    state.locationAccuracy = location.accuracy ?? null;
    render();

    const params = new URLSearchParams({
      lat: String(location.coords.latitude),
      lng: String(location.coords.longitude),
      radius: "all",
    });
    if (state.activeLibraryQuery) {
      params.set("query", state.activeLibraryQuery);
    }
    const response = await fetchWithTimeout(await apiUrl(`/api/libraries?${params.toString()}`), {}, 12000);
    let payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "도서관 API 호출에 실패했습니다");
    }

    state.libraries = placeLibrariesOnFallbackMap(payload.libraries || [], location.coords);
    state.selectedLibrary = state.libraries[0]?.id ?? null;
    state.libraryStatus = "loaded";
    render();
  } catch (error) {
    state.libraryStatus = "error";
    state.libraryError = friendlyError(error);
    render();
  }
}

function resolveLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation?.watchPosition) {
      resolve({ coords: defaultLocation, source: "default", accuracy: null });
      return;
    }

    let bestPosition = null;
    let settled = false;
    let watchId = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timeoutId);
      resolve(result);
    };
    const timeoutId = setTimeout(() => {
      finish(bestPosition
        ? positionResult(bestPosition)
        : { coords: defaultLocation, source: "default", accuracy: null });
    }, 8000);

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
          bestPosition = position;
        }
        if (position.coords.accuracy <= 60) finish(positionResult(position));
      },
      () => {
        if (!bestPosition) finish({ coords: defaultLocation, source: "default", accuracy: null });
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 },
    );
  });
}

function positionResult(position) {
  return {
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    },
    source: "current",
    accuracy: position.coords.accuracy,
  };
}

function placeLibrariesOnFallbackMap(libraries, center) {
  const maxOffset = 0.045;
  return libraries.map((library) => {
    const dx = (library.longitude - center.longitude) / maxOffset;
    const dy = (library.latitude - center.latitude) / maxOffset;
    return {
      ...library,
      mapX: clamp(50 + dx * 42, 12, 88),
      mapY: clamp(50 - dy * 42, 14, 82),
    };
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function friendlyError(error) {
  const message = error?.message || "";
  if (message.includes("OPEN_MAP_AND_LOCAL")) {
    return "카카오 개발자 콘솔에서 이 앱의 카카오맵 사용 설정을 ON으로 변경해 주세요.";
  }
  if (error?.name === "AbortError" || message.includes("timed out")) {
    return "API 응답 시간이 초과되었습니다";
  }
  if (message.includes("Failed to fetch")) {
    return "로컬 API 서버에 연결할 수 없습니다";
  }
  return message || "도서관 데이터를 불러오지 못했습니다";
}

function friendlyLoginError(error) {
  const message = error?.message || "";
  if (message.includes("INVALID_GOOGLE_CLIENT_ID")) {
    return "현재 GOOGLE_CLIENT_ID가 OAuth 클라이언트 ID 형식이 아닙니다. Google Cloud Console에서 '웹 애플리케이션' OAuth 클라이언트를 만든 뒤, .apps.googleusercontent.com으로 끝나는 클라이언트 ID를 .env에 입력해 주세요.";
  }
  if (message.includes("LIBCON_API_NOT_FOUND")) {
    return "LIBCON API 서버가 꺼져 있습니다. start-libcon.bat을 더블클릭한 뒤 열린 localhost 화면에서 다시 눌러주세요.";
  }
  if (message.includes("정적 파일 서버")) {
    return "현재 서버에는 로그인 API가 없습니다. start-libcon.bat으로 실행한 http://localhost:5173/에서 열어주세요.";
  }
  if (message.includes("GOOGLE_CLIENT_ID")) {
    return "Google OAuth 키가 아직 없습니다. Google Cloud Console에서 발급받은 CLIENT_ID와 CLIENT_SECRET을 .env에 입력해 주세요.";
  }
  if (error?.name === "AbortError" || message.includes("timed out")) {
    return "로그인 API 응답 시간이 초과되었습니다. 로컬 서버가 켜져 있는지 확인해 주세요.";
  }
  if (message.includes("Failed to fetch")) {
    return "로그인 API 서버에 연결할 수 없습니다. start-libcon.bat을 더블클릭해 서버를 다시 실행해 주세요.";
  }
  return message || "Google 로그인을 시작하지 못했습니다.";
}

async function apiUrl(path) {
  const base = await detectApiBase();
  return `${base}${path}`;
}

async function detectApiBase() {
  if (resolvedApiBase !== null) return resolvedApiBase;
  if (apiBasePromise) return apiBasePromise;

  apiBasePromise = (async () => {
    const currentOrigin = window.location.protocol === "file:" ? "" : window.location.origin;
    const candidates = unique([
      currentOrigin,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ]);

    for (const base of candidates) {
      try {
        const url = `${base}/api/config`;
        const response = await fetchWithTimeout(url, {
          headers: { Accept: "application/json" },
        }, 2500);
        const contentType = response.headers.get("content-type") || "";
        if (response.ok && contentType.includes("application/json")) {
          resolvedApiBase = base;
          return base;
        }
      } catch {}
    }

    throw new Error("LIBCON_API_NOT_FOUND");
  })();

  try {
    return await apiBasePromise;
  } finally {
    apiBasePromise = null;
  }
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const requestOptions = withAuthHeader(url, {
    ...options,
    signal: controller.signal,
  });
  return fetch(url, requestOptions)
    .then(async (response) => {
      if (response.status === 401 && shouldAttachAuth(url) && getStoredTokens().refreshToken && !options.skipAuthRefresh) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          return fetch(url, withAuthHeader(url, { ...options, signal: controller.signal, skipAuthRefresh: true }));
        }
      }
      return response;
    })
    .finally(() => clearTimeout(timeoutId));
}

function shouldAttachAuth(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname.startsWith("/api/") && !parsed.pathname.startsWith("/api/auth/google");
  } catch {
    return false;
  }
}

function withAuthHeader(url, options = {}) {
  const { skipAuthRefresh, ...fetchOptions } = options;
  const token = getStoredTokens().accessToken;
  if (!token || !shouldAttachAuth(url)) return fetchOptions;
  return {
    ...fetchOptions,
    headers: {
      ...(fetchOptions.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  };
}

async function refreshAccessToken() {
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) return false;
  try {
    const response = await fetch(await apiUrl("/api/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.accessToken) return false;
    saveTokens({ ...getStoredTokens(), accessToken: payload.accessToken });
    return true;
  } catch {
    return false;
  }
}

function initMapIfPossible() {
  const node = document.querySelector("#kakao-map");
  if (!node || !state.config?.kakaoJsKey || !state.location) return;

  loadKakaoSdk(state.config.kakaoJsKey)
    .then(() => {
      state.mapStatus = "loaded";
      const center = new kakao.maps.LatLng(state.location.latitude, state.location.longitude);
      kakaoMapInstance = new kakao.maps.Map(node, {
        center,
        level: 5,
      });
      kakao.maps.event.addListener(kakaoMapInstance, "click", (mouseEvent) => {
        if (!state.mapSelectMode) return;
        const selected = mouseEvent.latLng;
        state.location = {
          latitude: selected.getLat(),
          longitude: selected.getLng(),
        };
        state.locationSource = "manual";
        state.locationAccuracy = 0;
        state.mapSelectMode = false;
        state.libraryStatus = "idle";
        state.mapStatus = "idle";
        loadLibraries({ force: true, useExistingLocation: true });
      });

      kakaoMarkerInstances.forEach((marker) => marker.setMap(null));
      kakaoMarkerInstances = [];

      const userMarker = new kakao.maps.Marker({
        map: kakaoMapInstance,
        position: center,
        title: "내 위치",
      });
      kakaoMarkerInstances.push(userMarker);

      const nearbyCounts = clusterCountByLibrary(state.libraries);
      state.libraries.forEach((library) => {
        const labelColor = safeColor(library.currentOccupiedFaction?.color || "#32d17a");
        const nearbyCount = nearbyCounts.get(String(library.id)) || 1;
        const marker = new kakao.maps.Marker({
          map: kakaoMapInstance,
          position: new kakao.maps.LatLng(library.latitude, library.longitude),
          title: library.name,
        });
        const overlay = new kakao.maps.CustomOverlay({
          map: kakaoMapInstance,
          position: marker.getPosition(),
          yAnchor: 1.65,
          content: `<button class="kakao-label" data-library-id="${library.id}" style="--pin:${labelColor}">${nearbyCount > 1 ? `${nearbyCount}곳` : library.shortName}</button>`,
        });
        kakaoMarkerInstances.push(marker, overlay);
      });

      node.querySelectorAll(".kakao-label").forEach((label) => {
        label.addEventListener("click", () => {
          state.selectedLibrary = label.dataset.libraryId;
          setScreen("detail");
        });
      });
    })
    .catch(() => {
      if (state.mapStatus === "error") return;
      state.mapStatus = "error";
      render();
    });
}

function clusterCountByLibrary(libraries) {
  const counts = new Map();
  libraries.forEach((library) => {
    const nearby = libraries.filter((other) => distanceBetweenLibraryPoints(library, other) < 180);
    counts.set(String(library.id), nearby.length);
  });
  return counts;
}

function distanceBetweenLibraryPoints(a, b) {
  const dx = (Number(a.longitude) - Number(b.longitude)) * 88000;
  const dy = (Number(a.latitude) - Number(b.latitude)) * 111000;
  return Math.sqrt(dx * dx + dy * dy);
}

function loadKakaoSdk(appKey) {
  if (window.kakao?.maps) {
    return Promise.resolve();
  }
  if (kakaoSdkPromise) return kakaoSdkPromise;

  kakaoSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps) {
        reject(new Error("KAKAO_MAP_SDK_UNAVAILABLE"));
        return;
      }
      window.kakao.maps.load(resolve);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return kakaoSdkPromise;
}

render();
