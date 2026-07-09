const factions = [
  {
    id: 1,
    name: "붉은 독서단",
    color: "#ff554a",
    desc: "열정으로 서가를 불태우는 진영",
    members: 127,
    joinType: "자유",
    influence: 30,
    occupied: 128,
    totalInfluence: 5420,
  },
  {
    id: 2,
    name: "청람 서생",
    color: "#3ba7ee",
    desc: "차분하게 전략적으로 정복하는 독서 진영",
    members: 98,
    joinType: "승인",
    influence: 55,
    occupied: 112,
    totalInfluence: 4980,
  },
  {
    id: 3,
    name: "녹림 독객",
    color: "#32d17a",
    desc: "자유롭게 어디서든 읽는 독서 진영",
    members: 74,
    joinType: "자유",
    influence: 18,
    occupied: 87,
    totalInfluence: 3760,
  },
  {
    id: 4,
    name: "자황 문파",
    color: "#b45be6",
    desc: "지식의 정수를 추구하는 엘리트 독서단",
    members: 53,
    joinType: "승인",
    influence: 12,
    occupied: 64,
    totalInfluence: 2840,
  },
];

const PROFILE_STORAGE_KEY = "libcon-profile-v1";
const savedProfile = loadSavedProfile();
if (Array.isArray(savedProfile.customFactions)) {
  savedProfile.customFactions.forEach((faction) => {
    if (faction?.id && faction?.name) factions.push(faction);
  });
}

const books = [
  {
    title: "객체지향의 사실과 오해",
    author: "조영호",
    publisher: "위키북스",
    minutes: 80,
    review: "객체의 역할과 책임을 이해하는 데 도움이 되었다.",
    library: "서울 중앙도서관",
    pages: "p.15-72",
    status: "인증",
    date: "2026-07-07",
  },
  {
    title: "클린 코드",
    author: "로버트 C. 마틴",
    publisher: "인사이트",
    minutes: 120,
    review: "함수와 변수명의 중요성을 다시 생각하게 해준 책.",
    library: "마포 어울림 도서관",
    pages: "p.88-134",
    status: "인증",
    date: "2026-07-05",
  },
  {
    title: "사피엔스",
    author: "유발 하라리",
    publisher: "김영사",
    minutes: 95,
    review: "인류 역사의 거시적 흐름이 흥미로웠다.",
    library: "서울 중앙도서관",
    pages: "p.200-240",
    status: "실패",
    date: "2026-06-28",
  },
];

const userRanks = [
  ["ReaderKing", "청람 서생", 1240, "32권"],
  ["BookMaster", "붉은 독서단", 1100, "28권"],
  ["PhilBiblos", "자황 문파", 980, "24권"],
  ["서재의신", "녹림 독객", 750, "18권"],
  ["JungTem", "청람 서생", 720, "17권"],
  ["책벌레99", "붉은 독서단", 680, "16권"],
  ["Logos", "자황 문파", 610, "15권"],
  ["민독서", "녹림 독객", 540, "13권"],
];

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
  myTab: "books",
  config: null,
  configStatus: "idle",
  libraries: [],
  libraryStatus: "idle",
  libraryError: "",
  location: null,
  locationSource: "",
  mapStatus: "idle",
  authUser: null,
  authStatus: "idle",
  loginError: "",
};

const app = document.querySelector("#app");
let resolvedApiBase = null;
let apiBasePromise = null;

let kakaoSdkPromise = null;
let kakaoMapInstance = null;
let kakaoMarkerInstances = [];

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
    onboarding: renderOnboarding,
    createFaction: renderCreateFaction,
    guide: renderGuide,
    home: renderHome,
    detail: renderDetail,
    ranking: renderRanking,
    my: renderMyPage,
  };
  app.innerHTML = renderers[state.screen]();
  bindEvents();
  afterRender();
}

