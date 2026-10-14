const DATASET_API = "https://www.data.gouv.fr/api/1/datasets/5fff2eb33452677715ff8fe6/";
const OSRM_BASE = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";
const OSRM_TABLE_BASE = "https://routing.openstreetmap.de/routed-foot/table/v1/driving";
const REQUEST_TIMEOUT_MS = 20000;
const WALKING_METERS_PER_MINUTE = 75;

let feedPromise = null;

async function fetchWithTimeout(url, { signal, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      if (response.status === 404) throw new Error("Le flux GTFS Évéole n’est pas disponible. Réessayez plus tard.");
      if (response.status === 429) throw new Error("Le serveur Open Data limite temporairement les téléchargements. Réessayez dans un instant.");
      throw new Error(`Le service Open Data répond avec une erreur ${response.status}. Réessayez plus tard.`);
    }
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      if (signal?.aborted) throw error;
      throw new Error("Le téléchargement du flux transport a expiré. Vérifiez votre connexion puis réessayez.");
    }
    if (error instanceof TypeError) {
      throw new Error("Connexion impossible au flux gratuit Open Data Évéole. Vérifiez votre réseau puis réessayez.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function* parseCsvRows(text) {
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") yield row;
      row = [];
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") yield row;
  }
}

function readCsv(text) {
  const iterator = parseCsvRows(text);
  const header = iterator.next().value;
  if (!header) return [];
  const positions = new Map(header.map((name, index) => [name.replace(/^\uFEFF/, ""), index]));
  const records = [];
  for (const fields of iterator) {
    const record = {};
    for (const [name, position] of positions) record[name] = fields[position] || "";
    records.push(record);
  }
  return records;
}

