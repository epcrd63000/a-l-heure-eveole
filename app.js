import { estimateWalkingRoute, findNearbyStops, getFeedInfo, getLines, getUpcomingDepartures, searchStops } from "./api.js";
import {
  getFavorites,
  getLastStop,
  getSettings,
  removeFavorite,
  saveSettings,
  setLastStop,
  toggleFavorite
} from "./storage.js";

const byId = id => document.getElementById(id);
const icons = {
  close: '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>',
  location: '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  locate: '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>',
  search: '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>',
  sliders: '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4"/></svg>',
  star: '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
  starFilled: '<svg class="ui-icon ui-icon-filled" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
  arrow: '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>'
};
const ui = {
  notice: byId("notice"),
  liveStatus: byId("live-status"),
  liveStatusText: byId("live-status-text"),
  countdownPanel: byId("countdown-panel"),
  countdownCaption: byId("countdown-caption"),
  countdownValue: byId("countdown-value"),
  countdownMessage: byId("countdown-message"),
  tripStop: byId("trip-stop"),
  tripLine: byId("trip-line"),
  summaryPassage: byId("summary-passage"),
  summaryWalk: byId("summary-walk"),
  summaryBuffer: byId("summary-buffer"),
  summaryLeave: byId("summary-leave"),
  search: byId("stop-search"),
  searchResults: byId("search-results"),
  searchSpinner: byId("search-spinner"),
  nearbyWrap: byId("nearby-wrap"),
  nearbyLocation: byId("nearby-location"),
  nearbyStops: byId("nearby-stops"),
  lineFilter: byId("line-filter"),
  directionFilter: byId("direction-filter"),
  favoriteToggle: byId("favorite-toggle"),
  departuresList: byId("departures-list"),
  updatedAt: byId("updated-at"),
  favoritesSection: byId("favorites-section"),
  favoritesList: byId("favorites-list"),
  settingsDialog: byId("settings-dialog"),
  settingsForm: byId("settings-form"),
  settingsError: byId("settings-error"),
  marginSetting: byId("margin-setting"),
  walkSetting: byId("walk-setting")
};

let preferences = getSettings();
let currentStop = null;
let currentPosition = null;
let departures = [];
let selectedDeparture = null;
let walking = null;
let searchTimer = 0;
let searchController = null;
let requestController = null;
let departureRefreshTimer = 0;
let noticeTimer = 0;
let geolocationRequestId = 0;
let nearbyRequestId = 0;
let nearbyController = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function showNotice(message, kind = "info", persistent = false) {
  window.clearTimeout(noticeTimer);
  ui.notice.className = `notice${kind === "error" ? " notice-error" : kind === "success" ? " notice-success" : ""}`;
  ui.notice.innerHTML = `<span>${escapeHtml(message)}</span><button class="notice-close" type="button" aria-label="Fermer le message">${icons.close}</button>`;
  ui.notice.hidden = false;
  ui.notice.querySelector(".notice-close").addEventListener("click", () => { ui.notice.hidden = true; });
  if (!persistent && kind !== "error") {
    noticeTimer = window.setTimeout(() => { ui.notice.hidden = true; }, 6000);
  }
}

function setStatus(message, kind = "idle") {
  ui.liveStatusText.textContent = message;
  ui.liveStatus.classList.toggle("is-live", kind === "live");
  ui.liveStatus.classList.toggle("is-error", kind === "error");
}