function afterRender() {
  if (state.screen === "login") {
    loadCurrentUser();
  }
  if (state.screen === "home") {
    loadLibraries();
    requestAnimationFrame(initMapIfPossible);
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
        ${factions.map(renderFactionCard).join("")}
      </div>
      <button class="ghost-button" data-action="create-faction" style="width:100%; margin-top:16px">새 진영 생성하기</button>
      <button class="primary-button" data-action="guide" style="margin-top:14px" ${canContinue ? "" : "disabled"}>
        ${canContinue ? "이 진영으로 시작하기" : "진영을 선택하세요"}
      </button>
    </section>
  `;
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
  const active = state.selectedFaction === faction.id ? " active" : "";
  return `
    <button class="faction-card${active}" data-action="select-faction" data-id="${escapeHtml(faction.id)}" style="color:${safeColor(faction.color)}">
      <span class="faction-icon"><span class="shield-icon"></span></span>
      <span>
        <strong class="faction-name">${escapeHtml(faction.name)}</strong>
        <span class="faction-desc">${escapeHtml(faction.desc)}</span>
      </span>
      <span class="faction-meta">
        <strong>${Math.max(1, Number(faction.members) || 1)}명</strong>
        <span>${escapeHtml(faction.joinType)}</span>
      </span>
    </button>
  `;
}

function renderGuide() {
  const items = [
    ["도서관 탐색", "지도에서 주변 도서관을 발견하고 점령 현황을 확인하세요."],
    ["100m 체크인", "도서관 반경 100m 이내에서만 독서 세션을 시작할 수 있습니다."],
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
  const selectedFaction = factionById(state.selectedFaction) || factions[0];
  return `
    <section class="screen">
      <div class="top-row">
        <div>
          <p class="eyebrow">LIBCON</p>
          <h1 class="screen-title small">주변 도서관 <span class="chip" style="color:${safeColor(selectedFaction.color)}">${escapeHtml(selectedFaction.name)}</span></h1>
        </div>
        <span class="chip exp-pill">${formatNumber(state.exp)} EXP</span>
      </div>
      ${renderMapPanel()}
      ${renderLocationNotice()}
      <div class="library-list">
        ${renderLibraryList()}
      </div>
      ${renderBottomNav("home")}
    </section>
  `;
}

function renderMapPanel() {
  const canUseKakaoMap = Boolean(state.config?.kakaoJsKey);
  if (canUseKakaoMap) {
    return `
      <div class="map-panel real-map">
        <div id="kakao-map" class="map-canvas" aria-label="카카오 지도"></div>
        <span class="chip radius-chip">반경 5km</span>
        ${renderMapStatus()}
      </div>
    `;
  }

  return `
    <div class="map-panel">
      <span class="road one"></span>
      <span class="road two"></span>
      <span class="road three"></span>
      <span class="chip radius-chip">반경 5km</span>
      ${state.libraries.map(renderFallbackPin).join("")}
      <span class="me-dot" title="내 위치"></span>
      <div class="legend">
        <span><i class="dot"></i>내 위치</span>
        <span><i class="dot empty"></i>외부 API 도서관</span>
      </div>
      ${renderMapStatus()}
    </div>
  `;
}

function renderMapStatus() {
  if (state.mapStatus === "error") {
    return `<div class="map-status error">카카오 지도 SDK를 불러오지 못했습니다. JavaScript 키와 등록 도메인을 확인해 주세요.</div>`;
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
  return `
    <button class="pin external-pin" data-action="library-detail" data-id="${library.id}" style="left:${x}%; top:${y}%;" aria-label="${library.name}">
      <span class="book-icon"></span>
      <label>${library.shortName}</label>
    </button>
  `;
}

function renderLocationNotice() {
  if (!state.locationSource) return "";
  const text =
    state.locationSource === "current"
      ? "현재 위치 기준으로 카카오 로컬 API에서 도서관을 검색했습니다."
      : "위치 권한이 없어서 서울 시청 기준으로 도서관을 검색했습니다.";
  return `<p class="api-note">${text}</p>`;
}

function renderLibraryList() {
  if (state.libraryStatus === "loading") {
    return `
      <article class="library-card skeleton-card">
        <span class="faction-icon"><span class="book-icon"></span></span>
        <span>
          <h3>도서관 검색 중</h3>
          <span class="muted">카카오 로컬 API 호출</span>
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
        <h3>반경 5km 안에서 도서관을 찾지 못했습니다</h3>
        <button class="ghost-button" data-action="reload-libraries" style="width:100%; margin-top:14px">다시 불러오기</button>
      </article>
    `;
  }

  return state.libraries.slice(0, 8).map(renderLibraryCard).join("");
}

function renderLibraryCard(library) {
  return `
    <button class="library-card" data-action="library-detail" data-id="${library.id}">
      <span class="faction-icon external-icon"><span class="book-icon"></span></span>
      <span>
        <h3>${library.name}</h3>
        <span class="muted">${library.distance} · ${library.address}</span>
      </span>
      <span class="chip">외부 API</span>
      <i class="chevron"></i>
    </button>
  `;
}

function renderDetail() {
  const library = libraryById(state.selectedLibrary) || state.libraries[0];
  if (!library) {
    return `
      <section class="screen no-nav">
        <button class="icon-button" data-action="home" aria-label="뒤로"><span class="arrow-icon"></span></button>
        <article class="info-card" style="margin-top:24px">
          <h1>도서관 정보가 없습니다</h1>
          <p class="small-text">지도 화면에서 도서관을 다시 선택해 주세요.</p>
        </article>
      </section>
    `;
  }

  const inRange = library.distanceMeters <= 100;
  return `
    <section class="screen no-nav">
      <div class="detail-top">
        <button class="icon-button" data-action="home" aria-label="뒤로"><span class="arrow-icon"></span></button>
        <div>
          <h1>${library.name}</h1>
          <p>${library.address}</p>
        </div>
      </div>
      <article class="info-card occupation-card">
        <span class="faction-icon external-icon"><span class="library-icon"></span></span>
        <span>
          <p class="section-kicker">연동 소스</p>
          <h2>카카오 로컬</h2>
          <span class="muted">실시간 장소 검색 결과</span>
        </span>
        <strong>${library.distance}</strong>
      </article>
      <article class="info-card">
        <p class="section-kicker">외부 API 데이터</p>
        <div class="info-grid">
          <span class="info-line"><i class="library-icon"></i><span>장소명</span><strong>${library.name}</strong></span>
          <span class="info-line"><i class="book-icon"></i><span>전화번호</span><strong>${library.phone || "미제공"}</strong></span>
          <span class="info-line"><i class="clock-icon"></i><span>거리</span><strong>${library.distance}</strong></span>
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
      <button class="primary-button" ${inRange ? "" : "disabled"}>
        <span class="${inRange ? "book-icon" : "lock-icon"}"></span>
        <span>${inRange ? "독서 시작하기" : `100m 이내로 이동하세요 (${library.distance})`}</span>
      </button>
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
      ${renderBottomNav("ranking")}
    </section>
  `;
}

function renderUserRanks() {
  return userRanks
    .map(([name, factionName, score, booksRead], index) => {
      const faction = factions.find((item) => item.name === factionName);
      return `
        <article class="ranking-card">
          <span class="rank-number">${index + 1}</span>
          <span>
            <h3>${name}</h3>
            <span class="small-text" style="color:${faction.color}">${factionName}</span>
          </span>
          <span class="rank-score">${score}<br><small class="muted">${booksRead}</small></span>
        </article>
      `;
    })
    .join("");
}

function renderFactionRanks() {
  return factions
    .map(
      (faction, index) => `
      <article class="ranking-card">
        <span class="rank-number">${index + 1}</span>
        <span>
          <h3 style="color:${safeColor(faction.color)}">${escapeHtml(faction.name)}</h3>
          <span class="small-text">${escapeHtml(faction.desc)}</span>
        </span>
        <span class="rank-score">${faction.occupied}개<br><small class="muted">${faction.totalInfluence.toLocaleString()} pt</small></span>
      </article>
    `,
    )
    .join("");
}

function renderMyPage() {
  const selectedFaction = factionById(state.selectedFaction) || factions[0];
  const displayName = state.authUser?.name || state.authUser?.email?.split("@")[0] || "독서가";
  return `
    <section class="screen profile-section">
      <div class="profile-main">
        <div class="avatar">ㅇ</div>
        <div>
          <h1>${escapeHtml(displayName)}</h1>
          <span class="chip" style="color:${selectedFaction.color}"><span class="shield-icon"></span>${escapeHtml(selectedFaction.name)}</span>
        </div>
        <div class="exp">${formatNumber(state.exp)}<br><small class="muted">EXP</small></div>
      </div>
      <div class="stats">
        <article class="stat-card"><span><strong>18</strong><span class="muted">독서 권수</span></span></article>
        <article class="stat-card"><span><strong>38h</strong><span class="muted">총 독서</span></span></article>
        <article class="stat-card"><span><strong>${Math.max(state.libraries.length, 5)}개</strong><span class="muted">기여 도서관</span></span></article>
      </div>
      <div class="tabs" style="--count:3">
        <button class="tab-button ${state.myTab === "books" ? "active" : ""}" data-action="my-tab" data-tab="books">내 서재</button>
        <button class="tab-button ${state.myTab === "sessions" ? "active" : ""}" data-action="my-tab" data-tab="sessions">독서 기록</button>
        <button class="tab-button ${state.myTab === "libraries" ? "active" : ""}" data-action="my-tab" data-tab="libraries">기여 도서관</button>
      </div>
      <div class="book-list">
        ${renderMyContent()}
      </div>
      ${renderBottomNav("my")}
    </section>
  `;
}

function renderMyContent() {
  if (state.myTab === "sessions") {
    return books
      .map(
        (book) => `
          <article class="book-card">
            <span class="book-cover"><span class="book-icon"></span></span>
            <span>
              <h3>${book.title}</h3>
              <p class="small-text">${book.library}</p>
              <p class="small-text">${book.minutes}분 ${book.pages}</p>
              <p class="review"><span class="status ${book.status === "인증" ? "pass" : "fail"}">${book.status}</span> · ${book.date}</p>
            </span>
          </article>
        `,
      )
      .join("");
  }

  if (state.myTab === "libraries") {
    if (state.libraries.length) {
      return state.libraries.slice(0, 5).map(renderContributionCard).join("");
    }
    return `<article class="info-card"><h3>아직 불러온 도서관이 없습니다</h3><p class="small-text">지도 탭에서 외부 API 도서관을 먼저 불러와 주세요.</p></article>`;
  }

  return books
    .map(
      (book) => `
        <article class="book-card">
          <span class="book-cover"><span class="book-icon"></span></span>
          <span>
            <h3>${book.title}</h3>
            <p class="small-text">${book.author} · ${book.publisher}</p>
            <p class="small-text">${book.minutes}분 읽음</p>
            <p class="review">"${book.review}"</p>
          </span>
        </article>
      `,
    )
    .join("");
}

function renderContributionCard(library) {
  return `
    <article class="book-card">
      <span class="book-cover external-icon"><span class="library-icon"></span></span>
      <span>
        <h3>${library.name}</h3>
        <p class="small-text">${library.address}</p>
        <p class="review">
          <span class="chip">외부 API</span>
          <span class="chip">거리 ${library.distance}</span>
        </p>
      </span>
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
    element.addEventListener("click", () => {
      const action = element.dataset.action;
      if (action === "login") startGoogleLogin();
      if (action === "guide") setScreen("guide");
      if (action === "home") setScreen("home");
      if (action === "ranking") setScreen("ranking");
      if (action === "my") setScreen("my");
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
        render();
      }
      if (action === "my-tab") {
        state.myTab = element.dataset.tab;
        render();
      }
      if (action === "reload-libraries") {
        state.libraryStatus = "idle";
        loadLibraries({ force: true });
      }
    });
  });

  const createFactionForm = app.querySelector("#create-faction-form");
  if (createFactionForm) {
    createFactionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(createFactionForm);
      const name = String(formData.get("name") || "").trim();
      const desc = String(formData.get("desc") || "").trim();
      const color = safeColor(formData.get("color"));
      const joinType = String(formData.get("joinType") || "자유 가입");
      if (!name || !desc) return;

      const faction = {
        id: `custom-${Date.now()}`,
        name: name.slice(0, 16),
        color,
        desc: desc.slice(0, 60),
        members: 1,
        joinType,
        influence: 0,
        occupied: 0,
        totalInfluence: 0,
        custom: true,
      };
      factions.push(faction);
      state.selectedFaction = faction.id;
      state.exp = 0;
      saveProfile();
      setScreen("onboarding");
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
    exp: state.exp,
    customFactions,
  }));
}

