const API_KEY = "c5fd5b0ce23515e70f9ebc622442c5ad";
const PROXIES = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
];
let activeProxyIdx = 0;

function apiUrl(url) {
    return PROXIES[activeProxyIdx] + encodeURIComponent(url);
}

async function fetchWithFallback(url) {
    for (let i = 0; i < PROXIES.length; i++) {
        let timer = null;
        try {
            const proxyUrl = PROXIES[i] + encodeURIComponent(url);
            const controller = new AbortController();
            timer = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(proxyUrl, { signal: controller.signal });
            if (timer !== null) clearTimeout(timer);
            timer = null;
            if (res.ok) {
                activeProxyIdx = i;
                return res;
            }
        } catch {
            /* try next */
        } finally {
            if (timer !== null) clearTimeout(timer);
        }
    }
    throw new Error('All proxies failed');
}

const FAVOURITES_STORAGE_KEY = "movieAppFavourites";
const WATCHED_STORAGE_KEY = "movieAppWatched";
const RATINGS_STORAGE_KEY = "movieAppRatings";
const NOTES_STORAGE_KEY = "movieAppNotes";
const NOTE_DEBOUNCE_MS = 500;
const NOTE_MAX_LENGTH = 200;
const NOTE_PREVIEW_CHARS = 40;
const THEME_STORAGE_KEY = "movieAppTheme";
const HISTORY_STORAGE_KEY = "movieAppHistory";
const AUTOCOMPLETE_MIN_CHARS = 2;
const AUTOCOMPLETE_DEBOUNCE_MS = 350;
const AUTOCOMPLETE_MAX_ITEMS = 6;
const TRENDING_SIDEBAR_LIMIT = 10;
const SEARCH_MAX_PAGES = 5;

/** Жанры для боковой панели (TMDb genre_id) */
const SIDEBAR_BROWSER_GENRES = [
    { id: 28, label: 'Боевик' },
    { id: 35, label: 'Комедия' },
    { id: 18, label: 'Драма' },
    { id: 27, label: 'Ужасы' },
    { id: 878, label: 'Фантастика' },
    { id: 16, label: 'Мультфильм' },
    { id: 53, label: 'Триллер' },
    { id: 10749, label: 'Мелодрама' },
];

const GENRE_MAP = {
    28: 'Боевик',
    12: 'Приключения',
    16: 'Мультфильм',
    35: 'Комедия',
    80: 'Криминал',
    99: 'Документальный',
    18: 'Драма',
    10751: 'Семейный',
    14: 'Фэнтези',
    36: 'История',
    27: 'Ужасы',
    10402: 'Музыка',
    9648: 'Мистика',
    10749: 'Мелодрама',
    878: 'Фантастика',
    10770: 'ТВ-фильм',
    53: 'Триллер',
    10752: 'Военный',
    37: 'Вестерн',
    10759: 'Боевик и приключения',
    10762: 'Детский',
    10763: 'Новости',
    10764: 'Реалити',
    10765: 'Sci-Fi и фэнтези',
    10766: 'Мыльная опера',
    10767: 'Ток-шоу',
    10768: 'Война и политика',
};

const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const resultsEl = document.getElementById('results');
const favouritesBtn = document.getElementById('favouritesBtn');
const watchedBtn = document.getElementById('watchedBtn');
const filterBar = document.getElementById('filterBar');
const detailModal = document.getElementById('detailModal');
const detailModalContent = document.getElementById('detailModalContent');
const detailModalClose = document.getElementById('detailModalClose');
const themeToggle = document.getElementById('themeToggle');
const searchHistoryEl = document.getElementById('searchHistory');
const searchHistoryChipsEl = document.getElementById('searchHistoryChips');
const searchHistoryClearAllEl = document.getElementById('searchHistoryClearAll');
const searchSuggestEl = document.getElementById('searchSuggest');
const trendingListEl = document.getElementById('trendingList');
const trendingRefreshBtn = document.getElementById('trendingRefresh');
const sidebarGenreChips = document.getElementById('sidebarGenreChips');
const resultsContextHeading = document.getElementById('resultsContextHeading');
const randomMovieBtn = document.getElementById('randomMovieBtn');
const sortSelectEl = document.getElementById('sortSelect');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFileInput');
const statFavCount = document.getElementById('statFavCount');
const statWatchedCount = document.getElementById('statWatchedCount');
const statAvgRating = document.getElementById('statAvgRating');
const statFavGenre = document.getElementById('statFavGenre');

let previousResults = null;
let autocompleteTimer = null;
let suggestRequestId = 0;
let detailModalCloseTimer = null;
let lastRenderedItems = [];
let lastRenderedWithBack = false;
let viewSnapshotBeforeFavourites = null;
let currentViewIsFavourites = false;
let currentViewIsWatched = false;

let filterBaseItems = null;
let filterType = 'all';
let filterMinRating = 0;
let filterSortOrder = 'default';
let activeRenderWithBack = false;
let activeRenderOptions = {};

let searchPaginationQuery = null;
let searchTotalPages = 0;
let searchCurrentPage = 0;

let activeBrowserGenreId = null;
/** Результаты — домашние подборки (не список filterBaseItems). */
let homeScreenActive = false;

const HOME_SCREEN_COLLECTIONS = [
    { heading: 'Популярное', genreId: null },
    { heading: 'Боевики', genreId: 28 },
    { heading: 'Комедии', genreId: 35 },
    { heading: 'Фантастика', genreId: 878 },
];

let restoreHomeDebounceTimer = null;

function resetSearchPagination() {
    searchPaginationQuery = null;
    searchTotalPages = 0;
    searchCurrentPage = 0;
}

function clearResultsContextHeading() {
    if (!resultsContextHeading) return;
    resultsContextHeading.textContent = '';
    resultsContextHeading.hidden = true;
}

function setResultsContextHeading(text) {
    if (!resultsContextHeading) return;
    resultsContextHeading.textContent = text;
    resultsContextHeading.hidden = false;
}

function syncGenreBrowserChips() {
    if (!sidebarGenreChips) return;
    sidebarGenreChips.querySelectorAll('[data-genre-id]').forEach((btn) => {
        const id = parseInt(btn.dataset.genreId, 10);
        btn.classList.toggle('is-active', id === activeBrowserGenreId);
    });
}

function clearGenreBrowserState() {
    activeBrowserGenreId = null;
    syncGenreBrowserChips();
    clearResultsContextHeading();
}

function canRestoreHomeScreen() {
    if (!searchInput || searchInput.value.trim() !== '') return false;
    if (activeBrowserGenreId !== null) return false;
    if (currentViewIsFavourites || currentViewIsWatched) return false;
    if (activeRenderWithBack) return false;
    return true;
}

function tryRestoreHomeScreen() {
    if (!canRestoreHomeScreen()) return;
    resetSearchPagination();
    filterBaseItems = null;
    previousResults = null;
    viewSnapshotBeforeFavourites = null;
    clearResultsContextHeading();
    currentViewIsFavourites = false;
    currentViewIsWatched = false;
    activeRenderWithBack = false;
    activeRenderOptions = {};
    syncFilterChips();
    updateFilterBarVisibility();
    renderHomeScreen();
}

function tryRestoreHomeScreenDebounced() {
    if (restoreHomeDebounceTimer !== null) clearTimeout(restoreHomeDebounceTimer);
    restoreHomeDebounceTimer = window.setTimeout(() => {
        restoreHomeDebounceTimer = null;
        tryRestoreHomeScreen();
    }, 320);
}

async function fetchHomePopularRow() {
    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${API_KEY}&language=ru-RU&page=1`;
    const response = await fetchWithFallback(url);
    const data = await response.json();
    const raw = data.results || [];
    return raw
        .slice(0, 10)
        .filter((r) => r && r.id)
        .map((r) => ({ ...r, media_type: 'movie' }));
}

async function fetchHomeDiscoverRow(genreId) {
    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=ru-RU&sort_by=popularity.desc&with_genres=${genreId}&page=1`;
    const response = await fetchWithFallback(url);
    const data = await response.json();
    const raw = data.results || [];
    return raw
        .slice(0, 10)
        .filter((r) => r && r.id)
        .map((r) => ({ ...r, media_type: 'movie' }));
}

function createHomeCompactCard(item, rowItems) {
    const titleRaw = item.title || item.name || 'Без названия';
    const va = item.vote_average;
    const ratingText =
        typeof va === 'number' && Number.isFinite(va)
            ? va.toFixed(1)
            : va != null && Number.isFinite(Number(va))
              ? Number(va).toFixed(1)
              : '—';

    const detailPayload = {
        ...item,
        media_type: item.media_type || 'movie',
        _sourceResults: rowItems,
    };

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'home-compact-card';
    btn.setAttribute('role', 'listitem');
    btn.addEventListener('click', () => openMovieDetail(detailPayload));

    const posterWrap = document.createElement('div');
    posterWrap.className = 'home-compact-card__poster';
    if (item.poster_path) {
        const img = document.createElement('img');
        img.src = `https://image.tmdb.org/t/p/w185${item.poster_path}`;
        img.alt = '';
        posterWrap.appendChild(img);
    } else {
        posterWrap.textContent = '🎬';
    }

    const titleEl = document.createElement('div');
    titleEl.className = 'home-compact-card__title';
    titleEl.textContent = titleRaw;

    const ratingBadge = document.createElement('span');
    ratingBadge.className = 'home-compact-card__rating';
    ratingBadge.textContent = `★ ${ratingText}`;

    btn.appendChild(posterWrap);
    btn.appendChild(titleEl);
    btn.appendChild(ratingBadge);
    return btn;
}

function buildHomeSection(heading, items) {
    const section = document.createElement('section');
    section.className = 'home-section';

    const h = document.createElement('h2');
    h.className = 'home-section__heading';
    h.textContent = heading;
    section.appendChild(h);

    const row = document.createElement('div');
    row.className = 'home-row';

    const track = document.createElement('div');
    track.className = 'home-row__track';
    track.setAttribute('role', 'list');

    if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'home-section__empty';
        empty.textContent = 'Не удалось загрузить подборку.';
        track.appendChild(empty);
    } else {
        const rowItems = items.map((it) => ({ ...it, media_type: it.media_type || 'movie' }));
        items.forEach((item) => {
            track.appendChild(createHomeCompactCard(item, rowItems));
        });
    }

    row.appendChild(track);
    section.appendChild(row);
    return section;
}

