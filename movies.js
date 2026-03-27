const API_KEY = "c5fd5b0ce23515e70f9ebc622442c5ad";
const FAVOURITES_STORAGE_KEY = "movieAppFavourites";
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

let previousResults = null;
let autocompleteTimer = null;
let suggestRequestId = 0;
let detailModalCloseTimer = null;
let lastRenderedItems = [];
let lastRenderedWithBack = false;
let viewSnapshotBeforeFavourites = null;
let currentViewIsFavourites = false;

let filterBaseItems = null;
let filterType = 'all';
let filterMinRating = 0;
let activeRenderWithBack = false;
let activeRenderOptions = {};

let searchPaginationQuery = null;
let searchTotalPages = 0;
let searchCurrentPage = 0;

let activeBrowserGenreId = null;

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

async function loadGenreDiscover(id, label) {
    hideSearchSuggest();
    if (searchInput) searchInput.value = '';
    resetSearchPagination();
    previousResults = null;
    viewSnapshotBeforeFavourites = null;

    activeBrowserGenreId = id;
    syncGenreBrowserChips();

    filterBaseItems = null;
    updateFilterBarVisibility();
    resultsEl.innerHTML =
        '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Загрузка...</p>';
    updateSearchHistoryVisibility();

    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=ru-RU&sort_by=popularity.desc&with_genres=${id}&page=1`;

    try {
        const response = await fetch(url);
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
    let key;
    try {
        key = getItemKey(item);
    } catch {
        return false;
    }
    return loadFavourites().some((x) => {
        try {
            return getItemKey(x) === key;
        } catch {
            return false;
        }
    });
}

function toggleFavourite(item) {
    const favs = loadFavourites();
    const key = getItemKey(item);
    const idx = favs.findIndex((x) => {
        try {
            return getItemKey(x) === key;
        } catch {
            return false;
        }
    });
    if (idx >= 0) {
        favs.splice(idx, 1);
    } else {
        favs.push(JSON.parse(JSON.stringify(item)));
    }
    saveFavourites(favs);
}

function updateFavouritesBar() {
    const n = loadFavourites().length;
    favouritesBtn.textContent = `Избранное (${n})`;
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

function applyItemFilters(items) {
    if (!items || items.length === 0) return [];
    return items.filter((item) => {
        if (filterType === 'movie' && item.media_type !== 'movie') return false;
        if (filterType === 'tv' && item.media_type !== 'tv') return false;
        if (filterMinRating > 0) {
            const v = item.vote_average;
            if (v == null || v < filterMinRating) return false;
        }
        return true;
    });
}

function syncFilterChips() {
    filterBar.querySelectorAll('[data-filter-type]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.filterType === filterType);
    });
    filterBar.querySelectorAll('[data-filter-rating]').forEach((btn) => {
        const v = parseInt(btn.dataset.filterRating, 10);
        btn.classList.toggle('is-active', v === filterMinRating);
    });
}

function updateFilterBarVisibility() {
    filterBar.hidden = !Array.isArray(filterBaseItems) || filterBaseItems.length === 0;
}

function rebuildResultsFromFilters(withBack, options = {}) {
    const favouritesView = options.favouritesView === true;
    currentViewIsFavourites = favouritesView;

    activeRenderWithBack = withBack;
    activeRenderOptions = options;

    if (!Array.isArray(filterBaseItems)) {
        updateFilterBarVisibility();
        updateSearchHistoryVisibility();
        return;
    }

    const filtered = applyItemFilters(filterBaseItems);
    const noMatchFilters = filterBaseItems.length > 0 && filtered.length === 0;

    if (!favouritesView) {
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
                    previousResults = snap.previousResults;
                    filterBaseItems = snap.filterBaseItems.slice();
                    filterType = snap.filterType;
                    filterMinRating = snap.filterMinRating;
                    syncFilterChips();
                    rebuildResultsFromFilters(snap.withBack, { favouritesView: false });
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
    const { favouritesView = false, resetFilters = false } = options;
    if (favouritesView || withBack) {
        resetSearchPagination();
    }
    filterBaseItems = Array.isArray(items) ? items.slice() : [];
    if (resetFilters) {
        filterType = 'all';
        filterMinRating = 0;
    }
    syncFilterChips();
    rebuildResultsFromFilters(withBack, { favouritesView });
}

async function searchMoviesPage(query, page) {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU&page=${page}`;
    const response = await fetch(url);
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

async function fetchTrendingWeekItems() {
    const url = `https://api.themoviedb.org/3/trending/all/week?api_key=${API_KEY}&language=ru-RU`;
    const response = await fetch(url);
    const data = await response.json();
    const raw = data.results || [];
    const filtered = raw.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
    return filtered.slice(0, TRENDING_SIDEBAR_LIMIT);
}

function renderTrendingSidebar(items) {
    if (!trendingListEl) return;
    trendingListEl.innerHTML = '';
    items.forEach((item) => {
        const title = item.title || item.name || '';
        if (!title) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sidebar-card';

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
            item.vote_average != null && !Number.isNaN(item.vote_average)
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
        trendingListEl.appendChild(btn);
    });
}

async function loadTrendingSidebar() {
    if (!trendingListEl) return;
    trendingListEl.innerHTML = '<p class="sidebar__loading">Загрузка...</p>';
    try {
        const items = await fetchTrendingWeekItems();
        if (!items.length) {
            trendingListEl.innerHTML = '<p class="sidebar__error">Нет данных.</p>';
            return;
        }
        renderTrendingSidebar(items);
    } catch {
        trendingListEl.innerHTML = '<p class="sidebar__error">Не удалось загрузить.</p>';
    }
}

async function fetchSearchSuggestions(query) {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU&page=1`;
    const response = await fetch(url);
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
    const response = await fetch(url);
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
    const [detailRes, videoRes] = await Promise.all([
        fetch(detailUrl),
        fetch(videosUrl),
    ]);
    const details = await detailRes.json();
    const videos = await videoRes.json();
    return { details, videos };
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

function renderDetailModalContent(details, videosData, type) {
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
        const { details, videos } = await fetchDetailAndVideos(item.id, type);
        if (!details || details.id == null) {
            throw new Error('bad detail');
        }
        renderDetailModalContent(details, videos, type);
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

function buildMovieMetaHtml(year, genreTags) {
    if (!year && genreTags.length === 0) return '';
    const parts = [];
    if (year) parts.push(`<span class="movie-year">${year}</span>`);
    genreTags.forEach((g) => {
        parts.push(`<span class="movie-genre">${g}</span>`);
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
    const title = item.title || item.name || 'Без названия';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : '—';
    const desc = item.overview || 'Описание отсутствует.';
    const posterUrl = item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : null;
    const metaHtml = buildMovieMetaHtml(getReleaseYear(item), getGenreTags(item));

    const card = document.createElement('div');
    card.className = 'movie-card';

    card.innerHTML = `
        <div class="card-actions">
            <button type="button" class="share-btn" aria-label="Поделиться">🔗</button>
            <button type="button" class="fav-btn" aria-label="Добавить в избранное">♡</button>
        </div>
        <div class="movie-poster">
            ${posterUrl ? `<img src="${posterUrl}" alt="${title}">` : '🎬'}
        </div>
        <div class="movie-info">
            <h2 class="movie-title">${title}</h2>
            ${metaHtml}
            <div class="movie-rating">
                <span class="stars">★</span>
                <span class="rating-value">${rating}</span>
            </div>
            <p class="movie-desc">${desc}</p>
            <button type="button" class="similar-btn">Похожие</button>
        </div>
    `;

    const favBtn = card.querySelector('.fav-btn');
    syncFavButton(favBtn, item);

    card.querySelector('.similar-btn').addEventListener('click', () => {
        loadRecommendations(item);
    });

    attachUserRatingRow(card, item);
    attachUserNoteBlock(card, item);

    card.addEventListener('click', (e) => {
        const shareHit = e.target.closest('.share-btn');
        if (shareHit && card.contains(shareHit)) {
            e.stopPropagation();
            handleShareCard(item, shareHit);
            return;
        }
        const favHit = e.target.closest('.fav-btn');
        if (favHit && card.contains(favHit)) {
            e.stopPropagation();
            toggleFavourite(item);
            updateFavouritesBar();
            syncFavButton(favHit, item);
            if (currentViewIsFavourites) {
                renderMovies(loadFavourites(), true, { favouritesView: true });
            }
        }
    });

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
    };
    const favs = loadFavourites();
    renderMovies(favs, true, { favouritesView: true });
}

async function loadRecommendations(item) {
    clearGenreBrowserState();
    previousResults = item._sourceResults;

    resetSearchPagination();
    filterBaseItems = null;
    updateFilterBarVisibility();
    resultsEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Загрузка похожих...</p>';
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
    if (!query) return;

    clearGenreBrowserState();

    resetSearchPagination();
    searchBtn.textContent = 'Загрузка...';
    searchBtn.disabled = true;
    previousResults = null;
    viewSnapshotBeforeFavourites = null;

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
        resultsEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Ошибка при загрузке. Проверьте API ключ.</p>';
    } finally {
        searchBtn.textContent = 'Найти';
        searchBtn.disabled = false;
        updateSearchHistoryVisibility();
    }
}

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

favouritesBtn.addEventListener('click', openFavouritesPanel);
searchBtn.addEventListener('click', handleSearch);

searchInput.addEventListener('input', () => {
    scheduleSuggestFetch();
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
    }
});

if (trendingRefreshBtn) {
    trendingRefreshBtn.setAttribute('aria-label', 'Обновить список новинок');
    trendingRefreshBtn.addEventListener('click', loadTrendingSidebar);
}

initTheme();
updateFavouritesBar();
syncFilterChips();
renderSearchHistoryChips();
updateSearchHistoryVisibility();
initGenreBrowser();
loadTrendingSidebar();
