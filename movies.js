const API_KEY = "c5fd5b0ce23515e70f9ebc622442c5ad";
const FAVOURITES_STORAGE_KEY = "movieAppFavourites";
const THEME_STORAGE_KEY = "movieAppTheme";

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

let previousResults = null;
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

function getItemKey(item) {
    const mt = item.media_type || 'movie';
    return `${mt}-${item.id}`;
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
        return;
    }

    filtered.forEach((item) => {
        item._sourceResults = filtered;
    });

    filtered.forEach((item) => {
        resultsEl.appendChild(createCard(item));
    });
}

function renderMovies(items, withBack = false, options = {}) {
    const { favouritesView = false, resetFilters = false } = options;
    filterBaseItems = Array.isArray(items) ? items.slice() : [];
    if (resetFilters) {
        filterType = 'all';
        filterMinRating = 0;
    }
    syncFilterChips();
    rebuildResultsFromFilters(withBack, { favouritesView });
}

async function searchMovies(query) {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`;
    const response = await fetch(url);
    const data = await response.json();
    return data.results;
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
        <button type="button" class="fav-btn" aria-label="Добавить в избранное">♡</button>
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
    favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavourite(item);
        updateFavouritesBar();
        syncFavButton(favBtn, item);
        if (currentViewIsFavourites) {
            renderMovies(loadFavourites(), true, { favouritesView: true });
        }
    });

    card.querySelector('.similar-btn').addEventListener('click', () => {
        loadRecommendations(item);
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
    previousResults = item._sourceResults;

    filterBaseItems = null;
    updateFilterBarVisibility();
    resultsEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Загрузка похожих...</p>';

    try {
        const recs = await fetchRecommendations(item.id, item.media_type);
        renderMovies(recs, true);
    } catch (err) {
        filterBaseItems = null;
        updateFilterBarVisibility();
        resultsEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Ошибка при загрузке похожих.</p>';
    }
}

async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    searchBtn.textContent = 'Загрузка...';
    searchBtn.disabled = true;
    previousResults = null;
    viewSnapshotBeforeFavourites = null;

    try {
        const results = await searchMovies(query);
        renderMovies(results, false, { resetFilters: true });
    } catch (err) {
        filterBaseItems = null;
        updateFilterBarVisibility();
        resultsEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Ошибка при загрузке. Проверьте API ключ.</p>';
    } finally {
        searchBtn.textContent = 'Найти';
        searchBtn.disabled = false;
    }
}

filterBar.addEventListener('click', (e) => {
    const typeBtn = e.target.closest('[data-filter-type]');
    const ratingBtn = e.target.closest('[data-filter-rating]');
    if (typeBtn) {
        filterType = typeBtn.dataset.filterType;
        syncFilterChips();
        rebuildResultsFromFilters(activeRenderWithBack, activeRenderOptions);
    }
    if (ratingBtn) {
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

favouritesBtn.addEventListener('click', openFavouritesPanel);
searchBtn.addEventListener('click', handleSearch);

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchBtn.click();
});

detailModalClose.addEventListener('click', closeDetailModal);

detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) closeDetailModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detailModal.hasAttribute('hidden')) {
        closeDetailModal();
    }
});

initTheme();
updateFavouritesBar();
syncFilterChips();