async function renderHomeScreen() {
    if (!resultsEl) return;
    homeScreenActive = true;
    filterBaseItems = null;
    currentViewIsFavourites = false;
    currentViewIsWatched = false;
    activeRenderWithBack = false;
    activeRenderOptions = {};
    resetSearchPagination();
    lastRenderedItems = [];
    lastRenderedWithBack = false;
    updateFilterBarVisibility();
    clearResultsContextHeading();

    resultsEl.innerHTML = '';
    const shell = document.createElement('div');
    shell.className = 'home-screen';
    const loading = document.createElement('p');
    loading.className = 'home-screen__loading';
    loading.textContent = 'Загрузка подборок...';
    shell.appendChild(loading);
    resultsEl.appendChild(shell);

    const settled = await Promise.allSettled(
        HOME_SCREEN_COLLECTIONS.map((col) =>
            col.genreId == null ? fetchHomePopularRow() : fetchHomeDiscoverRow(col.genreId)
        )
    );

    shell.innerHTML = '';
    let anyOk = false;
    settled.forEach((result, i) => {
        const items = result.status === 'fulfilled' ? result.value : [];
        if (items.length) anyOk = true;
    });
    if (!anyOk) {
        const err = document.createElement('p');
        err.className = 'home-screen__error';
        err.textContent =
            'Не удалось загрузить подборки. Попробуйте обновить страницу или воспользоваться поиском.';
        shell.appendChild(err);
    } else {
        settled.forEach((result, i) => {
            const items = result.status === 'fulfilled' ? result.value : [];
            shell.appendChild(buildHomeSection(HOME_SCREEN_COLLECTIONS[i].heading, items));
        });
    }
    updateSearchHistoryVisibility();
}