function formatNumber(value) {
  return Math.max(0, Number(value) || 0).toLocaleString("ko-KR");
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

  state.authStatus = "loading";
  try {
    const response = await fetchWithTimeout(await apiUrl("/api/auth/me"), {}, 6000);
    if (!response.ok) throw new Error("로그인 상태를 확인하지 못했습니다");
    const payload = await response.json();
    state.authUser = payload.user || null;
    state.authStatus = "loaded";

    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success" && state.authUser) {
      window.history.replaceState({}, "", window.location.pathname);
      setScreen("onboarding");
    }
  } catch {
    state.authStatus = "idle";
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

    window.location.assign(await apiUrl("/api/auth/google/start"));
  } catch (error) {
    state.loginError = friendlyLoginError(error);
    render();
  }
}

async function loadLibraries({ force = false } = {}) {
  if (state.screen !== "home") return;
  if (!force && (state.libraryStatus === "loading" || state.libraryStatus === "loaded")) return;

  state.libraryStatus = "loading";
  state.libraryError = "";
  render();

  try {
    await loadConfig();
    const location = await resolveLocation();
    state.location = location.coords;
    state.locationSource = location.source;
    render();

    const params = new URLSearchParams({
      lat: String(location.coords.latitude),
      lng: String(location.coords.longitude),
      radius: "5000",
    });
    const response = await fetchWithTimeout(await apiUrl(`/api/libraries?${params.toString()}`), {}, 9000);
    const payload = await response.json().catch(() => ({}));
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
    if (!navigator.geolocation) {
      resolve({ coords: defaultLocation, source: "default" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          source: "current",
        });
      },
      () => resolve({ coords: defaultLocation, source: "default" }),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
    );
  });
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
  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
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

      kakaoMarkerInstances.forEach((marker) => marker.setMap(null));
      kakaoMarkerInstances = [];

      const userMarker = new kakao.maps.Marker({
        map: kakaoMapInstance,
        position: center,
        title: "내 위치",
      });
      kakaoMarkerInstances.push(userMarker);

      state.libraries.forEach((library) => {
        const marker = new kakao.maps.Marker({
          map: kakaoMapInstance,
          position: new kakao.maps.LatLng(library.latitude, library.longitude),
          title: library.name,
        });
        const overlay = new kakao.maps.CustomOverlay({
          map: kakaoMapInstance,
          position: marker.getPosition(),
          yAnchor: 1.65,
          content: `<button class="kakao-label" data-library-id="${library.id}">${library.shortName}</button>`,
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