function readZipEntries(bytes) {
  const view = new DataView(bytes);
  let endOffset = -1;
  const earliestEndOffset = Math.max(0, bytes.byteLength - 22 - 65535);
  for (let offset = bytes.byteLength - 22; offset >= earliestEndOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Le fichier de données Évéole n’est pas une archive ZIP valide.");
  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Le flux GTFS contient un index ZIP illisible.");
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const fileName = decoder.decode(new Uint8Array(bytes, offset + 46, nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressedData = new Uint8Array(bytes, dataOffset, compressedSize);
    entries.set(fileName.split("/").pop().toLowerCase(), { method, compressedData });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function unzipText(entries, name) {
  const entry = entries.get(name);
  if (!entry) throw new Error(`Le fichier ${name} est absent du flux GTFS Évéole.`);
  if (entry.method === 0) return new TextDecoder("utf-8", { fatal: false }).decode(entry.compressedData);
  if (entry.method !== 8 || typeof DecompressionStream === "undefined") {
    throw new Error("Ce navigateur ne sait pas décompresser le flux GTFS. Utilisez un navigateur récent.");
  }
  try {
    const stream = new Blob([entry.compressedData]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("deflate-raw")) {
      throw new Error("La décompression du flux GTFS n’est pas prise en charge par ce navigateur.");
    }
    throw error;
  }
}

function parseDate(value) {
  if (!/^\d{8}$/.test(value || "")) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
}

function dateKey(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function serviceIsActive(serviceId, dateKeyValue, calendars, exceptions) {
  const exception = exceptions.get(`${serviceId}|${dateKeyValue}`);
  if (exception === "1") return true;
  if (exception === "2") return false;
  const calendar = calendars.get(serviceId);
  if (!calendar) return false;
  const date = parseDate(dateKeyValue);
  if (!date || dateKeyValue < calendar.startDate || dateKeyValue > calendar.endDate) return false;
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return calendar[dayNames[date.getDay()]] === "1";
}

function toDepartureDate(serviceDate, time) {
  const match = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(time || "");
  if (!match) return null;
  const [, hoursText, minutesText, secondsText] = match;
  const result = new Date(serviceDate);
  result.setDate(result.getDate() + Math.floor(Number(hoursText) / 24));
  result.setHours(Number(hoursText) % 24, Number(minutesText), Number(secondsText), 0);
  return result;
}

function haversineDistance(a, b) {
  const radians = degrees => degrees * Math.PI / 180;
  const dLatitude = radians(b.latitude - a.latitude);
  const dLongitude = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const haversine = Math.sin(dLatitude / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(dLongitude / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function normalizeStop(record) {
  const latitude = Number(record.stop_lat);
  const longitude = Number(record.stop_lon);
  return {
    id: record.stop_id,
    name: record.stop_name,
    label: record.stop_name,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    type: "stop_area",
    parentId: record.parent_station || null,
    locationType: record.location_type || "0"
  };
}

async function loadFeed(signal) {
  const metadataResponse = await fetchWithTimeout(DATASET_API, { signal });
  const metadata = await metadataResponse.json();
  const resource = [...(metadata.resources || [])]
    .filter(item => item.format?.toLowerCase() === "zip" && item.url)
    .sort((a, b) => new Date(b.last_modified || b.created_at) - new Date(a.last_modified || a.created_at))[0];
  if (!resource) throw new Error("Le jeu de données GTFS Évéole ne contient pas d’archive ZIP disponible.");
  const zipResponse = await fetchWithTimeout(resource.url, { signal });
  const bytes = await zipResponse.arrayBuffer();
  const entries = readZipEntries(bytes);
  const [stopsText, routesText, tripsText, calendarText, calendarDatesText, stopTimesText] = await Promise.all([
    unzipText(entries, "stops.txt"),
    unzipText(entries, "routes.txt"),
    unzipText(entries, "trips.txt"),
    unzipText(entries, "calendar.txt"),
    entries.has("calendar_dates.txt") ? unzipText(entries, "calendar_dates.txt") : Promise.resolve(""),
    unzipText(entries, "stop_times.txt")
  ]);
  const stops = readCsv(stopsText).map(normalizeStop).filter(stop =>
    stop.id && stop.name && stop.latitude != null && stop.longitude != null);
  const stopTimeRows = parseCsvRows(stopTimesText);
  const stopTimeHeader = stopTimeRows.next().value || [];
  const stopTimeIndices = new Map(["trip_id", "departure_time", "stop_id", "stop_headsign"]
    .map(name => [name, stopTimeHeader.indexOf(name)]));
  if (stopTimeIndices.get("trip_id") < 0 || stopTimeIndices.get("departure_time") < 0 || stopTimeIndices.get("stop_id") < 0) {
    throw new Error("Le fichier des horaires du GTFS Évéole ne contient pas les colonnes nécessaires.");
  }
  const stopTimesByStop = new Map();
  for (const row of stopTimeRows) {
    const stopId = row[stopTimeIndices.get("stop_id")];
    if (!stopTimesByStop.has(stopId)) stopTimesByStop.set(stopId, []);
    stopTimesByStop.get(stopId).push([
      row[stopTimeIndices.get("trip_id")],
      row[stopTimeIndices.get("departure_time")],
      stopTimeIndices.get("stop_headsign") < 0 ? "" : row[stopTimeIndices.get("stop_headsign")]
    ]);
  }
  const stopById = new Map(stops.map(stop => [stop.id, stop]));
  const childrenByStation = new Map();
  for (const stop of stops) {
    if (stop.parentId) {
      if (!childrenByStation.has(stop.parentId)) childrenByStation.set(stop.parentId, []);
      childrenByStation.get(stop.parentId).push(stop.id);
    }
  }
  const publicStops = stops.filter(stop => !stop.parentId);
  const routes = new Map(readCsv(routesText).map(route => [route.route_id, {
    id: route.route_id,
    name: route.route_short_name || route.route_long_name || route.route_id,
    longName: route.route_long_name || ""
  }]));
  const trips = new Map(readCsv(tripsText).map(trip => [trip.trip_id, {
    routeId: trip.route_id,
    serviceId: trip.service_id,
    headsign: trip.trip_headsign || ""
  }]));
  const calendars = new Map(readCsv(calendarText).map(calendar => [calendar.service_id, {
    ...calendar,
    startDate: calendar.start_date,
    endDate: calendar.end_date
  }]));
  const exceptions = new Map(readCsv(calendarDatesText).map(item => [`${item.service_id}|${item.date}`, item.exception_type]));
  const routesByStop = new Map();
  for (const [stopId, stopTimes] of stopTimesByStop) {
    const stop = stopById.get(stopId);
    const publicStopId = stop?.parentId || stopId;
    for (const [tripId] of stopTimes) {
      const trip = trips.get(tripId);
      if (!trip) continue;
      if (!routesByStop.has(publicStopId)) routesByStop.set(publicStopId, new Set());
      routesByStop.get(publicStopId).add(trip.routeId);
    }
  }
  return {
    stops,
    publicStops,
    stopById,
    childrenByStation,
    routes,
    routesByStop,
    trips,
    calendars,
    exceptions,
    stopTimesByStop,
    sourceUpdatedAt: resource.last_modified || resource.created_at || metadata.last_modified,
    sourceUrl: "https://www.data.gouv.fr/datasets/eveole-douai-reseau-bus-du-syndicat-mixte-des-transports-du-douaisis-smtd"
  };
}

export async function getFeed() {
  if (!feedPromise) {
    feedPromise = loadFeed().catch(error => {
      feedPromise = null;
      throw error;
    });
  }
  return feedPromise;
}

export function clearFeedCache() {
  feedPromise = null;
}

export async function getLines() {
  const feed = await getFeed();
  return [...feed.routes.values()]
    .map(route => ({ id: route.id, name: route.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
}

export async function getFeedInfo() {
  const feed = await getFeed();
  return {
    stopCount: feed.publicStops.length,
    updatedAt: feed.sourceUpdatedAt,
    sourceUrl: feed.sourceUrl
  };
}

export async function searchStops(query, { signal } = {}) {
  const feed = await loadOrReuseFeed(signal);
  const trimmed = query.trim().toLocaleLowerCase("fr");
  if (trimmed.length < 2) return [];
  return feed.publicStops
    .filter(stop => stop.name.toLocaleLowerCase("fr").includes(trimmed))
    .slice(0, 10);
}

export async function findNearbyStops(position, { signal, lineId = "" } = {}) {
  const feed = await loadOrReuseFeed(signal);
  const candidates = feed.publicStops
    .filter(stop => !lineId || feed.routesByStop.get(stop.id)?.has(lineId))
    .map(stop => ({ ...stop, distance: haversineDistance(position, stop) }))
    .filter(stop => stop.distance <= 1000)
    .sort((a, b) => a.distance - b.distance);
  if (!candidates.length) return [];

  try {
    for (let offset = 0; offset < candidates.length; offset += 50) {
      const batch = candidates.slice(offset, offset + 50);
      const coordinates = [
        `${position.longitude},${position.latitude}`,
        ...batch.map(stop => `${stop.longitude},${stop.latitude}`)
      ].join(";");
      const params = new URLSearchParams({
        sources: "0",
        destinations: batch.map((_, index) => index + 1).join(";"),
        annotations: "distance,duration"
      });
      const url = `${OSRM_TABLE_BASE}/${coordinates}?${params}`;
      const response = await fetchWithTimeout(url, { signal, timeoutMs: 10000 });
      const matrix = await response.json();
      if (matrix.code !== "Ok" || !Array.isArray(matrix.distances?.[0])) {
        throw new Error("Le calcul des distances piétonnes est indisponible.");
      }
      for (let index = 0; index < batch.length; index += 1) {
        const distanceMeters = matrix.distances[0][index];
        const durationSeconds = matrix.durations?.[0]?.[index];
        if (Number.isFinite(distanceMeters)) batch[index].walkingDistanceMeters = distanceMeters;
        if (Number.isFinite(durationSeconds)) batch[index].walkingDurationMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
        batch[index].walkingMethod = Number.isFinite(distanceMeters) ? "osrm" : "straight-line";
      }
    }
  } catch (error) {
    if (error.name === "AbortError" && signal?.aborted) throw error;
    for (const stop of candidates) {
      delete stop.walkingDistanceMeters;
      delete stop.walkingDurationMinutes;
      stop.walkingMethod = "straight-line";
    }
  }
  return candidates.sort((a, b) =>
    (a.walkingDistanceMeters ?? a.distance) - (b.walkingDistanceMeters ?? b.distance));
}

async function loadOrReuseFeed(signal) {
  if (!feedPromise) {
    feedPromise = loadFeed(signal).catch(error => {
      feedPromise = null;
      throw error;
    });
  }
  return feedPromise;
}

export async function getUpcomingDepartures(stopId, { signal } = {}) {
  const feed = await loadOrReuseFeed(signal);
  const selectedStop = feed.stopById.get(stopId);
  if (!selectedStop) throw new Error("Cet arrêt n’existe plus dans le flux GTFS. Recherchez-le à nouveau.");
  const acceptedStops = new Set(feed.childrenByStation.get(stopId) || [stopId]);
  const now = new Date();
  const firstServiceDate = new Date(now);
  firstServiceDate.setHours(0, 0, 0, 0);
  firstServiceDate.setDate(firstServiceDate.getDate() - 1);
  const dates = Array.from({ length: 9 }, (_, index) => {
    const date = new Date(firstServiceDate);
    date.setDate(date.getDate() + index);
    return date;
  });
  const activeDatesByService = new Map();
  for (const date of dates) {
    const key = dateKey(date);
    const active = new Set();
    for (const serviceId of feed.calendars.keys()) {
      if (serviceIsActive(serviceId, key, feed.calendars, feed.exceptions)) active.add(serviceId);
    }
    for (const [exceptionKey, exceptionType] of feed.exceptions) {
      const [serviceId, exceptionDate] = exceptionKey.split("|");
      if (exceptionDate !== key) continue;
      if (exceptionType === "1") active.add(serviceId);
      if (exceptionType === "2") active.delete(serviceId);
    }
    for (const serviceId of active) {
      if (!activeDatesByService.has(serviceId)) activeDatesByService.set(serviceId, []);
      activeDatesByService.get(serviceId).push(date);
    }
  }

  const candidates = new Map();
  const nowTime = now.getTime();
  for (const boardStopId of acceptedStops) {
    for (const [tripId, departureTime, stopHeadsign] of feed.stopTimesByStop.get(boardStopId) || []) {
      const trip = feed.trips.get(tripId);
      if (!trip) continue;
      const route = feed.routes.get(trip.routeId);
      if (!route) continue;
      const direction = stopHeadsign || trip.headsign || route.longName || "Direction non précisée";
      for (const serviceDate of activeDatesByService.get(trip.serviceId) || []) {
        const departureAt = toDepartureDate(serviceDate, departureTime);
        if (!departureAt || departureAt.getTime() <= nowTime) continue;
        const serviceKey = dateKey(serviceDate);
        const departure = {
          id: `${stopId}:${trip.routeId}:${trip.serviceId}:${serviceKey}:${departureTime}`,
          lineId: route.id,
          lineName: route.name,
          direction,
          departureAt,
          realtime: false,
          freshness: "theoretical_schedule"
        };
        const key = `${route.id}|${direction}|${departureAt.getTime()}`;
        if (!candidates.has(key)) candidates.set(key, departure);
      }
    }
  }
  return [...candidates.values()].sort((a, b) => a.departureAt - b.departureAt).slice(0, 30);
}

export async function estimateWalkingRoute(origin, destination, { signal } = {}) {
  const from = validCoordinates(origin);
  const to = validCoordinates(destination);
  if (!from || !to) {
    return { distanceMeters: null, durationMinutes: null, method: "unavailable", label: "Distance indisponible" };
  }
  try {
    const url = `${OSRM_BASE}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false&alternatives=false`;
    const response = await fetchWithTimeout(url, { signal, timeoutMs: 6500 });
    const result = await response.json();
    const route = result.routes?.[0];
    if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      throw new Error("OSRM returned no walking route");
    }
    return {
      distanceMeters: route.distance,
      durationMinutes: Math.max(1, Math.ceil(route.duration / 60)),
      method: "osrm",
      label: "Itinéraire piéton OSRM"
    };
  } catch (error) {
    if (error.name === "AbortError" && signal?.aborted) throw error;
    const distanceMeters = haversineDistance(from, to);
    return {
      distanceMeters,
      durationMinutes: Math.max(1, Math.ceil(distanceMeters / WALKING_METERS_PER_MINUTE)),
      method: "straight-line",
      label: "Estimation à vol d’oiseau · 4,5 km/h"
    };
  }
}

function validCoordinates(value) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