async function loadGenreDiscover(id, label) {
    homeScreenActive = false;
    hideSearchSuggest();
    if (searchInput) searchInput.value = '';
    resetSearchPagination();
    previousResults = null;
    viewSnapshotBeforeFavourites = null;

    activeBrowserGenreId = id;
    syncGenreBrowserChips();

    filterBaseItems = null;
    updateFilterBarVisibility();
    renderSkeletons();
    updateSearchHistoryVisibility();

    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=ru-RU&sort_by=popularity.desc&with_genres=${id}&page=1`;

    try {
        const response = await fetchWithFallback(url);
        const data = await response.json();
        const raw = data.results || [];
        const results = raw.map((r) => ({ ...r, media_type: 'movie' }));
        setResultsContextHeading(`Жанр: ${label}`);
        renderMovies(results, false, { resetFilters: true });
    } catch {
        activeBrowserGenreId = null;
        syncGenreBrowserChips();
        clearResultsContextHeading();
        filterBaseItems = null;
        updateFilterBarVisibility();
        resultsEl.innerHTML =
            '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Не удалось загрузить жанр. Проверьте API ключ.</p>';
        updateSearchHistoryVisibility();
    }
}

function initGenreBrowser() {
    if (!sidebarGenreChips) return;
    sidebarGenreChips.innerHTML = '';
    SIDEBAR_BROWSER_GENRES.forEach(({ id, label }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-chip sidebar-genre-chip';
        btn.dataset.genreId = String(id);
        btn.textContent = label;
        btn.addEventListener('click', () => loadGenreDiscover(id, label));
        sidebarGenreChips.appendChild(btn);
    });
    syncGenreBrowserChips();
}

function renderSkeletons(count = 5) {
    resultsEl.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'movie-card is-skeleton';

        const poster = document.createElement('div');
        poster.className = 'skeleton-block skeleton-poster';

        const info = document.createElement('div');
        info.className = 'skeleton-info';

        const title = document.createElement('div');
        title.className = 'skeleton-block skeleton-title';

        const meta = document.createElement('div');
        meta.className = 'skeleton-meta';
        [55, 70].forEach((w) => {
            const chip = document.createElement('div');
            chip.className = 'skeleton-block skeleton-meta-chip';
            chip.style.width = `${w}px`;
            meta.appendChild(chip);
        });

        const desc = document.createElement('div');
        desc.className = 'skeleton-desc';
        for (let j = 0; j < 3; j++) {
            const line = document.createElement('div');
            line.className = 'skeleton-block skeleton-desc-line';
            desc.appendChild(line);
        }

        info.appendChild(title);
        info.appendChild(meta);
        info.appendChild(desc);
        card.appendChild(poster);
        card.appendChild(info);
        resultsEl.appendChild(card);
    }
}

function removeLoadMoreButton() {
    const existing = resultsEl.querySelector('.load-more-btn');
    if (existing) existing.remove();
}

function updateSearchLoadMoreButton() {
    removeLoadMoreButton();
    if (currentViewIsFavourites || activeRenderWithBack) return;
    if (!searchPaginationQuery || searchTotalPages <= 1) return;
    if (!filterBaseItems || filterBaseItems.length === 0) return;
    const maxPage = Math.min(searchTotalPages, SEARCH_MAX_PAGES);
    if (searchCurrentPage >= maxPage) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'load-more-btn';
    btn.textContent = 'Загрузить ещё';
    btn.addEventListener('click', handleLoadMoreSearch);
    resultsEl.appendChild(btn);
}

function getItemKey(item) {
    const mt = item.media_type || 'movie';
    return `${mt}-${item.id}`;
}

let ratingsMapCache = null;

function getRatingsMap() {
    if (ratingsMapCache === null) {
        try {
            const raw = localStorage.getItem(RATINGS_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            ratingsMapCache =
                parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            ratingsMapCache = {};
        }
    }
    return ratingsMapCache;
}

function getUserRating(item) {
    const v = getRatingsMap()[getItemKey(item)];
    return typeof v === 'number' && v >= 1 && v <= 5 ? Math.round(v) : null;
}

function setUserRating(item, value) {
    const key = getItemKey(item);
    const map = getRatingsMap();
    if (value == null) {
        delete map[key];
    } else {
        map[key] = Math.min(5, Math.max(1, Math.round(value)));
    }
    try {
        localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
}

function attachUserRatingRow(card, item) {
    const movieRatingEl = card.querySelector('.movie-rating');
    if (!movieRatingEl) return;

    const row = document.createElement('div');
    row.className = 'user-rating';

    const label = document.createElement('span');
    label.className = 'user-rating__label';
    label.textContent = 'Ваша оценка:';

    const starsWrap = document.createElement('div');
    starsWrap.className = 'user-rating__stars';
    starsWrap.setAttribute('role', 'group');
    starsWrap.setAttribute('aria-label', 'Ваша оценка от 1 до 5');

    const valueEl = document.createElement('span');
    valueEl.className = 'user-rating__value';

    let hoverVal = null;

    function paintStars() {
        const savedNow = getUserRating(item);
        const displayLevel = hoverVal != null ? hoverVal : savedNow || 0;
        starsWrap.querySelectorAll('.user-rating__star').forEach((btn) => {
            const v = parseInt(btn.dataset.value, 10);
            const filled = v <= displayLevel;
            btn.textContent = filled ? '★' : '☆';
            btn.classList.toggle('is-filled', filled);
        });
        if (savedNow != null) {
            valueEl.textContent = String(savedNow);
            valueEl.hidden = false;
        } else {
            valueEl.textContent = '';
            valueEl.hidden = true;
        }
    }

    for (let v = 1; v <= 5; v++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'user-rating__star';
        btn.dataset.value = String(v);
        btn.setAttribute('aria-label', `Оценить ${v} из 5`);
        btn.addEventListener('mouseenter', () => {
            hoverVal = v;
            paintStars();
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const current = getUserRating(item);
            if (current === v) {
                setUserRating(item, null);
            } else {
                setUserRating(item, v);
            }
            hoverVal = null;
            paintStars();
            refreshStats();
        });
        starsWrap.appendChild(btn);
    }

    starsWrap.addEventListener('mouseleave', () => {
        hoverVal = null;
        paintStars();
    });

    row.appendChild(label);
    row.appendChild(starsWrap);
    row.appendChild(valueEl);

    movieRatingEl.insertAdjacentElement('afterend', row);
    paintStars();
}

let notesMapCache = null;

function getNotesMap() {
    if (notesMapCache === null) {
        try {
            const raw = localStorage.getItem(NOTES_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            notesMapCache =
                parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            notesMapCache = {};
        }
    }
    return notesMapCache;
}

function getUserNote(item) {
    const v = getNotesMap()[getItemKey(item)];
    return typeof v === 'string' ? v : '';
}

function persistUserNote(item, text) {
    const key = getItemKey(item);
    const map = getNotesMap();
    const trimmed = text.trim();
    if (trimmed === '') {
        delete map[key];
    } else {
        map[key] = text.slice(0, NOTE_MAX_LENGTH);
    }
    try {
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
}

function notePreviewText(full) {
    if (!full) return '';
    if (full.length <= NOTE_PREVIEW_CHARS) return full;
    return `${full.slice(0, NOTE_PREVIEW_CHARS)}…`;
}

function attachUserNoteBlock(card, item) {
    const anchor = card.querySelector('.user-rating');
    if (!anchor) return;

    const wrap = document.createElement('div');
    wrap.className = 'user-note';

    const triggerRow = document.createElement('div');
    triggerRow.className = 'user-note__trigger-row';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'user-note__toggle';
    toggleBtn.textContent = '📝';
    toggleBtn.setAttribute('aria-label', 'Показать или скрыть заметку');
    toggleBtn.setAttribute('aria-expanded', 'false');

    const previewEl = document.createElement('span');
    previewEl.className = 'user-note__preview';

    const panel = document.createElement('div');
    panel.className = 'user-note__panel';
    panel.hidden = true;

    const textarea = document.createElement('textarea');
    textarea.className = 'user-note__input';
    textarea.setAttribute('maxlength', String(NOTE_MAX_LENGTH));
    textarea.setAttribute('placeholder', 'Ваша заметка...');
    textarea.setAttribute('aria-label', 'Текст заметки');
    textarea.rows = 1;
    textarea.value = getUserNote(item);

    panel.appendChild(textarea);

    triggerRow.appendChild(toggleBtn);
    triggerRow.appendChild(previewEl);
    wrap.appendChild(triggerRow);
    wrap.appendChild(panel);

    let debounceTimer = null;
    let panelOpen = false;

    function autoResizeTextarea() {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }

    function syncNoteChrome() {
        const saved = getUserNote(item);
        const has = saved.length > 0;
        toggleBtn.classList.toggle('is-active', has);
        if (!panelOpen && has) {
            previewEl.textContent = notePreviewText(saved);
            previewEl.hidden = false;
        } else {
            previewEl.textContent = '';
            previewEl.hidden = true;
        }
    }

    function flushNoteToStorage() {
        persistUserNote(item, textarea.value);
        syncNoteChrome();
    }

    function scheduleNoteSave() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            flushNoteToStorage();
        }, NOTE_DEBOUNCE_MS);
    }

    textarea.addEventListener('input', () => {
        const over = textarea.value.length > NOTE_MAX_LENGTH;
        if (over) {
            textarea.value = textarea.value.slice(0, NOTE_MAX_LENGTH);
        }
        autoResizeTextarea();
        scheduleNoteSave();
    });

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panelOpen = !panelOpen;
        panel.hidden = !panelOpen;
        toggleBtn.setAttribute('aria-expanded', panelOpen ? 'true' : 'false');
        if (panelOpen) {
            textarea.value = getUserNote(item);
            previewEl.hidden = true;
            autoResizeTextarea();
            textarea.focus();
        } else {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
                flushNoteToStorage();
            }
            syncNoteChrome();
        }
    });

    anchor.insertAdjacentElement('afterend', wrap);
    syncNoteChrome();
    if (textarea.value) {
        requestAnimationFrame(() => autoResizeTextarea());
    }
}

function loadFavourites() {
    try {
        const raw = localStorage.getItem(FAVOURITES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveFavourites(arr) {
    localStorage.setItem(FAVOURITES_STORAGE_KEY, JSON.stringify(arr));
}

function isFavourite(item) {
    const key = getItemKey(item);
    return loadFavourites().some((x) => getItemKey(x) === key);
}

function toggleFavourite(item) {
    const favs = loadFavourites();
    const key = getItemKey(item);
    const idx = favs.findIndex((x) => getItemKey(x) === key);
    if (idx >= 0) {
        favs.splice(idx, 1);
    } else {
        favs.push(JSON.parse(JSON.stringify(item)));
    }
    saveFavourites(favs);
}

function pluralMovies(n) {
    if (n % 100 >= 11 && n % 100 <= 19) return `${n} фильмов`;
    const r = n % 10;
    if (r === 1) return `${n} фильм`;
    if (r >= 2 && r <= 4) return `${n} фильма`;
    return `${n} фильмов`;
}

function refreshStats() {
    if (!statFavCount || !statWatchedCount || !statAvgRating || !statFavGenre) return;

    const favs = loadFavourites();
    const watched = loadWatched();
    const ratingsMap = getRatingsMap();

    statFavCount.textContent = pluralMovies(favs.length);
    statWatchedCount.textContent = pluralMovies(watched.length);

    const ratingValues = Object.values(ratingsMap).filter(
        (v) => typeof v === 'number' && v >= 1 && v <= 5
    );
    if (ratingValues.length === 0) {
        statAvgRating.textContent = '—';
    } else {
        const avg = ratingValues.reduce((s, v) => s + v, 0) / ratingValues.length;
        statAvgRating.textContent = `${avg.toFixed(1)} ★`;
    }

    const genreCount = {};
    favs.forEach((item) => {
        const ids = Array.isArray(item.genre_ids) ? item.genre_ids : [];
        ids.forEach((id) => {
            const label = GENRE_MAP[id];
            if (label) genreCount[label] = (genreCount[label] || 0) + 1;
        });
    });
    const topGenre = Object.entries(genreCount).sort((a, b) => b[1] - a[1])[0];
    statFavGenre.textContent = topGenre ? topGenre[0] : '—';
}

function updateFavouritesBar() {
    if (!favouritesBtn) return;
    const n = loadFavourites().length;
    favouritesBtn.textContent = `Избранное (${n})`;
}

function loadWatched() {
    try {
        const raw = localStorage.getItem(WATCHED_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveWatched(arr) {
    localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(arr));
}

function isWatched(item) {
    const key = getItemKey(item);
    return loadWatched().some((x) => {
        try { return getItemKey(x) === key; } catch { return false; }
    });
}

function toggleWatched(item) {
    const list = loadWatched();
    const key = getItemKey(item);
    const idx = list.findIndex((x) => {
        try { return getItemKey(x) === key; } catch { return false; }
    });
    if (idx >= 0) {
        list.splice(idx, 1);
    } else {
        list.push(JSON.parse(JSON.stringify(item)));
    }
    saveWatched(list);
}

function updateWatchedBar() {
    if (!watchedBtn) return;
    const n = loadWatched().length;
    watchedBtn.textContent = `Смотрел (${n})`;
}

function syncWatchedButton(btn, item) {
    const watched = isWatched(item);
    btn.classList.toggle('is-watched', watched);
    btn.setAttribute('aria-label', watched ? 'Убрать из просмотренных' : 'Отметить как просмотренное');
}

function syncWatchedBadge(card, item) {
    const badge = card.querySelector('.watched-badge');
    if (!badge) return;
    badge.classList.toggle('is-visible', isWatched(item));
}

function openWatchedPanel() {
    clearGenreBrowserState();
    viewSnapshotBeforeFavourites = {
        filterBaseItems: Array.isArray(filterBaseItems) ? filterBaseItems.slice() : [],
        filterType,
        filterMinRating,
        withBack: lastRenderedWithBack,
        previousResults,
        restoreHomeScreen: homeScreenActive,
    };
    renderMovies(loadWatched(), true, { watchedView: true });
}

function getStoredTheme() {
    try {
        return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
    } catch {
        return "dark";
    }
}

function syncThemeToggle(theme) {
    if (!themeToggle) return;
    if (theme === "light") {
        themeToggle.textContent = "🌙";
        themeToggle.setAttribute("aria-label", "Переключить на тёмную тему");
    } else {
        themeToggle.textContent = "☀️";
        themeToggle.setAttribute("aria-label", "Переключить на светлую тему");
    }
}

function initTheme() {
    const theme = getStoredTheme();
    if (theme === "light") {
        document.body.setAttribute("data-theme", "light");
    } else {
        document.body.removeAttribute("data-theme");
    }
    syncThemeToggle(theme);
}

function persistTheme(theme) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        /* ignore */
    }
}

function loadSearchHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(String).filter((s) => s.trim().length > 0);
    } catch {
        return [];
    }
}

function saveSearchHistory(arr) {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(arr));
    } catch {
        /* ignore */
    }
}

function normalizeHistoryQuery(q) {
    return String(q).trim().toLowerCase();
}

function recordSearchQuery(raw) {
    const q = String(raw).trim();
    if (!q) return;
    const norm = normalizeHistoryQuery(q);
    let list = loadSearchHistory();
    list = list.filter((item) => normalizeHistoryQuery(item) !== norm);
    list.unshift(q);
    list = list.slice(0, 8);
    saveSearchHistory(list);
    renderSearchHistoryChips();
    updateSearchHistoryVisibility();
}

function removeSearchHistoryItem(query) {
    const norm = normalizeHistoryQuery(query);
    const list = loadSearchHistory().filter((item) => normalizeHistoryQuery(item) !== norm);
    saveSearchHistory(list);
    renderSearchHistoryChips();
    updateSearchHistoryVisibility();
}

function clearSearchHistory() {
    saveSearchHistory([]);
    renderSearchHistoryChips();
    updateSearchHistoryVisibility();
}

function renderSearchHistoryChips() {
    if (!searchHistoryChipsEl) return;
    const list = loadSearchHistory();
    searchHistoryChipsEl.innerHTML = '';
    list.forEach((query) => {
        const chip = document.createElement('div');
        chip.className = 'search-history__chip';
        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'search-history__chip-main';
        main.textContent = query;
        main.title = query;
        main.addEventListener('click', () => {
            searchInput.value = query;
            handleSearch();
        });
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'search-history__chip-remove';
        rm.setAttribute('aria-label', 'Удалить из истории');
        rm.textContent = '✕';
        rm.addEventListener('click', (e) => {
            e.stopPropagation();
            removeSearchHistoryItem(query);
        });
        chip.appendChild(main);
        chip.appendChild(rm);
        searchHistoryChipsEl.appendChild(chip);
    });
}

function shouldShowSearchHistory() {
    if (document.activeElement === searchInput) return true;
    if (Array.isArray(filterBaseItems)) return true;
    return false;
}

function updateSearchHistoryVisibility() {
    if (!searchHistoryEl || !searchHistoryClearAllEl) return;
    const list = loadSearchHistory();
    const show = shouldShowSearchHistory() && list.length > 0;
    searchHistoryEl.hidden = !show;
    searchHistoryClearAllEl.hidden = !show;
}

function syncFavButton(btn, item) {
    const fav = isFavourite(item);
    btn.textContent = fav ? '♥' : '♡';
    btn.classList.toggle('is-fav', fav);
    btn.setAttribute('aria-label', fav ? 'Удалить из избранного' : 'Добавить в избранное');
}

function getItemYear(item) {
    const raw = item.release_date || item.first_air_date || '';
    return raw.length >= 4 ? parseInt(raw.slice(0, 4), 10) : 0;
}

function getItemTitle(item) {
    return (item.title || item.name || '').toLowerCase();
}

function applyItemSort(items) {
    if (filterSortOrder === 'default' || !items || items.length === 0) return items;
    const arr = items.slice();
    arr.sort((a, b) => {
        switch (filterSortOrder) {
            case 'rating_desc': return (b.vote_average || 0) - (a.vote_average || 0);
            case 'rating_asc':  return (a.vote_average || 0) - (b.vote_average || 0);
            case 'year_desc':   return getItemYear(b) - getItemYear(a);
            case 'year_asc':    return getItemYear(a) - getItemYear(b);
            case 'title_asc':   return getItemTitle(a).localeCompare(getItemTitle(b), 'ru');
            case 'title_desc':  return getItemTitle(b).localeCompare(getItemTitle(a), 'ru');
            default:            return 0;
        }
    });
    return arr;
}

function applyItemFilters(items) {
    if (!items || items.length === 0) return [];
    const filtered = items.filter((item) => {
        if (filterType === 'movie' && item.media_type !== 'movie') return false;
        if (filterType === 'tv' && item.media_type !== 'tv') return false;
        if (filterMinRating > 0) {
            const v = item.vote_average;
            if (v == null || v < filterMinRating) return false;
        }
        return true;
    });
    return applyItemSort(filtered);
}

function syncFilterChips() {
    if (!filterBar) return;
    filterBar.querySelectorAll('[data-filter-type]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.filterType === filterType);
    });
    filterBar.querySelectorAll('[data-filter-rating]').forEach((btn) => {
        const v = parseInt(btn.dataset.filterRating, 10);
        btn.classList.toggle('is-active', v === filterMinRating);
    });
    if (sortSelectEl) sortSelectEl.value = filterSortOrder;
}

function updateFilterBarVisibility() {
    if (!filterBar) return;
    filterBar.hidden = !Array.isArray(filterBaseItems) || filterBaseItems.length === 0;
}

function rebuildResultsFromFilters(withBack, options = {}) {
    const favouritesView = options.favouritesView === true;
    const watchedView = options.watchedView === true;
    currentViewIsFavourites = favouritesView;
    currentViewIsWatched = watchedView;

    activeRenderWithBack = withBack;
    activeRenderOptions = options;

    if (!Array.isArray(filterBaseItems)) {
        updateFilterBarVisibility();
        updateSearchHistoryVisibility();
        return;
    }

    const filtered = applyItemFilters(filterBaseItems);
    const noMatchFilters = filterBaseItems.length > 0 && filtered.length === 0;

    if (!favouritesView && !watchedView) {
        lastRenderedItems = filtered;
        lastRenderedWithBack = withBack;
    }

    updateFilterBarVisibility();

    resultsEl.innerHTML = '';

    if (withBack) {
        const backBtn = document.createElement('button');
        backBtn.className = 'back-btn';
        backBtn.type = 'button';
        backBtn.textContent = '← Назад';
        backBtn.addEventListener('click', () => {
            if (favouritesView) {
                const snap = viewSnapshotBeforeFavourites;
                viewSnapshotBeforeFavourites = null;
                if (snap) {
                    if (snap.restoreHomeScreen) {
                        previousResults = null;
                        filterBaseItems = null;
                        filterType = snap.filterType;
                        filterMinRating = snap.filterMinRating;
                        currentViewIsFavourites = false;
                        activeRenderWithBack = false;
                        activeRenderOptions = {};
                        syncFilterChips();
                        updateFilterBarVisibility();
                        renderHomeScreen();
                        updateSearchHistoryVisibility();
                        return;
                    }
                    previousResults = snap.previousResults;
                    filterBaseItems = snap.filterBaseItems.slice();
                    filterType = snap.filterType;
                    filterMinRating = snap.filterMinRating;
                    syncFilterChips();
                    rebuildResultsFromFilters(snap.withBack, { favouritesView: false });
                }
            } else if (watchedView) {
                const snap = viewSnapshotBeforeFavourites;
                viewSnapshotBeforeFavourites = null;
                if (snap) {
                    if (snap.restoreHomeScreen) {
                        previousResults = null;
                        filterBaseItems = null;
                        filterType = snap.filterType;
                        filterMinRating = snap.filterMinRating;
                        currentViewIsWatched = false;
                        activeRenderWithBack = false;
                        activeRenderOptions = {};
                        syncFilterChips();
                        updateFilterBarVisibility();
                        renderHomeScreen();
                        updateSearchHistoryVisibility();
                        return;
                    }
                    previousResults = snap.previousResults;
                    filterBaseItems = snap.filterBaseItems.slice();
                    filterType = snap.filterType;
                    filterMinRating = snap.filterMinRating;
                    syncFilterChips();
                    rebuildResultsFromFilters(snap.withBack, { watchedView: false });
                }
            } else {
                renderMovies(previousResults);
                previousResults = null;
            }
        });
        resultsEl.appendChild(backBtn);
    }

    if (!filtered || filtered.length === 0) {
        const msg = document.createElement('p');
        msg.style.cssText = 'color:var(--text-secondary);text-align:center;padding:40px 0;';
        if (noMatchFilters) {
            msg.textContent = 'Нет результатов с такими фильтрами.';
        } else if (favouritesView) {
            msg.textContent = 'Список избранного пуст';
        } else if (watchedView) {
            msg.textContent = 'Список просмотренного пуст';
        } else if (withBack) {
            msg.textContent = 'Похожих фильмов не найдено.';
        } else {
            msg.textContent = 'Ничего не найдено';
        }
        resultsEl.appendChild(msg);
        updateSearchHistoryVisibility();
        return;
    }

    filtered.forEach((item) => {
        item._sourceResults = filtered;
    });

    filtered.forEach((item) => {
        resultsEl.appendChild(createCard(item));
    });
    updateSearchLoadMoreButton();
    updateSearchHistoryVisibility();
}

function renderMovies(items, withBack = false, options = {}) {
    homeScreenActive = false;
    const { favouritesView = false, watchedView = false, resetFilters = false } = options;
    if (favouritesView || watchedView || withBack) {
        resetSearchPagination();
    }
    filterBaseItems = Array.isArray(items) ? items.slice() : [];
    if (resetFilters) {
        filterType = 'all';
        filterMinRating = 0;
        filterSortOrder = 'default';
    }
    syncFilterChips();
    rebuildResultsFromFilters(withBack, { favouritesView, watchedView });
}

async function searchMoviesPage(query, page) {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU&page=${page}`;
    const response = await fetchWithFallback(url);
    const data = await response.json();
    return {
        results: data.results || [],
        total_pages: typeof data.total_pages === 'number' ? data.total_pages : 1,
    };
}