function formatTime(date) {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function favoriteFromDeparture(departure = selectedDeparture) {
  if (!currentStop || !departure) return null;
  return {
    stopId: currentStop.id,
    stopName: currentStop.name,
    lineId: departure.lineId,
    lineName: departure.lineName,
    direction: departure.direction
  };
}

function favoriteMatches(a, b) {
  if (!a || !b) return false;
  return a.stopId === b.stopId
    && (a.lineId || a.lineName) === (b.lineId || b.lineName)
    && a.direction === b.direction;
}

function currentFavoriteIsSaved() {
  const current = favoriteFromDeparture();
  return Boolean(current && getFavorites().some(item => favoriteMatches(item, current)));
}

function updateFavoriteControl() {
  const saved = currentFavoriteIsSaved();
  ui.favoriteToggle.disabled = !currentStop || !selectedDeparture;
  ui.favoriteToggle.setAttribute("aria-pressed", String(saved));
  ui.favoriteToggle.innerHTML = `${saved ? icons.starFilled : icons.star}<span>${saved ? "Enregistré" : "Enregistrer"}</span>`;
}

function renderFavorites() {
  const favorites = getFavorites();
  ui.favoritesSection.hidden = favorites.length === 0;
  const manageFavorites = byId("manage-favorites");
  manageFavorites.disabled = favorites.length === 0;
  manageFavorites.textContent = favorites.length ? "Gérer mes arrêts favoris" : "Aucun favori enregistré";
  ui.favoritesList.innerHTML = favorites.map((favorite, index) => `
    <article class="favorite-item">
      <button type="button" class="favorite-select" data-favorite-index="${index}">
        <span class="favorite-name">${escapeHtml(favorite.stopName)}</span>
        <span class="favorite-detail">${escapeHtml(favorite.lineName)} · ${escapeHtml(favorite.direction)}</span>
      </button>
      <button type="button" class="favorite-remove" data-favorite-remove="${index}" aria-label="Retirer ${escapeHtml(favorite.stopName)} des favoris">
        ${icons.close}
      </button>
    </article>`).join("");
}

function setSelectOptions(select, values, initialLabel, selectedValue = "") {
  const unique = [...new Set(values.filter(Boolean))];
  select.innerHTML = `<option value="">${escapeHtml(initialLabel)}</option>${unique.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  select.value = unique.includes(selectedValue) ? selectedValue : "";
}

function setLineOptions(lines, selectedId = "") {
  ui.lineFilter.innerHTML = `<option value="">Tous les bus</option>${lines.map(line =>
    `<option value="${escapeHtml(line.id)}">${escapeHtml(line.name)}</option>`).join("")}`;
  ui.lineFilter.value = selectedId;
  ui.lineFilter.disabled = lines.length === 0;
}

function filteredDepartures() {
  const line = ui.lineFilter.value;
  const direction = ui.directionFilter.value;
  return departures.filter(item => (!line || item.lineId === line)
    && (!direction || item.direction === direction));
}

function renderDepartures() {
  const visible = filteredDepartures();
  if (!visible.length) {
    const hasDepartures = departures.length > 0;
    ui.departuresList.innerHTML = `<div class="empty-state"><span class="empty-glyph" aria-hidden="true">↳</span><p>${hasDepartures ? "Aucun départ ne correspond à ces filtres." : "Aucun passage à venir pour cet arrêt. Réessayez dans quelques minutes."}</p></div>`;
    selectedDeparture = null;
    renderCountdown();
    updateFavoriteControl();
    return;
  }
  if (!selectedDeparture || !visible.some(item => sameDeparture(item, selectedDeparture))) {
    selectedDeparture = visible[0];
  } else {
    selectedDeparture = visible.find(item => sameDeparture(item, selectedDeparture));
  }
  const nextFour = visible.filter(item => item.departureAt > selectedDeparture.departureAt).slice(0, 4);
  if (!nextFour.length) {
    ui.departuresList.innerHTML = '<div class="empty-state"><span class="empty-glyph" aria-hidden="true">↳</span><p>Aucun autre départ après celui sélectionné.</p></div>';
    renderCountdown();
    updateFavoriteControl();
    return;
  }
  ui.departuresList.innerHTML = nextFour.map(departure => `
    <article class="departure-row${sameDeparture(departure, selectedDeparture) ? " is-selected" : ""}">
      <button type="button" class="departure-time departure-select" data-departure-id="${escapeHtml(departure.id)}" aria-label="Calculer l’heure de départ pour le bus ${escapeHtml(departure.lineName)} à ${escapeHtml(formatTime(departure.departureAt))}">${escapeHtml(formatTime(departure.departureAt))}</button>
      <div class="departure-route">
        <div class="route-line"><span class="line-badge">${escapeHtml(departure.lineName)}</span><span>${escapeHtml(departure.direction)}</span></div>
        <div class="route-destination">${departure.realtime ? "Temps réel" : "Horaire théorique"}${currentStop ? ` · ${escapeHtml(currentStop.name)}` : ""}</div>
      </div>
      <span class="departure-walk">${walking?.durationMinutes ? `${walking.durationMinutes} min à pied` : "Marche à régler"}</span>
      <button type="button" class="row-save" data-save-id="${escapeHtml(departure.id)}" aria-label="Ajouter le bus ${escapeHtml(departure.lineName)} vers ${escapeHtml(departure.direction)} aux favoris">${icons.star}</button>
    </article>`).join("");
  renderCountdown();
  updateFavoriteControl();
}

function sameDeparture(a, b) {
  return Boolean(a && b && a.lineId === b.lineId && a.departureAt.getTime() === b.departureAt.getTime());
}

function renderCountdown() {
  const departure = selectedDeparture;
  const walkMinutes = preferences.walkMinutes ?? walking?.durationMinutes;
  const hasWalkingEstimate = Number.isFinite(walkMinutes);
  ui.countdownPanel.classList.remove("state-green", "state-orange", "state-red", "state-gray", "state-empty", "is-urgent");
  ui.summaryBuffer.textContent = `Marge : ${preferences.marginMinutes} min`;
  ui.tripStop.textContent = currentStop?.name || "Aucun arrêt sélectionné";
  ui.tripLine.textContent = departure ? `Bus ${departure.lineName} vers ${departure.direction}` : "Bus · Direction";

  if (!departure) {
    ui.countdownPanel.classList.add("state-empty");
    ui.countdownCaption.textContent = currentStop ? "AUCUN DÉPART DISPONIBLE" : "CHOISISSEZ UN ARRÊT";
    ui.countdownValue.innerHTML = "--<span>:</span>--";
    ui.countdownMessage.textContent = currentStop ? "Aucun passage à venir dans les données reçues." : "L’heure idéale pour partir s’affichera ici.";
    ui.summaryPassage.textContent = "Passage : —";
    ui.summaryWalk.textContent = "Marche : —";
    ui.summaryLeave.textContent = "Départ : —";
    return;
  }

  ui.summaryPassage.textContent = `Passage : ${formatTime(departure.departureAt)}`;
  ui.summaryWalk.textContent = hasWalkingEstimate ? `Marche : ${walkMinutes} min` : "Marche : à configurer";
  if (!hasWalkingEstimate) {
    ui.countdownPanel.classList.add("state-empty");
    ui.countdownCaption.textContent = "TEMPS DE MARCHE INCONNU";
    ui.countdownValue.innerHTML = "--<span>:</span>--";
    ui.countdownMessage.textContent = "Activez la géolocalisation ou indiquez votre marche dans Réglages.";
    ui.summaryLeave.textContent = "Départ : —";
    return;
  }

  const leaveAt = new Date(departure.departureAt.getTime() - (walkMinutes + preferences.marginMinutes) * 60_000);
  ui.summaryLeave.textContent = `Départ : ${formatTime(leaveAt)}`;
  const secondsUntilDeparture = Math.floor((departure.departureAt.getTime() - Date.now()) / 1000);
  if (secondsUntilDeparture <= 0) {
    ui.countdownPanel.classList.add("state-gray");
    ui.countdownCaption.textContent = "DÉPART MANQUÉ";
    ui.countdownValue.innerHTML = "--<span>:</span>--";
    ui.countdownMessage.textContent = "Le bus est déjà passé. Actualisez les horaires pour la suite.";
    return;
  }
  const secondsUntilLeave = Math.floor((leaveAt.getTime() - Date.now()) / 1000);
  ui.countdownCaption.textContent = "IL VOUS RESTE";
  if (secondsUntilLeave <= 0) {
    ui.countdownPanel.classList.add("state-red", "is-urgent");
    ui.countdownValue.innerHTML = "00<span>:</span>00";
    ui.countdownMessage.textContent = "Partez maintenant pour tenter de l’attraper.";
    return;
  }
  const totalMinutes = Math.floor(secondsUntilLeave / 60);
  const remainingSeconds = secondsUntilLeave % 60;
  const displayHours = Math.floor(totalMinutes / 60);
  const displayMinutes = totalMinutes % 60;
  ui.countdownValue.innerHTML = displayHours
    ? `${String(displayHours).padStart(2, "0")}<span>:</span>${String(displayMinutes).padStart(2, "0")}`
    : `${String(totalMinutes).padStart(2, "0")}<span>:</span>${String(remainingSeconds).padStart(2, "0")}`;
  if (secondsUntilLeave > 5 * 60) {
    ui.countdownPanel.classList.add("state-green");
    ui.countdownMessage.textContent = `Vous partirez à ${formatTime(leaveAt)}.`;
  } else if (secondsUntilLeave > 60) {
    ui.countdownPanel.classList.add("state-orange");
    ui.countdownMessage.textContent = `Préparez-vous : départ à ${formatTime(leaveAt)}.`;
  } else {
    ui.countdownPanel.classList.add("state-red", "is-urgent");
    ui.countdownMessage.textContent = "Partez maintenant pour tenter de l’attraper.";
  }
}

function renderSearchResults(stops) {
  ui.searchResults.innerHTML = stops.map((stop, index) => `
    <button type="button" role="option" aria-selected="${index === 0}" id="search-option-${index}" data-stop-index="${index}">
      <span><span class="result-name">${escapeHtml(stop.name)}</span><span class="result-detail">${stop.label !== stop.name ? ` · ${escapeHtml(stop.label)}` : ""}</span></span>
      ${stop.distance ? `<span class="result-distance">${escapeHtml(formatDistance(stop.distance))}</span>` : ""}
    </button>`).join("");
  ui.searchResults.dataset.stopResults = JSON.stringify(stops);
  ui.searchResults.hidden = stops.length === 0;
  ui.search.setAttribute("aria-expanded", String(stops.length > 0));
  if (stops.length) ui.search.setAttribute("aria-activedescendant", "search-option-0");
  else ui.search.removeAttribute("aria-activedescendant");
}

function renderNearby(stops) {
  ui.nearbyWrap.hidden = stops.length === 0;
  ui.nearbyLocation.textContent = currentPosition ? "· dans un rayon de 1 km" : "";
  ui.nearbyStops.innerHTML = stops.map((stop, index) => `
    <button type="button" class="nearby-stop" data-nearby-index="${index}">
      ${icons.location}
      <span class="nearby-stop-name">${escapeHtml(stop.name)}</span>
      <span class="nearby-stop-distance" title="${escapeHtml(stop.walkingMethod === "osrm" ? "Distance piétonne calculée par OSRM" : "Distance directe indicative, pas un itinéraire piéton")}">${escapeHtml(stop.walkingDistanceMeters != null ? `${formatDistance(stop.walkingDistanceMeters)} à pied` : `${formatDistance(stop.distance)} · direct`)}</span>
    </button>`).join("");
  ui.nearbyStops.dataset.stopResults = JSON.stringify(stops);
}

async function findNearestForLine() {
  const lineId = ui.lineFilter.value;
  const lineName = ui.lineFilter.selectedOptions[0]?.textContent || "choisie";
  if (!currentPosition) {
    showNotice("Utilisez « Autour de moi » pour trouver l’arrêt desservi le plus proche de cette ligne.", "info", true);
    renderDepartures();
    return;
  }
  const requestId = ++nearbyRequestId;
  nearbyController?.abort();
  nearbyController = new AbortController();
  ui.nearbyWrap.hidden = false;
  ui.nearbyLocation.textContent = "· calcul de l’itinéraire à pied…";
  ui.nearbyStops.innerHTML = '<div class="empty-state"><span class="search-spinner" aria-hidden="true"></span><p>Recherche des arrêts desservis par cette ligne…</p></div>';
  setStatus(`Recherche des arrêts ${lineName}…`);
  try {
    const stops = await findNearbyStops(currentPosition, { lineId, signal: nearbyController.signal });
    if (requestId !== nearbyRequestId) return;
    if (!stops.length) {
      ui.nearbyStops.innerHTML = '<div class="empty-state"><span class="empty-glyph" aria-hidden="true">!</span><p>Aucun arrêt de cette ligne dans un rayon de 1 km.</p></div>';
      setStatus("Aucun arrêt proche pour cette ligne", "error");
      showNotice(`Aucun arrêt de la ligne ${lineName} trouvé dans un rayon de 1 km. Essayez une autre ligne ou recherchez un arrêt par son nom.`, "info", true);
      renderDepartures();
      return;
    }
    renderNearby(stops);
    await setStop(stops[0]);
    if (requestId !== nearbyRequestId) return;
    const nearest = stops[0];
    const distance = nearest.walkingDistanceMeters ?? nearest.distance;
    const distanceLabel = nearest.walkingMethod === "osrm" ? `${formatDistance(distance)} à pied` : `${formatDistance(distance)} en distance directe`;
    showNotice(`Arrêt le plus proche pour la ligne ${lineName} : ${nearest.name}, à ${distanceLabel}.`, "success");
  } catch (error) {
    if (error.name === "AbortError" || requestId !== nearbyRequestId) return;
    setStatus("Recherche d’arrêt impossible", "error");
    showNotice(error.message, "error", true);
  }
}

async function setStop(stop, preferredFavorite = null) {
  if (!stop?.id) return;
  ui.notice.hidden = true;
  currentStop = stop;
  scheduleDepartureRefresh();
  selectedDeparture = null;
  departures = [];
  walking = null;
  ui.search.value = stop.name;
  ui.searchResults.hidden = true;
  ui.search.setAttribute("aria-expanded", "false");
  ui.search.removeAttribute("aria-activedescendant");
  ui.directionFilter.disabled = true;
  ui.departuresList.innerHTML = '<div class="empty-state"><span class="search-spinner" aria-hidden="true"></span><p>Recherche des prochains passages…</p></div>';
  renderCountdown();
  setStatus("Recherche des passages…");
  try {
    setLastStop(stop);
  } catch (error) {
    showNotice(error.message, "error", true);
  }
  const generation = Date.now();
  currentStop.generation = generation;
  await Promise.all([loadDepartures(generation, preferredFavorite), loadWalking(generation)]);
}

async function loadDepartures(generation, preferredFavorite) {
  requestController?.abort();
  requestController = new AbortController();
  try {
    const result = await getUpcomingDepartures(currentStop.id, { signal: requestController.signal });
    if (!currentStop || currentStop.generation !== generation) return;
    departures = result;
    const favoriteLineId = preferredFavorite?.lineId;
    const favoriteLineIsServed = !favoriteLineId || result.some(item => item.lineId === favoriteLineId);
    if (!favoriteLineIsServed) {
      ui.lineFilter.value = "";
      ui.directionFilter.value = "";
    } else if (favoriteLineId && [...ui.lineFilter.options].some(option => option.value === favoriteLineId)) {
      ui.lineFilter.value = favoriteLineId;
    }
    const lineToUse = ui.lineFilter.value;
    const directions = result.filter(item => !lineToUse || item.lineId === lineToUse).map(item => item.direction);
    const preferredDirection = favoriteLineIsServed ? preferredFavorite?.direction || ui.directionFilter.value : "";
    setSelectOptions(ui.directionFilter, directions, "Toutes les directions", preferredDirection);
    ui.directionFilter.disabled = result.length === 0;
    renderDepartures();
    if (!result.length) {
      setStatus("Aucun départ à venir", "error");
      ui.updatedAt.textContent = "Aucun passage à venir";
    } else {
      setStatus("Horaires théoriques", "idle");
      const feedInfo = await getFeedInfo();
      if (!currentStop || currentStop.generation !== generation) return;
      const publishedDate = feedInfo.updatedAt
        ? new Date(feedInfo.updatedAt).toLocaleDateString("fr-FR")
        : "date inconnue";
      ui.updatedAt.textContent = `GTFS Évéole · publié le ${publishedDate}`;
      ui.notice.hidden = true;
      if (preferredFavorite && (!ui.lineFilter.value || !ui.directionFilter.value)) {
        showNotice("Le favori a été ouvert, mais sa ligne ou sa direction n’est pas proposée actuellement. Affichage des prochains bus disponibles.", "info");
      }
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    if (!currentStop || currentStop.generation !== generation) return;
    setStatus("Données indisponibles", "error");
    ui.departuresList.innerHTML = `<div class="empty-state"><span class="empty-glyph" aria-hidden="true">!</span><p>${escapeHtml(error.message)}</p></div>`;
    ui.updatedAt.textContent = "Actualisation impossible";
    showNotice(error.message, "error", true);
  }
}

async function loadWalking(generation) {
  if (!currentStop) return;
  if (preferences.walkMinutes !== null) {
    walking = { durationMinutes: preferences.walkMinutes, method: "manual", label: "Temps de marche saisi" };
    renderDepartures();
    return;
  }
  if (!currentPosition || currentStop.latitude == null || currentStop.longitude == null) {
    walking = null;
    renderDepartures();
    return;
  }
  try {
    const result = await estimateWalkingRoute(currentPosition, currentStop);
    if (!currentStop || currentStop.generation !== generation) return;
    walking = result;
    renderDepartures();
    ui.summaryWalk.title = result.label;
    if (result.method === "straight-line") {
      showNotice(`Itinéraire piéton indisponible ; temps estimé à vol d’oiseau, à 4,5 km/h (${formatDistance(result.distanceMeters)}).`, "info");
    }
  } catch (error) {
    if (error.name !== "AbortError") showNotice(error.message, "error", true);
  }
}

function scheduleDepartureRefresh() {
  window.clearInterval(departureRefreshTimer);
  if (!currentStop) return;
  departureRefreshTimer = window.setInterval(() => {
    if (currentStop) loadDepartures(currentStop.generation, null);
  }, 60_000);
}

function requestGeolocation({ quiet = false } = {}) {
  if (!navigator.geolocation) {
    if (!quiet) showNotice("La géolocalisation n’est pas disponible sur ce navigateur. Saisissez votre temps de marche dans Réglages.", "info");
    return;
  }
  const requestId = ++geolocationRequestId;
  nearbyRequestId += 1;
  nearbyController?.abort();
  setStatus("Localisation en cours…");
  navigator.geolocation.getCurrentPosition(async position => {
    if (requestId !== geolocationRequestId) return;
    currentPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    if (!quiet) showNotice("Position trouvée. Recherche des arrêts Évéole dans un rayon de 1 km…", "success");
    const locationSearchId = ++nearbyRequestId;
    nearbyController?.abort();
    nearbyController = new AbortController();
    try {
      const selectedLine = ui.lineFilter.value;
      const nearby = await findNearbyStops(currentPosition, { lineId: selectedLine, signal: nearbyController.signal });
      if (requestId !== geolocationRequestId || locationSearchId !== nearbyRequestId) return;
      renderNearby(nearby);
      if (selectedLine && nearby.length) {
        await setStop(nearby[0]);
        showNotice(`Arrêt le plus proche pour la ligne ${ui.lineFilter.selectedOptions[0]?.textContent || ""} : ${nearby[0].name}, à ${formatDistance(nearby[0].walkingDistanceMeters ?? nearby[0].distance)}${nearby[0].walkingMethod === "osrm" ? " à pied" : " en distance directe"}.`, "success");
      } else if (selectedLine && !nearby.length) {
        setStatus("Aucun arrêt proche pour cette ligne", "error");
        showNotice(`Aucun arrêt de la ligne ${ui.lineFilter.selectedOptions[0]?.textContent || "choisie"} trouvé dans un rayon de 1 km. Essayez une autre ligne ou recherchez un arrêt par son nom.`, "info", true);
      } else if (nearby.length && !currentStop) {
        const saved = getFavorites()[0];
        const matchingFavorite = saved ? nearby.find(stop => stop.id === saved.stopId) : null;
        await setStop(matchingFavorite || nearby[0], matchingFavorite ? saved : null);
      } else if (!nearby.length && !currentStop) {
        showNotice("Aucun arrêt Évéole trouvé dans un rayon de 1 km. Recherchez un arrêt par son nom.", "info");
      } else if (currentStop) {
        loadWalking(currentStop.generation);
        setStatus("Position trouvée", "live");
      } else if (!nearby.length) {
        showNotice("Aucun arrêt Évéole trouvé dans un rayon de 1 km. Recherchez un arrêt par son nom.", "info");
      }
    } catch (error) {
      if (error.name === "AbortError" || requestId !== geolocationRequestId || locationSearchId !== nearbyRequestId) return;
      if (!quiet) showNotice(error.message, "error", true);
      setStatus("Calcul des arrêts impossible", "error");
    }
  }, error => {
    if (requestId !== geolocationRequestId) return;
    const explanation = error.code === error.PERMISSION_DENIED
      ? "Accès à la position refusé. Recherchez votre arrêt et indiquez votre temps de marche dans Réglages."
      : error.code === error.POSITION_UNAVAILABLE
        ? "Votre position est indisponible. Recherchez votre arrêt ou saisissez le temps de marche."
        : "La localisation a expiré. Réessayez ou saisissez votre temps de marche.";
    setStatus("Localisation indisponible", "error");
    if (!quiet) showNotice(explanation, "info", true);
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 });
}

function scheduleSearch(query) {
  window.clearTimeout(searchTimer);
  searchController?.abort();
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    renderSearchResults([]);
    return;
  }
  searchTimer = window.setTimeout(async () => {
    searchController = new AbortController();
    ui.searchSpinner.hidden = false;
    try {
      const stops = await searchStops(trimmed, { signal: searchController.signal });
      if (ui.search.value.trim() !== trimmed) return;
      renderSearchResults(stops);
      if (!stops.length) {
        ui.searchResults.innerHTML = '<div class="empty-state" role="status">Aucun arrêt trouvé. Essayez un autre nom.</div>';
        ui.searchResults.hidden = false;
        ui.search.setAttribute("aria-expanded", "true");
      }
    } catch (error) {
      if (error.name !== "AbortError" && ui.search.value.trim() === trimmed) {
        renderSearchResults([]);
        showNotice(error.message, "error", true);
      }
    } finally {
      ui.searchSpinner.hidden = true;
    }
  }, 300);
}

function setSettingsFields() {
  ui.marginSetting.value = String(preferences.marginMinutes);
  ui.walkSetting.value = preferences.walkMinutes == null ? "" : String(preferences.walkMinutes);
}

function openSettings() {
  ui.settingsError.hidden = true;
  setSettingsFields();
  ui.settingsDialog.showModal();
}

function initializeEvents() {
  byId("settings-open").addEventListener("click", openSettings);
  byId("settings-close").addEventListener("click", () => ui.settingsDialog.close());
  ui.settingsDialog.addEventListener("click", event => {
    if (event.target === ui.settingsDialog) ui.settingsDialog.close();
  });
  ui.settingsForm.addEventListener("submit", event => {
    event.preventDefault();
    ui.settingsError.hidden = true;
    try {
      preferences = saveSettings({ marginMinutes: ui.marginSetting.value, walkMinutes: ui.walkSetting.value });
      if (preferences.walkMinutes !== null) {
        walking = { durationMinutes: preferences.walkMinutes, method: "manual", label: "Temps saisi dans les réglages" };
      } else {
        walking = null;
        if (currentPosition && currentStop) loadWalking(currentStop.generation);
      }
      renderDepartures();
      ui.settingsDialog.close();
      showNotice("Vos réglages ont été enregistrés sur cet appareil.", "success");
    } catch (error) {
      ui.settingsError.textContent = error.message;
      ui.settingsError.hidden = false;
    }
  });
  byId("manage-favorites").addEventListener("click", () => {
    ui.settingsDialog.close();
    byId("favorites-section").scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });
  });
  ui.search.addEventListener("input", () => scheduleSearch(ui.search.value));
  ui.search.addEventListener("keydown", event => {
    const options = [...ui.searchResults.querySelectorAll('[role="option"]')];
    const selected = options.findIndex(option => option.getAttribute("aria-selected") === "true");
    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      const next = Math.min(selected + 1, options.length - 1);
      options.forEach((option, index) => option.setAttribute("aria-selected", String(index === next)));
      ui.search.setAttribute("aria-activedescendant", options[next].id);
    } else if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      const next = Math.max(selected - 1, 0);
      options.forEach((option, index) => option.setAttribute("aria-selected", String(index === next)));
      ui.search.setAttribute("aria-activedescendant", options[next].id);
    } else if (event.key === "Enter" && selected >= 0) {
      event.preventDefault();
      options[selected].click();
    } else if (event.key === "Escape") {
      ui.searchResults.hidden = true;
      ui.search.setAttribute("aria-expanded", "false");
      ui.search.removeAttribute("aria-activedescendant");
    }
  });
  ui.searchResults.addEventListener("click", event => {
    const button = event.target.closest("[data-stop-index]");
    if (!button) return;
    const stops = JSON.parse(ui.searchResults.dataset.stopResults || "[]");
    setStop(stops[Number(button.dataset.stopIndex)]);
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".search-control")) {
      ui.searchResults.hidden = true;
      ui.search.setAttribute("aria-expanded", "false");
      ui.search.removeAttribute("aria-activedescendant");
    }
  });
  byId("locate-button").addEventListener("click", () => requestGeolocation());
  ui.nearbyStops.addEventListener("click", event => {
    const button = event.target.closest("[data-nearby-index]");
    if (!button) return;
    const stops = JSON.parse(ui.nearbyStops.dataset.stopResults || "[]");
    setStop(stops[Number(button.dataset.nearbyIndex)]);
  });
  ui.lineFilter.addEventListener("change", () => {
    ui.directionFilter.value = "";
    if (ui.lineFilter.value && currentPosition) {
      findNearestForLine();
      return;
    }
    const directions = departures.filter(item => !ui.lineFilter.value || item.lineId === ui.lineFilter.value).map(item => item.direction);
    setSelectOptions(ui.directionFilter, directions, "Toutes les directions");
    renderDepartures();
    if (ui.lineFilter.value && !directions.length && currentStop) {
      showNotice("Cette ligne ne dessert pas l’arrêt sélectionné. Utilisez « Autour de moi » pour choisir son arrêt le plus proche.", "info", true);
    }
  });
  ui.directionFilter.addEventListener("change", renderDepartures);
  ui.departuresList.addEventListener("click", event => {
    const saveButton = event.target.closest("[data-save-id]");
    if (saveButton) {
      const departure = departures.find(item => item.id === saveButton.dataset.saveId);
      persistFavorite(departure);
      return;
    }
    const selection = event.target.closest("[data-departure-id]");
    if (!selection) return;
    selectedDeparture = departures.find(item => item.id === selection.dataset.departureId) || null;
    if (selectedDeparture) {
      ui.lineFilter.value = selectedDeparture.lineId;
      const directions = departures.filter(item => item.lineId === selectedDeparture.lineId).map(item => item.direction);
      setSelectOptions(ui.directionFilter, directions, "Toutes les directions", selectedDeparture.direction);
      renderDepartures();
    }
  });
  ui.favoriteToggle.addEventListener("click", () => persistFavorite(selectedDeparture));
  ui.favoritesList.addEventListener("click", event => {
    const removeButton = event.target.closest("[data-favorite-remove]");
    if (removeButton) {
      const favorite = getFavorites()[Number(removeButton.dataset.favoriteRemove)];
      if (!favorite) return;
      try {
        removeFavorite(favorite);
        renderFavorites();
        renderDepartures();
        showNotice("Arrêt retiré des favoris.", "success");
      } catch (error) {
        showNotice(error.message, "error", true);
      }
      return;
    }
    const selectButton = event.target.closest("[data-favorite-index]");
    if (!selectButton) return;
    const favorite = getFavorites()[Number(selectButton.dataset.favoriteIndex)];
    if (favorite) setStop({ id: favorite.stopId, name: favorite.stopName }, favorite);
  });
}

function persistFavorite(departure) {
  const favorite = favoriteFromDeparture(departure);
  if (!favorite) return;
  try {
    const result = toggleFavorite(favorite);
    renderFavorites();
    renderDepartures();
    showNotice(result.saved ? `${favorite.stopName} · ${favorite.lineName} vers ${favorite.direction} enregistré dans vos favoris.` : "Favori retiré.", "success");
  } catch (error) {
    showNotice(error.message, "error", true);
  }
}

function restoreDefault() {
  const favorite = getFavorites()[0];
  const lastStop = getLastStop();
  const target = favorite || lastStop;
  if (!target) return;
  setStop({
    id: target.stopId || target.id,
    name: target.stopName || target.name,
    latitude: target.latitude ?? null,
    longitude: target.longitude ?? null
  }, favorite);
}

function initializePwa() {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.error("Impossible d’activer le mode hors ligne.", error);
      showNotice("L’application fonctionne, mais son installation hors ligne n’a pas pu être activée.", "info");
    });
  }
}

function initialize() {
  initializeEvents();
  renderFavorites();
  renderCountdown();
  setSettingsFields();
  initializePwa();
  setStatus("Horaires théoriques");
  getLines().then(lines => setLineOptions(lines, getFavorites()[0]?.lineId || "")).catch(error => {
    ui.lineFilter.disabled = true;
    showNotice(error.message, "error", true);
  });
  restoreDefault();
  requestGeolocation();
  window.setInterval(renderCountdown, 1000);
  window.addEventListener("online", () => {
    showNotice("Connexion rétablie. Actualisation des horaires…", "success");
    if (currentStop) loadDepartures(currentStop.generation, null);
  });
  window.addEventListener("offline", () => showNotice("Connexion perdue. Les horaires théoriques ne peuvent plus être actualisés ; les prochains passages visibles ne sont plus vérifiables.", "error", true));
}

initialize();
