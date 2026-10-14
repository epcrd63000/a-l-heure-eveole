const STORAGE_KEY = "a-lheure.eveole.v1";

const DEFAULTS = Object.freeze({
  marginMinutes: 2,
  walkMinutes: null,
  favorites: [],
  mode: "automatic",
  lastStop: null
});

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const stored = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...stored,
      marginMinutes: clamp(Number(stored.marginMinutes) || DEFAULTS.marginMinutes, 1, 10),
      walkMinutes: stored.walkMinutes == null || stored.walkMinutes === "" ? null : clamp(Number(stored.walkMinutes), 1, 180),
      favorites: Array.isArray(stored.favorites) ? stored.favorites.filter(isFavorite) : [],
      mode: stored.mode === "manual" ? "manual" : "automatic"
    };
  } catch (error) {
    console.error("Impossible de lire les préférences locales.", error);
    return { ...DEFAULTS };
  }
}

function isFavorite(item) {
  return item && typeof item.stopId === "string" && typeof item.stopName === "string"
    && typeof item.lineName === "string" && typeof item.direction === "string";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Impossible d’enregistrer les préférences locales.", error);
    throw new Error("Le navigateur n’a pas pu enregistrer ce réglage. Vérifiez l’espace disponible et les autorisations de stockage.");
  }
}

export function getSettings() {
  return readState();
}

export function saveSettings(changes) {
  const current = readState();
  const marginMinutes = Number(changes.marginMinutes);
  const rawWalk = changes.walkMinutes;
  const walkMinutes = rawWalk === "" || rawWalk == null ? null : Number(rawWalk);
  if (!Number.isInteger(marginMinutes) || marginMinutes < 1 || marginMinutes > 10) {
    throw new Error("La marge de sécurité doit être comprise entre 1 et 10 minutes.");
  }
  if (walkMinutes !== null && (!Number.isInteger(walkMinutes) || walkMinutes < 1 || walkMinutes > 180)) {
    throw new Error("Le temps de marche doit être compris entre 1 et 180 minutes, ou laissé vide.");
  }
  const next = {
    ...current,
    marginMinutes,
    walkMinutes,
    mode: walkMinutes === null ? "automatic" : "manual"
  };
  writeState(next);
  return next;
}

export function setLastStop(stop) {
  const current = readState();
  const lastStop = stop && typeof stop.id === "string"
    ? { id: stop.id, name: stop.name, latitude: stop.latitude, longitude: stop.longitude }
    : null;
  writeState({ ...current, lastStop });
}

export function getLastStop() {
  return readState().lastStop;
}

export function getFavorites() {
  return readState().favorites;
}

export function toggleFavorite(favorite) {
  if (!isFavorite(favorite)) throw new Error("Les informations de cet arrêt favori sont incomplètes.");
  const current = readState();
  const key = favoriteKey(favorite);
  const existing = current.favorites.findIndex(item => favoriteKey(item) === key);
  const favorites = existing >= 0
    ? current.favorites.filter((_, index) => index !== existing)
    : [{ ...favorite }, ...current.favorites].slice(0, 20);
  writeState({ ...current, favorites });
  return { favorites, saved: existing < 0 };
}

export function removeFavorite(favorite) {
  const current = readState();
  const favorites = current.favorites.filter(item => favoriteKey(item) !== favoriteKey(favorite));
  writeState({ ...current, favorites });
  return favorites;
}

function favoriteKey(item) {
  return `${item.stopId}|${item.lineId || item.lineName}|${item.direction}`.toLocaleLowerCase("fr");
}