async function searchMovies(query) {
    const { results } = await searchMoviesPage(query, 1);
    return results;
}

async function handleLoadMoreSearch() {
    const btn = resultsEl.querySelector('.load-more-btn');
    if (!btn || !searchPaginationQuery) return;
    const nextPage = searchCurrentPage + 1;
    const maxPage = Math.min(searchTotalPages, SEARCH_MAX_PAGES);
    if (nextPage > maxPage) return;

    btn.disabled = true;
    btn.textContent = 'Загрузка...';

    try {
        const { results: newResults } = await searchMoviesPage(searchPaginationQuery, nextPage);
        const beforeFilter = applyItemFilters(filterBaseItems);
        const prevKeys = new Set(beforeFilter.map((i) => getItemKey(i)));
        filterBaseItems = filterBaseItems.concat(newResults);
        searchCurrentPage = nextPage;
        const fullFiltered = applyItemFilters(filterBaseItems);
        fullFiltered.forEach((item) => {
            item._sourceResults = fullFiltered;
        });
        lastRenderedItems = fullFiltered;

        const toAppend = fullFiltered.filter((i) => !prevKeys.has(getItemKey(i)));

        btn.remove();
        toAppend.forEach((item) => {
            resultsEl.appendChild(createCard(item));
        });
        updateSearchLoadMoreButton();
    } catch {
        btn.disabled = false;
        btn.textContent = 'Загрузить ещё';
    }
}

let trendingCarouselItems = [];
let trendingCarouselIndex = 0;
let trendingAutoTimer = null;
let trendingTransitionLock = false;
let trendingSpotlightRoot = null;
/** Пауза по hover только после задержки — иначе после innerHTML браузер шлёт mouseenter и гасит таймер. */
let trendingHoverPauseArmed = false;
let trendingHoverArmTimer = null;

function disarmTrendingHoverPause() {
    trendingHoverPauseArmed = false;
    if (trendingHoverArmTimer !== null) {
        clearTimeout(trendingHoverArmTimer);
        trendingHoverArmTimer = null;
    }
}

function scheduleArmTrendingHoverPause() {
    disarmTrendingHoverPause();
    trendingHoverArmTimer = window.setTimeout(() => {
        trendingHoverPauseArmed = true;
        trendingHoverArmTimer = null;
    }, 350);
}

function clearTrendingAutoTimer() {
    if (trendingAutoTimer != null) {
        clearTimeout(trendingAutoTimer);
        trendingAutoTimer = null;
    }
}

function pauseTrendingAuto() {
    if (!trendingHoverPauseArmed) return;
    clearTrendingAutoTimer();
}

function scheduleTrendingAuto() {
    clearTrendingAutoTimer();
    if (!trendingSpotlightRoot || trendingCarouselItems.length <= 1) return;
    trendingAutoTimer = window.setTimeout(() => {
        trendingAutoTimer = null;
        if (trendingTransitionLock) {
            scheduleTrendingAuto();
            return;
        }
        trendingGoNext(true);
    }, 4000);
}

function resumeTrendingAuto() {
    scheduleTrendingAuto();
}

function buildTrendingCard(item) {
    const title = item.title || item.name || 'Без названия';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trending-spotlight__card sidebar-card';

    const thumb = document.createElement('div');
    thumb.className = 'sidebar-card__thumb';
    if (item.poster_path) {
        const img = document.createElement('img');
        img.src = `https://image.tmdb.org/t/p/w92${item.poster_path}`;
        img.alt = '';
        thumb.appendChild(img);
    } else {
        thumb.textContent = '🎬';
    }

    const body = document.createElement('div');
    body.className = 'sidebar-card__body';
    const titleEl = document.createElement('span');
    titleEl.className = 'sidebar-card__title';
    titleEl.textContent = title;

    const meta = document.createElement('div');
    meta.className = 'sidebar-card__meta';
    const yearStr = getReleaseYear(item);
    if (yearStr) {
        const y = document.createElement('span');
        y.textContent = yearStr;
        meta.appendChild(y);
    }
    const rating =
        item.vote_average != null && !Number.isNaN(Number(item.vote_average))
            ? Number(item.vote_average).toFixed(1)
            : null;
    if (rating != null) {
        const r = document.createElement('span');
        r.className = 'sidebar-card__rating';
        r.textContent = `★ ${rating}`;
        meta.appendChild(r);
    }

    body.appendChild(titleEl);
    body.appendChild(meta);
    btn.appendChild(thumb);
    btn.appendChild(body);
    btn.addEventListener('click', () => openMovieDetail(item));
    return btn;
}

function refreshTrendingVisibleCard() {
    if (!trendingSpotlightRoot || !trendingCarouselItems.length) return;
    const paneA = trendingSpotlightRoot.querySelector('.trending-spotlight__pane--a');
    const paneB = trendingSpotlightRoot.querySelector('.trending-spotlight__pane--b');
    if (paneB) {
        paneB.innerHTML = '';
        paneB.classList.remove(
            'trending-spotlight__pane--exit-up',
            'trending-spotlight__pane--exit-down',
            'trending-spotlight__pane--enter-from-bottom',
            'trending-spotlight__pane--enter-from-top'
        );
    }
    if (paneA) {
        paneA.innerHTML = '';
        paneA.classList.remove(
            'trending-spotlight__pane--exit-up',
            'trending-spotlight__pane--exit-down',
            'trending-spotlight__pane--enter-from-bottom',
            'trending-spotlight__pane--enter-from-top'
        );
        paneA.appendChild(buildTrendingCard(trendingCarouselItems[trendingCarouselIndex]));
    }
}

function updateTrendingIndicator() {
    if (!trendingSpotlightRoot) return;
    const n = trendingCarouselItems.length;
    const counter = trendingSpotlightRoot.querySelector('.trending-spotlight__counter-text');
    if (counter) {
        counter.textContent = n ? `${trendingCarouselIndex + 1} / ${n}` : '';
    }
    const dotsWrap = trendingSpotlightRoot.querySelector('.trending-spotlight__dots');
    if (dotsWrap) {
        dotsWrap.innerHTML = '';
        for (let i = 0; i < n; i++) {
            const d = document.createElement('span');
            d.className = 'trending-spotlight__dot' + (i === trendingCarouselIndex ? ' is-active' : '');
            d.setAttribute('aria-hidden', 'true');
            dotsWrap.appendChild(d);
        }
    }
    const prevBtn = trendingSpotlightRoot.querySelector('[data-trending-dir="prev"]');
    const nextBtn = trendingSpotlightRoot.querySelector('[data-trending-dir="next"]');
    if (prevBtn) prevBtn.disabled = n < 2;
    if (nextBtn) nextBtn.disabled = n < 2;
}

function animNameMatchesExit(name, direction) {
    if (!name) return false;
    const up = name.includes('trending-spotlight-exit-up');
    const down = name.includes('trending-spotlight-exit-down');
    return direction === 'forward' ? up : down;
}

function runTrendingStep(toIndex, direction, animated) {
    clearTrendingAutoTimer();
    const n = trendingCarouselItems.length;
    const reduceMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (n < 2 || !animated || reduceMotion) {
        trendingCarouselIndex = toIndex;
        refreshTrendingVisibleCard();
        updateTrendingIndicator();
        scheduleTrendingAuto();
        trendingTransitionLock = false;
        return;
    }
    if (trendingTransitionLock) return;
    const paneA = trendingSpotlightRoot && trendingSpotlightRoot.querySelector('.trending-spotlight__pane--a');
    const paneB = trendingSpotlightRoot && trendingSpotlightRoot.querySelector('.trending-spotlight__pane--b');
    if (!paneA || !paneB) {
        trendingCarouselIndex = toIndex;
        refreshTrendingVisibleCard();
        updateTrendingIndicator();
        scheduleTrendingAuto();
        return;
    }
    trendingTransitionLock = true;
    paneB.innerHTML = '';
    paneB.appendChild(buildTrendingCard(trendingCarouselItems[toIndex]));
    paneA.classList.remove(
        'trending-spotlight__pane--exit-up',
        'trending-spotlight__pane--exit-down',
        'trending-spotlight__pane--enter-from-bottom',
        'trending-spotlight__pane--enter-from-top'
    );
    paneB.classList.remove(
        'trending-spotlight__pane--exit-up',
        'trending-spotlight__pane--exit-down',
        'trending-spotlight__pane--enter-from-bottom',
        'trending-spotlight__pane--enter-from-top'
    );
    void paneB.offsetWidth;
    if (direction === 'forward') {
        paneA.classList.add('trending-spotlight__pane--exit-up');
        paneB.classList.add('trending-spotlight__pane--enter-from-bottom');
    } else {
        paneA.classList.add('trending-spotlight__pane--exit-down');
        paneB.classList.add('trending-spotlight__pane--enter-from-top');
    }

    let settled = false;
    let fallbackTimer = null;
    const settle = () => {
        if (settled) return;
        settled = true;
        if (fallbackTimer != null) clearTimeout(fallbackTimer);
        if (paneA._trendingAnimEnd) {
            paneA.removeEventListener('animationend', paneA._trendingAnimEnd);
            delete paneA._trendingAnimEnd;
        }
        trendingCarouselIndex = toIndex;
        paneA.innerHTML = '';
        paneB.innerHTML = '';
        paneA.appendChild(buildTrendingCard(trendingCarouselItems[trendingCarouselIndex]));
        paneA.classList.remove(
            'trending-spotlight__pane--exit-up',
            'trending-spotlight__pane--exit-down',
            'trending-spotlight__pane--enter-from-bottom',
            'trending-spotlight__pane--enter-from-top'
        );
        paneB.classList.remove(
            'trending-spotlight__pane--exit-up',
            'trending-spotlight__pane--exit-down',
            'trending-spotlight__pane--enter-from-bottom',
            'trending-spotlight__pane--enter-from-top'
        );
        trendingTransitionLock = false;
        updateTrendingIndicator();
        scheduleTrendingAuto();
    };

    fallbackTimer = window.setTimeout(() => settle(), 600);

    const onEnd = (e) => {
        if (e.target !== paneA) return;
        if (!animNameMatchesExit(e.animationName, direction)) return;
        settle();
    };
    paneA._trendingAnimEnd = onEnd;
    paneA.addEventListener('animationend', onEnd);
}

function trendingGoNext(animated) {
    const n = trendingCarouselItems.length;
    if (n < 2) {
        scheduleTrendingAuto();
        return;
    }
    const to = (trendingCarouselIndex + 1) % n;
    runTrendingStep(to, 'forward', animated);
}

function trendingGoPrev(animated) {
    const n = trendingCarouselItems.length;
    if (n < 2) {
        scheduleTrendingAuto();
        return;
    }
    const to = (trendingCarouselIndex - 1 + n) % n;
    runTrendingStep(to, 'back', animated);
}

async function fetchTrendingWeekItems() {
    const url = `https://api.themoviedb.org/3/trending/all/week?api_key=${API_KEY}&language=ru-RU`;
    const response = await fetchWithFallback(url);
    const data = await response.json();
    const raw = data.results || [];
    const filtered = raw.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
    return filtered.slice(0, TRENDING_SIDEBAR_LIMIT);
}

function renderTrendingSidebar(items) {
    if (!trendingListEl) return;
    clearTrendingAutoTimer();
    disarmTrendingHoverPause();
    trendingSpotlightRoot = null;
    trendingTransitionLock = false;

    const filtered = [];
    items.forEach((item) => {
        const title = item.title || item.name || '';
        if (!title) return;
        filtered.push(item);
    });
    trendingCarouselItems = filtered;
    trendingCarouselIndex = 0;

    trendingListEl.innerHTML = '';
    if (!filtered.length) {
        const p = document.createElement('p');
        p.className = 'sidebar__loading';
        p.textContent = 'Нет данных для отображения.';
        trendingListEl.appendChild(p);
        return;
    }

    const spotlight = document.createElement('div');
    spotlight.className = 'trending-spotlight';
    spotlight.setAttribute('role', 'region');
    spotlight.setAttribute('aria-label', 'Карусель новинок недели');

    const viewport = document.createElement('div');
    viewport.className = 'trending-spotlight__viewport';

    const stage = document.createElement('div');
    stage.className = 'trending-spotlight__stage';

    const paneA = document.createElement('div');
    paneA.className = 'trending-spotlight__pane trending-spotlight__pane--a';
    const paneB = document.createElement('div');
    paneB.className = 'trending-spotlight__pane trending-spotlight__pane--b';

    stage.appendChild(paneA);
    stage.appendChild(paneB);
    viewport.appendChild(stage);
    spotlight.appendChild(viewport);

    const nav = document.createElement('div');
    nav.className = 'trending-spotlight__nav';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'trending-spotlight__arrow';
    prevBtn.setAttribute('data-trending-dir', 'prev');
    prevBtn.setAttribute('aria-label', 'Предыдущая новинка');
    prevBtn.textContent = '‹';

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'trending-spotlight__arrow';
    nextBtn.setAttribute('data-trending-dir', 'next');
    nextBtn.setAttribute('aria-label', 'Следующая новинка');
    nextBtn.textContent = '›';

    nav.appendChild(prevBtn);
    nav.appendChild(nextBtn);
    spotlight.appendChild(nav);

    const indicator = document.createElement('div');
    indicator.className = 'trending-spotlight__indicator';
    indicator.setAttribute('aria-live', 'polite');

    const counterText = document.createElement('span');
    counterText.className = 'trending-spotlight__counter-text';

    const dots = document.createElement('div');
    dots.className = 'trending-spotlight__dots';

    indicator.appendChild(counterText);
    indicator.appendChild(dots);
    spotlight.appendChild(indicator);

    trendingListEl.appendChild(spotlight);
    trendingSpotlightRoot = spotlight;

    paneA.appendChild(buildTrendingCard(filtered[0]));
    updateTrendingIndicator();

    prevBtn.addEventListener('click', () => trendingGoPrev(true));
    nextBtn.addEventListener('click', () => trendingGoNext(true));

    spotlight.addEventListener('mouseenter', pauseTrendingAuto);
    spotlight.addEventListener('mouseleave', resumeTrendingAuto);

    scheduleArmTrendingHoverPause();
    scheduleTrendingAuto();
}

function showTrendingRetryButton() {
    if (!trendingListEl) return;
    clearTrendingAutoTimer();
    disarmTrendingHoverPause();
    trendingSpotlightRoot = null;
    trendingCarouselItems = [];
    trendingTransitionLock = false;
    trendingListEl.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar__refresh';
    btn.style.cssText = 'display:block;margin:8px auto 0;';
    btn.textContent = 'Обновить';
    btn.addEventListener('click', () => loadTrendingSidebar());
    trendingListEl.appendChild(btn);
}

function maybeShowWeekHighlightToast(items, enabled) {
    if (!enabled || !items.length) return;
    const first = items[0];
    const t = (first.title || first.name || '').trim();
    if (t) showToast(`🔥 Новинка недели: ${t}`);
}

async function loadTrendingSidebar(options = {}) {
    const showWeekHighlightToast = options.showWeekHighlightToast === true;
    if (!trendingListEl) return;
    clearTrendingAutoTimer();
    disarmTrendingHoverPause();
    trendingSpotlightRoot = null;
    trendingTransitionLock = false;
    trendingListEl.innerHTML = '<p class="sidebar__loading">Загрузка...</p>';
    try {
        const items = await fetchTrendingWeekItems();
        if (!items.length) {
            showTrendingRetryButton();
            return;
        }
        renderTrendingSidebar(items);
        maybeShowWeekHighlightToast(items, showWeekHighlightToast);
    } catch {
        // Silent retry once after 3 s
        setTimeout(async () => {
            try {
                const items = await fetchTrendingWeekItems();
                if (items.length) {
                    renderTrendingSidebar(items);
                    maybeShowWeekHighlightToast(items, showWeekHighlightToast);
                } else {
                    showTrendingRetryButton();
                }
            } catch {
                showTrendingRetryButton();
            }
        }, 3000);
    }
}

async function fetchSearchSuggestions(query) {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU&page=1`;
    const response = await fetchWithFallback(url);
    const data = await response.json();
    const list = data.results || [];
    return list.slice(0, AUTOCOMPLETE_MAX_ITEMS);
}

function hideSearchSuggest() {
    if (!searchSuggestEl) return;
    searchSuggestEl.hidden = true;
    searchSuggestEl.innerHTML = '';
    if (searchInput) searchInput.setAttribute('aria-expanded', 'false');
}

function setSearchSuggestOpen(open) {
    if (searchInput) searchInput.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function getSuggestDisplayTitle(item) {
    return item.title || item.name || '';
}

function getSuggestMediaBadgeLabel(item) {
    if (item.media_type === 'movie') return 'Фильм';
    if (item.media_type === 'tv') return 'Сериал';
    return 'Персона';
}

function getSuggestThumbUrl(item) {
    const path = item.poster_path || item.profile_path;
    if (!path) return null;
    return `https://image.tmdb.org/t/p/w92${path}`;
}

function renderSuggestList(results) {
    if (!searchSuggestEl) return;
    searchSuggestEl.innerHTML = '';
    results.forEach((item) => {
        const title = getSuggestDisplayTitle(item);
        if (!title) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-suggest__item';
        btn.setAttribute('role', 'option');

        const thumb = document.createElement('div');
        thumb.className = 'search-suggest__thumb';
        const thumbUrl = getSuggestThumbUrl(item);
        if (thumbUrl) {
            const img = document.createElement('img');
            img.src = thumbUrl;
            img.alt = '';
            thumb.appendChild(img);
        } else {
            thumb.textContent = item.media_type === 'person' ? '👤' : '🎬';
        }

        const body = document.createElement('div');
        body.className = 'search-suggest__body';
        const t = document.createElement('span');
        t.className = 'search-suggest__title';
        t.textContent = title;
        const meta = document.createElement('div');
        meta.className = 'search-suggest__meta';
        const yearStr = getReleaseYear(item);
        if (yearStr) {
            const y = document.createElement('span');
            y.className = 'search-suggest__year';
            y.textContent = yearStr;
            meta.appendChild(y);
        }
        const badge = document.createElement('span');
        badge.className = 'search-suggest__badge';
        badge.textContent = getSuggestMediaBadgeLabel(item);
        meta.appendChild(badge);
        body.appendChild(t);
        body.appendChild(meta);

        btn.appendChild(thumb);
        btn.appendChild(body);
        btn.addEventListener('click', () => {
            hideSearchSuggest();
            searchInput.value = title;
            handleSearch();
        });
        searchSuggestEl.appendChild(btn);
    });
    if (!searchSuggestEl.children.length) {
        hideSearchSuggest();
        return;
    }
    searchSuggestEl.hidden = false;
    setSearchSuggestOpen(true);
}

async function runSuggestFetch(query) {
    const myId = ++suggestRequestId;
    try {
        const results = await fetchSearchSuggestions(query);
        if (myId !== suggestRequestId) return;
        const current = searchInput.value.trim();
        if (current.length < AUTOCOMPLETE_MIN_CHARS || current !== query.trim()) {
            hideSearchSuggest();
            return;
        }
        if (!results.length) {
            hideSearchSuggest();
            return;
        }
        renderSuggestList(results);
    } catch {
        if (myId === suggestRequestId) hideSearchSuggest();
    }
}

function scheduleSuggestFetch() {
    if (autocompleteTimer) clearTimeout(autocompleteTimer);
    const q = searchInput.value.trim();
    if (q.length < AUTOCOMPLETE_MIN_CHARS) {
        hideSearchSuggest();
        return;
    }
    autocompleteTimer = setTimeout(() => runSuggestFetch(q), AUTOCOMPLETE_DEBOUNCE_MS);
}

async function fetchRecommendations(id, mediaType) {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/${type}/${id}/recommendations?api_key=${API_KEY}&language=ru-RU`;
    const response = await fetchWithFallback(url);
    const data = await response.json();
    const list = data.results || [];
    return list.map((r) => ({ ...r, media_type: type }));
}

function getDetailMediaType(item) {
    const mt = item.media_type;
    if (mt === 'person') return null;
    if (mt === 'movie' || mt === 'tv') return mt;
    if (item.name && item.title == null) return 'tv';
    return 'movie';
}

async function fetchDetailAndVideos(id, type) {
    const base = `https://api.themoviedb.org/3/${type}/${id}`;
    const detailUrl = `${base}?api_key=${API_KEY}&language=ru-RU`;
    const videosUrl = `${base}/videos?api_key=${API_KEY}`;
    const creditsUrl = `${base}/credits?api_key=${API_KEY}&language=ru-RU`;
    const [detailRes, videoRes, creditsRes] = await Promise.all([
        fetchWithFallback(detailUrl),
        fetchWithFallback(videosUrl),
        fetchWithFallback(creditsUrl),
    ]);
    const details = await detailRes.json();
    const videos = await videoRes.json();
    const credits = await creditsRes.json();
    return { details, videos, credits };
}

async function fetchPersonCredits(personId) {
    const url = `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${API_KEY}&language=ru-RU`;
    const res = await fetchWithFallback(url);
    const data = await res.json();
    const cast = (data.cast || []).filter(
        (r) => r.media_type === 'movie' || r.media_type === 'tv'
    );
    cast.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    return cast.slice(0, 20);
}

async function openPersonFilmography(personId, personName) {
    closeDetailModal();
    clearGenreBrowserState();
    resetSearchPagination();
    previousResults = null;
    viewSnapshotBeforeFavourites = null;
    filterBaseItems = null;
    updateFilterBarVisibility();
    renderSkeletons();
    updateSearchHistoryVisibility();
    try {
        const items = await fetchPersonCredits(personId);
        setResultsContextHeading(`Фильмы: ${personName}`);
        renderMovies(items, false, { resetFilters: true });
    } catch {
        clearResultsContextHeading();
        filterBaseItems = null;
        updateFilterBarVisibility();
        resultsEl.innerHTML =
            '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Не удалось загрузить фильмографию.</p>';
        updateSearchHistoryVisibility();
    }
}

function findYoutubeTrailer(videosData) {
    const results = videosData.results || [];
    return results.find((v) => v.site === 'YouTube' && v.type === 'Trailer');
}

function formatRuntimeMinutes(totalMinutes) {
    if (totalMinutes == null || totalMinutes < 1) return null;
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    if (h > 0 && m > 0) return `${h} ч ${m} мин`;
    if (h > 0) return `${h} ч`;
    return `${m} мин`;
}

function genreLabelsFromDetails(details) {
    const genres = details.genres;
    if (!Array.isArray(genres) || genres.length === 0) return [];
    return genres.map((g) => GENRE_MAP[g.id] || g.name).filter(Boolean);
}

function openDetailModalShell() {
    if (detailModalCloseTimer) {
        clearTimeout(detailModalCloseTimer);
        detailModalCloseTimer = null;
    }
    detailModal.classList.remove('is-open');
    detailModal.removeAttribute('hidden');
    detailModal.setAttribute('aria-hidden', 'false');
    detailModalContent.innerHTML = '<p class="detail-modal__loading">Загрузка...</p>';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => detailModal.classList.add('is-open'));
    });
    document.body.style.overflow = 'hidden';
}

function closeDetailModal() {
    detailModal.classList.remove('is-open');
    if (detailModalCloseTimer) clearTimeout(detailModalCloseTimer);
    detailModalCloseTimer = setTimeout(() => {
        detailModal.setAttribute('hidden', '');
        detailModal.setAttribute('aria-hidden', 'true');
        detailModalContent.innerHTML = '';
        document.body.style.overflow = '';
        detailModalCloseTimer = null;
    }, 280);
}

function buildCreditsRow(labelText, people) {
    if (!people || people.length === 0) return null;
    const row = document.createElement('p');
    row.className = 'detail-modal__fact detail-modal__credits-row';
    const lbl = document.createElement('strong');
    lbl.textContent = `${labelText}: `;
    row.appendChild(lbl);
    people.forEach((person, i) => {
        if (i > 0) row.appendChild(document.createTextNode(', '));
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'person-link';
        link.textContent = person.name;
        link.addEventListener('click', () => openPersonFilmography(person.id, person.name));
        row.appendChild(link);
    });
    return row;
}

function renderDetailModalContent(details, videosData, type, credits) {
    const title =
        type === 'movie' ? details.title : details.name;
    const dateRaw = type === 'movie' ? details.release_date : details.first_air_date;
    const year = dateRaw && typeof dateRaw === 'string' && dateRaw.length >= 4
        ? dateRaw.slice(0, 4)
        : null;
    const rating =
        details.vote_average != null && !Number.isNaN(details.vote_average)
            ? Number(details.vote_average).toFixed(1)
            : null;
    const overview =
        details.overview && details.overview.trim()
            ? details.overview
            : 'Описание отсутствует.';
    const genres = genreLabelsFromDetails(details);

    let runtimeText = null;
    if (type === 'movie') {
        runtimeText = formatRuntimeMinutes(details.runtime);
    } else if (type === 'tv') {
        const ep = details.episode_run_time;
        const mins = Array.isArray(ep) && ep.length > 0 ? ep[0] : null;
        runtimeText = formatRuntimeMinutes(mins);
    }

    const country =
        details.production_countries &&
        details.production_countries[0] &&
        details.production_countries[0].name
            ? details.production_countries[0].name
            : null;

    const trailer = findYoutubeTrailer(videosData);
    const posterSrc = details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : null;

    const body = document.createElement('div');
    body.className = 'detail-modal__body';

    const posterCol = document.createElement('div');
    posterCol.className = 'detail-modal__poster';
    if (posterSrc) {
        const img = document.createElement('img');
        img.src = posterSrc;
        img.alt = title || '';
        posterCol.appendChild(img);
    } else {
        const fb = document.createElement('div');
        fb.className = 'detail-modal__poster-fallback';
        fb.textContent = '🎬';
        posterCol.appendChild(fb);
    }
    body.appendChild(posterCol);

    const info = document.createElement('div');
    info.className = 'detail-modal__info';

    const h = document.createElement('h2');
    h.className = 'detail-modal__title';
    h.id = 'detailModalTitle';
    h.textContent = title || 'Без названия';
    info.appendChild(h);

    if (year || genres.length > 0) {
        const metaRow = document.createElement('div');
        metaRow.className = 'detail-modal__meta-row';
        if (year) {
            const y = document.createElement('span');
            y.className = 'movie-year';
            y.textContent = year;
            metaRow.appendChild(y);
        }
        genres.forEach((label) => {
            const g = document.createElement('span');
            g.className = 'movie-genre';
            g.textContent = label;
            metaRow.appendChild(g);
        });
        info.appendChild(metaRow);
    }

    const ratingLine = document.createElement('div');
    ratingLine.className = 'detail-modal__rating-line';
    if (rating != null) {
        const lbl = document.createElement('span');
        lbl.textContent = 'Рейтинг:';
        const st = document.createElement('span');
        st.className = 'stars';
        st.textContent = '★';
        const rv = document.createElement('span');
        rv.className = 'rating-value';
        rv.textContent = rating;
        ratingLine.appendChild(lbl);
        ratingLine.appendChild(st);
        ratingLine.appendChild(rv);
    } else {
        ratingLine.textContent = 'Рейтинг: —';
    }
    info.appendChild(ratingLine);

    const facts = document.createElement('div');
    facts.className = 'detail-modal__facts';
    if (runtimeText) {
        const f = document.createElement('p');
        f.className = 'detail-modal__fact';
        const b = document.createElement('strong');
        b.textContent = 'Продолжительность:';
        f.appendChild(b);
        f.appendChild(document.createTextNode(` ${runtimeText}`));
        facts.appendChild(f);
    }
    if (country) {
        const f = document.createElement('p');
        f.className = 'detail-modal__fact';
        const b = document.createElement('strong');
        b.textContent = 'Страна:';
        f.appendChild(b);
        f.appendChild(document.createTextNode(` ${country}`));
        facts.appendChild(f);
    }
    if (facts.childElementCount) info.appendChild(facts);

    const desc = document.createElement('p');
    desc.className = 'detail-modal__text';
    desc.textContent = overview;
    info.appendChild(desc);

    // Credits
    if (credits) {
        const crew = credits.crew || [];
        const castList = (credits.cast || []).slice(0, 5);
        const director = crew.find((c) => c.job === 'Director');
        const directorRow = director
            ? buildCreditsRow('Режиссёр', [director])
            : null;
        const castRow = castList.length
            ? buildCreditsRow('В ролях', castList)
            : null;
        const creditsBlock = document.createElement('div');
        creditsBlock.className = 'detail-modal__credits';
        if (directorRow) creditsBlock.appendChild(directorRow);
        if (castRow) creditsBlock.appendChild(castRow);
        if (creditsBlock.childElementCount) info.appendChild(creditsBlock);
    }

    if (trailer && trailer.key) {
        const tr = document.createElement('div');
        tr.className = 'detail-modal__trailer';
        const tl = document.createElement('div');
        tl.className = 'detail-modal__trailer-label';
        tl.textContent = 'Трейлер';
        tr.appendChild(tl);
        const wrap = document.createElement('div');
        wrap.className = 'detail-modal__iframe-wrap';
        const iframe = document.createElement('iframe');
        iframe.title = 'YouTube';
        iframe.src = `https://www.youtube.com/embed/${trailer.key}`;
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute(
            'allow',
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        );
        wrap.appendChild(iframe);
        tr.appendChild(wrap);
        info.appendChild(tr);
    }

    body.appendChild(info);

    detailModalContent.innerHTML = '';
    detailModalContent.appendChild(body);
}

async function openMovieDetail(item) {
    const type = getDetailMediaType(item);
    if (!type) return;

    openDetailModalShell();

    try {
        const { details, videos, credits } = await fetchDetailAndVideos(item.id, type);
        if (!details || details.id == null) {
            throw new Error('bad detail');
        }
        renderDetailModalContent(details, videos, type, credits);
    } catch {
        detailModalContent.innerHTML =
            '<p class="detail-modal__error">Не удалось загрузить данные.</p>';
    }
}

function getReleaseYear(item) {
    const raw = item.release_date || item.first_air_date;
    if (!raw || typeof raw !== 'string' || raw.length < 4) return null;
    const y = raw.slice(0, 4);
    return /^\d{4}$/.test(y) ? y : null;
}

function getGenreTags(item) {
    const ids = item.genre_ids;
    if (!Array.isArray(ids)) return [];
    const tags = [];
    for (let i = 0; i < ids.length && tags.length < 3; i++) {
        const label = GENRE_MAP[ids[i]];
        if (label) tags.push(label);
    }
    return tags;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildMovieMetaHtml(year, genreTags) {
    if (!year && genreTags.length === 0) return '';
    const parts = [];
    if (year) parts.push(`<span class="movie-year">${escapeHtml(year)}</span>`);
    genreTags.forEach((g) => {
        parts.push(`<span class="movie-genre">${escapeHtml(g)}</span>`);
    });
    return `<div class="movie-meta">${parts.join('')}</div>`;
}

function getTmdbPublicUrl(item) {
    const mt = item.media_type;
    if (mt === 'tv') return `https://www.themoviedb.org/tv/${item.id}`;
    if (mt === 'movie') return `https://www.themoviedb.org/movie/${item.id}`;
    if (mt === 'person') return `https://www.themoviedb.org/person/${item.id}`;
    if (item.name != null && item.title == null) return `https://www.themoviedb.org/tv/${item.id}`;
    return `https://www.themoviedb.org/movie/${item.id}`;
}

function shareTextSnippet(text, maxLen) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= maxLen) return t;
    return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

async function handleShareCard(item, shareBtn) {
    const url = getTmdbPublicUrl(item);
    const title = item.title || item.name || 'Кинобаза TMDb';
    const desc = shareTextSnippet(item.overview || '', 100);

    const showCopiedFeedback = () => {
        const prevLabel = shareBtn.getAttribute('aria-label') || 'Поделиться';
        shareBtn.textContent = '✓';
        shareBtn.classList.add('share-btn--done');
        shareBtn.setAttribute('aria-label', 'Ссылка скопирована');
        setTimeout(() => {
            shareBtn.textContent = '🔗';
            shareBtn.classList.remove('share-btn--done');
            shareBtn.setAttribute('aria-label', prevLabel);
        }, 1500);
    };

    const tryClipboard = async () => {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(url);
            showCopiedFeedback();
            return true;
        }
        return false;
    };

    try {
        if (typeof navigator.share === 'function') {
            await navigator.share({
                title,
                text: desc || title,
                url,
            });
            return;
        }
    } catch (err) {
        if (err && err.name === 'AbortError') return;
    }

    try {
        await tryClipboard();
    } catch {
        /* ignore */
    }
}

function createCard(item) {
    const titleRaw = item.title || item.name || 'Без названия';
    const titleEsc = escapeHtml(titleRaw);
    const va = item.vote_average;
    const rating =
        typeof va === 'number' && Number.isFinite(va)
            ? va.toFixed(1)
            : va != null && Number.isFinite(Number(va))
              ? Number(va).toFixed(1)
              : '—';
    const descEsc = escapeHtml(item.overview || 'Описание отсутствует.');
    const posterUrl = item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : null;
    const metaHtml = buildMovieMetaHtml(getReleaseYear(item), getGenreTags(item));

    const card = document.createElement('div');
    card.className = 'movie-card';
    card.setAttribute('tabindex', '0');
    card._kbItem = item;

    card.innerHTML = `
        <div class="card-actions">
            <button type="button" class="share-btn" aria-label="Поделиться">🔗</button>
            <button type="button" class="watched-btn" aria-label="Отметить как просмотренное">✓</button>
            <button type="button" class="fav-btn" aria-label="Добавить в избранное">♡</button>
        </div>
        <div class="movie-poster-wrap">
            <div class="movie-poster">
                ${posterUrl ? `<img src="${posterUrl}" alt="${titleEsc}">` : '🎬'}
            </div>
            <span class="watched-badge" aria-hidden="true">✓ Просмотрено</span>
        </div>
        <div class="movie-info">
            <h2 class="movie-title">${titleEsc}</h2>
            ${metaHtml}
            <div class="movie-rating">
                <span class="stars">★</span>
                <span class="rating-value">${rating}</span>
            </div>
            <p class="movie-desc">${descEsc}</p>
            <button type="button" class="similar-btn">Похожие</button>
        </div>
    `;

    const shareBtn = card.querySelector('.share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleShareCard(item, shareBtn);
        });
    }

    const favBtn = card.querySelector('.fav-btn');
    if (favBtn) {
        syncFavButton(favBtn, item);
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavourite(item);
            updateFavouritesBar();
            syncFavButton(favBtn, item);
            refreshStats();
            if (currentViewIsFavourites) {
                renderMovies(loadFavourites(), true, { favouritesView: true });
            }
        });
    }

    const watchedBtnEl = card.querySelector('.watched-btn');
    if (watchedBtnEl) {
        syncWatchedButton(watchedBtnEl, item);
        syncWatchedBadge(card, item);
        watchedBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleWatched(item);
            updateWatchedBar();
            syncWatchedButton(watchedBtnEl, item);
            syncWatchedBadge(card, item);
            refreshStats();
            if (currentViewIsWatched) {
                renderMovies(loadWatched(), true, { watchedView: true });
            }
        });
    }

    const similarBtn = card.querySelector('.similar-btn');
    if (similarBtn) {
        similarBtn.addEventListener('click', () => {
            loadRecommendations(item);
        });
    }

    card.addEventListener('focus', () => {
        getResultCards().forEach((c) => c.classList.remove('kb-focused'));
        card.classList.add('kb-focused');
    });

    attachUserRatingRow(card, item);
    attachUserNoteBlock(card, item);

    const detailType = getDetailMediaType(item);
    if (detailType) {
        const posterWrap = card.querySelector('.movie-poster');
        const titleEl = card.querySelector('.movie-title');
        posterWrap.classList.add('clickable');
        titleEl.classList.add('clickable');
        posterWrap.setAttribute('role', 'button');
        posterWrap.setAttribute('tabindex', '0');
        posterWrap.setAttribute('aria-label', 'Подробнее');
        titleEl.setAttribute('tabindex', '0');
        titleEl.setAttribute('role', 'button');
        titleEl.setAttribute('aria-label', 'Подробнее');

        const openDetail = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openMovieDetail(item);
        };

        posterWrap.addEventListener('click', openDetail);
        titleEl.addEventListener('click', openDetail);
        posterWrap.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openMovieDetail(item);
            }
        });
        titleEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openMovieDetail(item);
            }
        });
    }

    return card;
}

function openFavouritesPanel() {
    clearGenreBrowserState();
    viewSnapshotBeforeFavourites = {
        filterBaseItems: Array.isArray(filterBaseItems) ? filterBaseItems.slice() : [],
        filterType,
        filterMinRating,
        withBack: lastRenderedWithBack,
        previousResults,
        restoreHomeScreen: homeScreenActive,
    };
    const favs = loadFavourites();
    renderMovies(favs, true, { favouritesView: true });
}

async function loadRecommendations(item) {
    homeScreenActive = false;
    clearGenreBrowserState();
    previousResults = item._sourceResults;

    resetSearchPagination();
    filterBaseItems = null;
    updateFilterBarVisibility();
    renderSkeletons();
    updateSearchHistoryVisibility();

    try {
        const recs = await fetchRecommendations(item.id, item.media_type);
        renderMovies(recs, true);
    } catch (err) {
        filterBaseItems = null;
        updateFilterBarVisibility();
        resultsEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Ошибка при загрузке похожих.</p>';
        updateSearchHistoryVisibility();
    }
}

async function handleSearch() {
    hideSearchSuggest();
    const query = searchInput.value.trim();
    if (!query) {
        tryRestoreHomeScreen();
        return;
    }

    homeScreenActive = false;
    clearGenreBrowserState();

    resetSearchPagination();
    searchBtn.textContent = 'Загрузка...';
    searchBtn.disabled = true;
    previousResults = null;
    viewSnapshotBeforeFavourites = null;
    renderSkeletons();

    try {
        const { results, total_pages } = await searchMoviesPage(query, 1);
        searchPaginationQuery = query;
        searchTotalPages = total_pages;
        searchCurrentPage = 1;
        recordSearchQuery(query);
        renderMovies(results, false, { resetFilters: true });
    } catch (err) {
        resetSearchPagination();
        filterBaseItems = null;
        updateFilterBarVisibility();
        resultsEl.innerHTML =
            '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Не удалось загрузить или показать результаты поиска.</p>';
    } finally {
        searchBtn.textContent = 'Найти';
        searchBtn.disabled = false;
        updateSearchHistoryVisibility();
    }
}

if (filterBar) {
    filterBar.addEventListener('click', (e) => {
        const typeBtn = e.target.closest('[data-filter-type]');
        const ratingBtn = e.target.closest('[data-filter-rating]');
        if (typeBtn) {
            resetSearchPagination();
            filterType = typeBtn.dataset.filterType;
            syncFilterChips();
            rebuildResultsFromFilters(activeRenderWithBack, activeRenderOptions);
        }
        if (ratingBtn) {
            resetSearchPagination();
            filterMinRating = parseInt(ratingBtn.dataset.filterRating, 10) || 0;
            syncFilterChips();
            rebuildResultsFromFilters(activeRenderWithBack, activeRenderOptions);
        }
    });
}

if (sortSelectEl) {
    sortSelectEl.addEventListener('change', () => {
        filterSortOrder = sortSelectEl.value;
        rebuildResultsFromFilters(activeRenderWithBack, activeRenderOptions);
    });
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const isLight = document.body.getAttribute('data-theme') === 'light';
        const next = isLight ? 'dark' : 'light';
        if (next === 'light') {
            document.body.setAttribute('data-theme', 'light');
        } else {
            document.body.removeAttribute('data-theme');
        }
        persistTheme(next);
        syncThemeToggle(next);
    });
}

if (searchHistoryEl) {
    searchHistoryEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('.search-history__chip-remove')) return;
        if (e.target.closest('.search-history__chip-main')) {
            e.preventDefault();
        }
    });
}

if (searchHistoryClearAllEl) {
    searchHistoryClearAllEl.addEventListener('click', clearSearchHistory);
}

if (searchSuggestEl) {
    searchSuggestEl.addEventListener('mousedown', (e) => {
        if (e.target === searchSuggestEl) return;
        if (e.target.closest('.search-suggest__item')) {
            e.preventDefault();
        }
    });
}

document.addEventListener('mousedown', (e) => {
    if (!searchSuggestEl || searchSuggestEl.hidden) return;
    if (e.target.closest('.search-box__wrap')) return;
    hideSearchSuggest();
});

if (favouritesBtn) favouritesBtn.addEventListener('click', openFavouritesPanel);
if (watchedBtn) watchedBtn.addEventListener('click', openWatchedPanel);
searchBtn.addEventListener('click', handleSearch);

searchInput.addEventListener('input', () => {
    scheduleSuggestFetch();
    if (searchInput.value.trim() === '') {
        tryRestoreHomeScreenDebounced();
    }
});

searchInput.addEventListener('focus', () => {
    renderSearchHistoryChips();
    updateSearchHistoryVisibility();
    scheduleSuggestFetch();
});

searchInput.addEventListener('blur', () => {
    setTimeout(updateSearchHistoryVisibility, 0);
});

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (searchSuggestEl && !searchSuggestEl.hidden) {
            e.preventDefault();
            hideSearchSuggest();
            return;
        }
    }
    if (e.key === 'Enter') searchBtn.click();
});

detailModalClose.addEventListener('click', closeDetailModal);

detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) closeDetailModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!detailModal.hasAttribute('hidden')) {
        closeDetailModal();
        return;
    }
    if (searchSuggestEl && !searchSuggestEl.hidden) {
        hideSearchSuggest();
        return;
    }
    if (document.activeElement === searchInput) {
        searchInput.value = '';
        searchInput.blur();
        tryRestoreHomeScreen();
    }
});

/* ── Keyboard navigation ───────────────────────────────────────── */
function getResultCards() {
    return Array.from(resultsEl.querySelectorAll('.movie-card:not(.is-skeleton)'));
}

function getKbFocusedCard() {
    return resultsEl.querySelector('.movie-card.kb-focused');
}

function setKbFocus(card) {
    getResultCards().forEach((c) => c.classList.remove('kb-focused'));
    if (!card) return;
    card.classList.add('kb-focused');
    card.focus({ preventScroll: false });
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function isModalOpen() {
    return !detailModal.hasAttribute('hidden');
}

function getItemFromCard(card) {
    // Retrieve the item bound to this card via a data attribute we'll set
    const idx = card.dataset.kbIndex;
    if (idx == null) return null;
    const cards = getResultCards();
    return cards[parseInt(idx, 10)]?._kbItem ?? null;
}

document.addEventListener('keydown', (e) => {
    const key = e.key;
    const active = document.activeElement;
    const inTyping = isTypingTarget(active);
    const modalOpen = isModalOpen();

    // / — focus search (when modal closed and not already in input)
    if (key === '/' && !inTyping && !modalOpen) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
    }

    // Arrow navigation within results
    if ((key === 'ArrowDown' || key === 'ArrowUp') && !modalOpen) {
        const cards = getResultCards();
        if (!cards.length) return;
        e.preventDefault();
        const focused = getKbFocusedCard();
        let idx = focused ? cards.indexOf(focused) : -1;
        if (key === 'ArrowDown') idx = Math.min(idx + 1, cards.length - 1);
        else idx = Math.max(idx - 1, 0);
        setKbFocus(cards[idx]);
        return;
    }

    // Keys that act on the focused card
    const focused = getKbFocusedCard();
    if (!focused || modalOpen) return;

    const item = focused._kbItem;
    if (!item) return;

    if (key === 'Enter') {
        e.preventDefault();
        openMovieDetail(item);
        return;
    }

    if (key === 'f' || key === 'F') {
        if (inTyping) return;
        e.preventDefault();
        const favBtn = focused.querySelector('.fav-btn');
        if (favBtn) favBtn.click();
        return;
    }

    if (key === 'w' || key === 'W') {
        if (inTyping) return;
        e.preventDefault();
        const wb = focused.querySelector('.watched-btn');
        if (wb) wb.click();
    }
});

if (trendingRefreshBtn) {
    trendingRefreshBtn.setAttribute('aria-label', 'Обновить список новинок');
    trendingRefreshBtn.addEventListener('click', loadTrendingSidebar);
}

if (randomMovieBtn) {
    randomMovieBtn.addEventListener('click', async () => {
        randomMovieBtn.textContent = 'Загрузка...';
        randomMovieBtn.disabled = true;
        try {
            const page = Math.floor(Math.random() * 10) + 1;
            const url = `https://api.themoviedb.org/3/movie/popular?api_key=${API_KEY}&language=ru-RU&page=${page}`;
            const response = await fetchWithFallback(url);
            const data = await response.json();
            const list = (data.results || []).filter((r) => r && r.id);
            if (!list.length) throw new Error('empty');
            const item = list[Math.floor(Math.random() * list.length)];
            await openMovieDetail({ ...item, media_type: 'movie' });
        } catch {
            /* nothing to show on error */
        } finally {
            randomMovieBtn.textContent = '🎲 Случайный фильм';
            randomMovieBtn.disabled = false;
        }
    });
}

/* ── Toasts ───────────────────────────────────────────────────── */
function showToast(message, duration = 4000) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast is-entering';
    el.setAttribute('role', 'status');
    el.textContent = message;
    stack.appendChild(el);
    const detach = () => {
        if (!el.isConnected) return;
        el.remove();
    };
    window.setTimeout(() => {
        el.classList.remove('is-entering');
        el.classList.add('is-leaving');
        const fallbackMs = 400;
        const t = window.setTimeout(detach, fallbackMs);
        el.addEventListener(
            'animationend',
            (e) => {
                if (e.target !== el || e.animationName !== 'toast-out') return;
                clearTimeout(t);
                detach();
            },
            { once: true }
        );
    }, duration);
}

/* ── Data export / import ──────────────────────────────────────── */

function handleExport() {
    const payload = {
        favourites: loadFavourites(),
        watched: loadWatched(),
        ratings: getRatingsMap(),
        notes: getNotesMap(),
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'filmoteka-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function applyImportedData(parsed) {
    const VALID_KEYS = ['favourites', 'watched', 'ratings', 'notes'];
    const hasAny = VALID_KEYS.some((k) => k in parsed);
    if (!hasAny) throw new Error('Нет распознанных ключей');

    if (Array.isArray(parsed.favourites)) {
        localStorage.setItem(FAVOURITES_STORAGE_KEY, JSON.stringify(parsed.favourites));
    }
    if (Array.isArray(parsed.watched)) {
        localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(parsed.watched));
    }
    if (parsed.ratings && typeof parsed.ratings === 'object' && !Array.isArray(parsed.ratings)) {
        ratingsMapCache = null;
        localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(parsed.ratings));
        ratingsMapCache = null;
    }
    if (parsed.notes && typeof parsed.notes === 'object' && !Array.isArray(parsed.notes)) {
        notesMapCache = null;
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(parsed.notes));
        notesMapCache = null;
    }
}

if (exportBtn) {
    exportBtn.addEventListener('click', handleExport);
}

if (importBtn && importFileInput) {
    importBtn.addEventListener('click', () => importFileInput.click());

    importFileInput.addEventListener('change', () => {
        const file = importFileInput.files && importFileInput.files[0];
        if (!file) return;
        importFileInput.value = '';
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('Неверный формат');
                }
                applyImportedData(parsed);
                updateFavouritesBar();
                updateWatchedBar();
                refreshStats();
                renderSearchHistoryChips();
                showToast('✓ Данные импортированы');
            } catch {
                showToast('✗ Ошибка импорта');
            }
        };
        reader.readAsText(file, 'utf-8');
    });
}

initTheme();
updateFavouritesBar();
updateWatchedBar();
refreshStats();
syncFilterChips();
renderSearchHistoryChips();
updateSearchHistoryVisibility();
initGenreBrowser();
renderHomeScreen();
loadTrendingSidebar({ showWeekHighlightToast: true });

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => { /* sw unavailable */ });
    });
}
