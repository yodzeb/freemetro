/* ============================================================
 * freemetro — game logic
 * a small transit-puzzle PWA in pure HTML/CSS/JS.
 * everything (rendering, simulation, input, ui) lives here.
 * ============================================================ */

'use strict';

/* -------------------------------------------------------------
 * 1. CONSTANTS & DATA TABLES
 * everything tweakable lives here.
 * ------------------------------------------------------------- */

const CFG = {
  // simulation timing
  SECONDS_PER_DAY: 20,            // real seconds for one in-game day
  DAYS_PER_WEEK: 7,
  // station spawn cadence (in days)
  STATION_SPAWN_DAYS: 1.4,
  // passenger spawn cadence (per active station, in days)
  PASSENGER_SPAWN_DAYS: 2.6,
  // overcrowding
  STATION_CAPACITY: 6,
  OVERCROWD_DAYS: 2.4,             // game over if any station stays full this long
  // shapes — basic three forever, exotic shapes appear as week progresses
  BASE_SHAPES: ['circle', 'triangle', 'square'],
  EXOTIC_SHAPES: ['diamond', 'pentagon', 'star', 'cross', 'gem', 'hexagon', 'drop', 'crescent'],
  EXOTIC_SHAPE_WEEK: 2,            // first week an exotic shape can appear
  // trains
  TRAIN_SPEED: 80,                 // px/s base
  TRAIN_LOAD_TIME: 0.18,           // seconds per passenger boarding/alighting
  TRAIN_BASE_CAPACITY: 6,
  CARRIAGE_CAPACITY: 6,
  // starting state
  STARTING_CASH: 0,                // start with no cash, but a small pre-stock
  STARTING_LINES: 3,               // 3 free line slots from the get-go
  STARTING_TRAINS: 3,              // 3 free trains in inventory
  STARTING_TUNNELS: 3,             // 3 free crossings
  STARTING_INTERCHANGES: 0,
  // income per delivery
  FARE_BASE: 1,                    // base coins per delivered passenger
  FARE_EXOTIC: 1,                  // bonus for exotic shape passenger
  // asset prices: price(n) = base + step * n_purchased
  PRICES: {
    line:        { base: 20, step: 10, max: 4 },   // 4 purchasable beyond starting 3 (cap 7 lines)
    train:       { base: 10, step:  5, max: Infinity },
    carriage:    { base: 12, step:  4, max: Infinity },
    interchange: { base: 15, step:  5, max: Infinity },
    crossing:    { base:  5, step:  2, max: Infinity },
  },
  REFUND_RATIO: 0.6,               // line removal refund
  // line snap distance
  HIT_RADIUS: 22,
  // station radius
  STATION_RADIUS: 13,
  // station shape weights — common shapes are far more frequent
  COMMON_WEIGHT: 9,
  EXOTIC_STATION_WEIGHT: 2,
};

/* Per-edge map margins. Smaller on small screens so mobile users actually
   see most of the play area. Computed dynamically from viewport size so the
   spawn area scales to fit the visible chrome. */
function mapMargin() {
  const w = G.width  || 800;
  const h = G.height || 600;
  // narrow screens (<700px wide): tight margins; chrome is smaller anyway
  if (w < 700) return { top: 56, right: 16, bottom: 70, left: 16 };
  // medium
  if (w < 1100) return { top: 70, right: 36, bottom: 80, left: 36 };
  // desktop
  return { top: 80, right: 50, bottom: 90, left: 50 };
}

// transit-line palette (names match css custom props order)
const LINE_COLORS = [
  '#d6453d', '#2f6db5', '#f2b338', '#2f8f5c',
  '#7a4ea8', '#d9722a', '#c84e8b'
];

/* -------------------------------------------------------------
 * cities — programmatic, data-driven definitions.
 * each city has:
 *   - name
 *   - coords: visual hint for layout center (0..1 normalized)
 *   - rivers: array of polyline coordinates in normalized space (0..1)
 *     rendered as water bands; stations on opposite sides need tunnels.
 *   - shapeWeights: optional map biasing certain shapes for this city
 * the river is just a polyline; we thicken it at draw time.
 * ------------------------------------------------------------- */

const CITIES = [
  { id: 'london',     name: 'London',         rivers: [[[0.05,0.55],[0.30,0.50],[0.55,0.62],[0.78,0.55],[0.95,0.60]]] },
  { id: 'paris',      name: 'Paris',          rivers: [[[0.00,0.55],[0.40,0.48],[0.62,0.55],[1.00,0.50]]] },
  { id: 'newyork',    name: 'New York',       rivers: [[[0.32,0.00],[0.34,0.45],[0.30,0.75],[0.20,1.00]], [[0.78,0.00],[0.80,0.50],[0.85,1.00]]] },
  { id: 'warsaw',     name: 'Warsaw',         rivers: [[[0.55,0.00],[0.50,0.45],[0.55,1.00]]] },
  { id: 'lisbon',     name: 'Lisbon',         rivers: [[[0.00,0.78],[0.50,0.72],[1.00,0.80]]] },
  { id: 'tokyo',      name: 'Tokyo',          rivers: [[[0.00,0.62],[0.45,0.58],[0.65,0.70],[1.00,0.65]]] },
  { id: 'chicago',    name: 'Chicago',        rivers: [[[0.10,0.00],[0.40,0.40],[0.55,0.50],[1.00,0.45]]] },
  { id: 'budapest',   name: 'Budapest',       rivers: [[[0.45,0.00],[0.50,0.50],[0.45,1.00]]] },
  { id: 'berlin',     name: 'Berlin',         rivers: [[[0.00,0.50],[0.30,0.45],[0.60,0.55],[1.00,0.48]]] },
  { id: 'melbourne',  name: 'Melbourne',      rivers: [[[0.00,0.65],[0.50,0.62],[1.00,0.70]]] },
  { id: 'hongkong',   name: 'Hong Kong',      rivers: [[[0.00,0.40],[1.00,0.45]]] },
  { id: 'barcelona',  name: 'Barcelona',      rivers: [] },
  { id: 'osaka',      name: 'Osaka',          rivers: [[[0.00,0.50],[0.45,0.45],[0.60,0.55],[1.00,0.50]]] },
  { id: 'stockholm',  name: 'Stockholm',      rivers: [[[0.00,0.50],[0.50,0.42],[1.00,0.55]], [[0.30,0.00],[0.40,0.30],[0.30,0.50]]] },
  { id: 'stpetersburg', name: 'St. Petersburg', rivers: [[[0.00,0.45],[0.40,0.50],[0.70,0.40],[1.00,0.50]]] },
  { id: 'boston',     name: 'Boston',         rivers: [[[0.00,0.40],[0.50,0.48],[1.00,0.55]]] },
  { id: 'montreal',   name: 'Montreal',       rivers: [[[0.00,0.65],[0.40,0.55],[0.70,0.65],[1.00,0.55]]] },
  { id: 'sanfrancisco', name: 'San Francisco', rivers: [[[0.10,0.00],[0.18,0.50],[0.10,1.00]]] },
  { id: 'saopaulo',   name: 'São Paulo',      rivers: [[[0.00,0.60],[0.50,0.55],[1.00,0.62]]] },
  { id: 'seoul',      name: 'Seoul',          rivers: [[[0.00,0.55],[0.50,0.50],[1.00,0.55]]] },
  { id: 'santiago',   name: 'Santiago',       rivers: [[[0.00,0.50],[0.40,0.48],[1.00,0.50]]] },
  { id: 'washington', name: 'Washington D.C.', rivers: [[[0.10,0.00],[0.20,0.40],[0.40,0.55],[0.70,0.60],[1.00,0.65]]] },
  { id: 'tashkent',   name: 'Tashkent',       rivers: [] },
  { id: 'singapore',  name: 'Singapore',      rivers: [[[0.00,0.85],[1.00,0.85]]] },
  { id: 'cairo',      name: 'Cairo',          rivers: [[[0.45,0.00],[0.50,0.50],[0.55,1.00]]] },
  { id: 'istanbul',   name: 'Istanbul',       rivers: [[[0.50,0.00],[0.40,0.40],[0.60,0.60],[0.50,1.00]]] },
  { id: 'shanghai',   name: 'Shanghai',       rivers: [[[0.00,0.45],[0.40,0.50],[0.55,0.40],[0.70,0.55],[1.00,0.50]]] },
  { id: 'guangzhou',  name: 'Guangzhou',      rivers: [[[0.00,0.55],[1.00,0.60]]] },
  { id: 'nanjing',    name: 'Nanjing',        rivers: [[[0.00,0.40],[1.00,0.45]]] },
  { id: 'chongqing',  name: 'Chongqing',      rivers: [[[0.00,0.55],[0.40,0.45],[0.55,0.55],[1.00,0.50]]] },
  { id: 'mumbai',     name: 'Mumbai',         rivers: [[[0.20,0.00],[0.30,0.50],[0.20,1.00]]] },
  { id: 'addisababa', name: 'Addis Ababa',    rivers: [] },
  { id: 'lagos',      name: 'Lagos',          rivers: [[[0.00,0.75],[1.00,0.78]]] },
  { id: 'auckland',   name: 'Auckland',       rivers: [[[0.00,0.30],[1.00,0.35]]] },
  // historical alternates
  { id: 'london1960',  name: 'London 1960',  rivers: [[[0.05,0.55],[0.30,0.50],[0.55,0.62],[0.78,0.55],[0.95,0.60]]], unlock: 'london' },
  { id: 'paris1937',   name: 'Paris 1937',   rivers: [[[0.00,0.55],[0.40,0.48],[0.62,0.55],[1.00,0.50]]],  unlock: 'paris' },
  { id: 'newyork1972', name: 'New York 1972', rivers: [[[0.32,0.00],[0.34,0.45],[0.30,0.75],[0.20,1.00]], [[0.78,0.00],[0.80,0.50],[0.85,1.00]]], unlock: 'newyork' },
];

const MODES = {
  // target: deliveries needed to "complete" the city. After hitting target,
  //   game offers victory screen + continue option.
  // difficultyRamp: how aggressively passenger spawn rate ramps with score
  //   (higher = harder progression).
  normal:   { canEdit: true,  endless: false, creative: false, fareMult: 1.0,  spawnMult: 1.0,  target: 500, difficultyRamp: 1.0 },
  extreme:  { canEdit: false, endless: false, creative: false, fareMult: 1.25, spawnMult: 1.1,  target: 750, difficultyRamp: 1.4 },
  endless:  { canEdit: true,  endless: true,  creative: false, fareMult: 1.0,  spawnMult: 0.85, target: 0,   difficultyRamp: 0.8 },
  creative: { canEdit: true,  endless: true,  creative: true,  fareMult: 1.0,  spawnMult: 1.0,  target: 0,   difficultyRamp: 0.0 },
};

/* -------------------------------------------------------------
 * 2. STATE
 * ------------------------------------------------------------- */

const G = {
  // dom
  canvas: null, ctx: null,
  width: 0, height: 0, dpr: 1,

  // session
  city: null,           // CITIES entry
  modeId: 'normal',
  mode: MODES.normal,

  // simulation clock
  running: false,
  paused: false,
  speed: 1,             // 1, 2, 3
  time: 0,              // seconds elapsed (in-game)
  lastFrame: 0,

  // entities
  stations: [],         // {id, x, y, shape, passengers: [shape], overcrowdTime}
  lines: [],            // {id, color, slot, stations:[stationId], segments:[{a,b,len,points}], trains:[], loop:false}
  trains: [],           // {id, lineId, pos, dir, speed, capacity, passengers:[shape], state, stateTimer, atIdx}
  passengers: [],       // not separate; passengers live on stations

  // assets pool — what the player currently OWNS (not yet placed/used)
  assets: { tunnels: 0, interchanges: 0, carriages: 0, trainsAvailable: 0, linesAvailable: 0 },
  usedLines: new Set(), // slots in use

  // economy
  cash: 0,
  purchased: { line: 0, train: 0, carriage: 0, interchange: 0, crossing: 0 },

  // input
  drag: null,
  hover: null,

  // stats / score
  score: 0,             // delivered passengers
  earnings: 0,          // total cash earned (lifetime)
  weekIndex: 0,
  daysSinceWeek: 0,
  daysSinceStation: 0,

  // shop overlay
  shopOpen: false,
};

/* persistent storage */
const SAVE_KEY = 'freemetro.save.v1';
const PREF_KEY = 'freemetro.prefs.v1';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; }
  catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
}
function loadSaveData() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { stats: {}, unlocks: {} }; }
  catch { return { stats: {}, unlocks: {} }; }
}
function writeSaveData(d) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch {}
}

/* -------------------------------------------------------------
 * 3. UTILITIES
 * ------------------------------------------------------------- */

let _id = 0;
const uid = () => ++_id;

const rand = (min, max) => min + Math.random() * (max - min);
const randi = (min, max) => Math.floor(rand(min, max));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist2 = (ax, ay, bx, by) => { const dx = ax-bx, dy = ay-by; return dx*dx+dy*dy; };
const dist  = (ax, ay, bx, by) => Math.hypot(ax-bx, ay-by);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// weighted random pick from {key: weight}
function weightedPick(table) {
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const k in table) {
    r -= table[k];
    if (r <= 0) return k;
  }
  return Object.keys(table)[0];
}

// closest point on segment (a,b) to p; returns {x,y,t}
function projectOnSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const ab2 = abx*abx + aby*aby || 1;
  const t = clamp((apx*abx + apy*aby) / ab2, 0, 1);
  return { x: a.x + abx*t, y: a.y + aby*t, t };
}

function showToast(msg, ms = 1700) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.add('hidden'), ms);
}

/* -------------------------------------------------------------
 * 4. CITY / MAP — translate normalized river polylines to canvas
 *    and check whether a segment crosses any river.
 * ------------------------------------------------------------- */

function cityRiversCanvas() {
  if (!G.city) return [];
  const M = mapMargin();
  const w = G.width  - M.left - M.right;
  const h = G.height - M.top  - M.bottom;
  return G.city.rivers.map(line => line.map(([nx, ny]) => ({ x: M.left + nx*w, y: M.top + ny*h })));
}

// segment-segment intersection (proper, not endpoint-touching)
function segmentsIntersect(a, b, c, d) {
  const det = (b.x-a.x)*(d.y-c.y) - (b.y-a.y)*(d.x-c.x);
  if (Math.abs(det) < 1e-9) return false;
  const t = ((c.x-a.x)*(d.y-c.y) - (c.y-a.y)*(d.x-c.x)) / det;
  const u = ((c.x-a.x)*(b.y-a.y) - (c.y-a.y)*(b.x-a.x)) / det;
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

function segmentCrossesWater(p1, p2) {
  for (const river of cityRiversCanvas()) {
    for (let i = 0; i < river.length - 1; i++) {
      if (segmentsIntersect(p1, p2, river[i], river[i+1])) return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------
 * 5. SPAWNING — stations and passengers
 * ------------------------------------------------------------- */

function pickStationShape() {
  const week = G.weekIndex;
  const allowExotic = week >= CFG.EXOTIC_SHAPE_WEEK;
  const table = {};
  for (const s of CFG.BASE_SHAPES) table[s] = CFG.COMMON_WEIGHT;
  if (allowExotic) {
    // each week, slowly enable more exotic shapes
    const enabledExotic = Math.min(CFG.EXOTIC_SHAPES.length, Math.max(1, week - 1));
    for (let i = 0; i < enabledExotic; i++) {
      table[CFG.EXOTIC_SHAPES[i]] = CFG.EXOTIC_STATION_WEIGHT;
    }
  }
  return weightedPick(table);
}

function pickPassengerShape(station) {
  // passenger wants ANY shape except station's own
  const possible = [...CFG.BASE_SHAPES];
  // include exotic shapes proportionally as game progresses
  const week = G.weekIndex;
  for (let i = 0; i < Math.min(CFG.EXOTIC_SHAPES.length, week); i++) {
    if (Math.random() < 0.5) possible.push(CFG.EXOTIC_SHAPES[i]);
  }
  // prefer shapes that actually exist on the map
  const existing = new Set(G.stations.map(s => s.shape));
  const pool = possible.filter(s => s !== station.shape && existing.has(s));
  if (pool.length === 0) {
    // fallback: any base shape !== own
    const bases = CFG.BASE_SHAPES.filter(s => s !== station.shape);
    return choice(bases);
  }
  // Bias picks toward rarer shape destinations (they're typically further away
  // and require multi-line transit, making the game more interesting). Each
  // shape gets weight = 1/count, so a unique exotic is much more likely to be
  // picked than a common circle.
  const counts = {};
  for (const s of G.stations) counts[s.shape] = (counts[s.shape] || 0) + 1;
  const weights = {};
  for (const sh of pool) weights[sh] = 1 / Math.max(1, counts[sh] || 1);
  return weightedPick(weights);
}

/* Convert normalized [0..1] map coords to canvas pixels using current dimensions. */
function mapToPx(nx, ny) {
  const M = mapMargin();
  const w = G.width  - M.left - M.right;
  const h = G.height - M.top  - M.bottom;
  return { x: M.left + nx * w, y: M.top + ny * h };
}
function pxToMap(x, y) {
  const M = mapMargin();
  const w = Math.max(1, G.width  - M.left - M.right);
  const h = Math.max(1, G.height - M.top  - M.bottom);
  return { nx: (x - M.left) / w, ny: (y - M.top) / h };
}

/* Recompute every station's pixel coords from its stored normalized coords.
   Called whenever the canvas resizes and once per frame (cheap). */
function relayoutStations() {
  for (const s of G.stations) {
    if (typeof s.nx !== 'number') {
      // backfill normalized coords for stations created before the refactor
      const n = pxToMap(s.x, s.y);
      s.nx = n.nx; s.ny = n.ny;
    }
    const p = mapToPx(s.nx, s.ny);
    s.x = p.x; s.y = p.y;
  }
}

function spawnStation(opts) {
  if (G.stations.length >= 50) return; // hard ceiling
  const M = mapMargin();
  const pad = 20;
  // Sanity guard: if dimensions are not yet set, refuse to spawn (caller may
  // retry once the viewport is known). Prevents NaN/garbage station coords.
  if (!G.width || !G.height || G.width < 50 || G.height < 50) return null;

  // First pass: full constraints (no water, min 70px between stations)
  // Fallback passes progressively relax: shorter min-distance, then allow
  // closer-to-river spawns. Always succeed if the canvas is at all roomy.
  const passes = (opts && opts.relaxed)
    ? [{ minDist: 35, riverPad: 10 }]
    : [
        { minDist: 70, riverPad: 22 },
        { minDist: 50, riverPad: 18 },
        { minDist: 35, riverPad: 14 },
      ];

  for (const pass of passes) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = rand(M.left + pad, G.width  - M.right  - pad);
      const y = rand(M.top  + pad, G.height - M.bottom - pad);
      // not on water (river)
      let onWater = false;
      for (const river of cityRiversCanvas()) {
        for (let i = 0; i < river.length - 1; i++) {
          const proj = projectOnSegment({x,y}, river[i], river[i+1]);
          if (dist(proj.x, proj.y, x, y) < pass.riverPad) { onWater = true; break; }
        }
        if (onWater) break;
      }
      if (onWater) continue;
      // not too close to existing stations
      let tooClose = false;
      for (const s of G.stations) {
        if (dist(x, y, s.x, s.y) < pass.minDist) { tooClose = true; break; }
      }
      if (tooClose) continue;

      const n = pxToMap(x, y);
      const station = {
        id: uid(),
        x, y,
        nx: n.nx, ny: n.ny,
        shape: pickStationShape(),
        passengers: [],
        overcrowdTime: 0,
        capacityBonus: 0,    // interchanges
        loadSpeedBonus: 0,
      };
      G.stations.push(station);
      G._netDirty = true;
      return station;
    }
  }
  return null;
}

function spawnPassenger(station) {
  if (station.passengers.length >= CFG.STATION_CAPACITY + station.capacityBonus) return;
  const existingShapes = new Set(G.stations.map(s => s.shape));
  if (existingShapes.size < 2) return;
  station.passengers.push(pickPassengerShape(station));
}

/* -------------------------------------------------------------
 * 6. LINES & TRAINS
 * ------------------------------------------------------------- */

function freeLineSlot() {
  for (let i = 0; i < CFG.STARTING_LINES + G.assets.linesAvailable; i++) {
    if (!G.usedLines.has(i)) return i;
  }
  return -1;
}

function createLine(stationA, stationB) {
  if (segmentCrossesWater({x: stationA.x, y: stationA.y}, {x: stationB.x, y: stationB.y})) {
    if (G.assets.tunnels <= 0) {
      showToast('need a tunnel to cross water');
      return null;
    }
    G.assets.tunnels--;
  }
  const slot = freeLineSlot();
  if (slot < 0) { showToast('no lines available'); return null; }
  G.usedLines.add(slot);
  const line = {
    id: uid(),
    slot,
    color: LINE_COLORS[slot % LINE_COLORS.length],
    stations: [stationA.id, stationB.id],
    loop: false,
    crossings: segmentCrossesWater({x: stationA.x, y: stationA.y}, {x: stationB.x, y: stationB.y}) ? 1 : 0,
  };
  G.lines.push(line);
  G._netDirty = true;
  // give the new line a starting train if spares are available
  if (G.assets.trainsAvailable > 0) {
    addTrain(line.id);
    G.assets.trainsAvailable--;
  }
  // fill any other trainless line so spares don't idle while a line goes empty
  fillTrainlessLines();
  return line;
}

function extendLine(line, fromStationId, toStation) {
  // determine which end we're extending
  const first = line.stations[0];
  const last = line.stations[line.stations.length - 1];
  let attachEnd; // 'start' | 'end'
  if (fromStationId === first) attachEnd = 'start';
  else if (fromStationId === last) attachEnd = 'end';
  else return false;

  const fromStation = G.stations.find(s => s.id === fromStationId);
  if (!fromStation) return false;

  // already on line? if it equals other endpoint -> close loop
  if (line.stations.includes(toStation.id)) {
    if (toStation.id === (attachEnd === 'start' ? last : first) && line.stations.length >= 3) {
      line.loop = true;
      return true;
    }
    return false;
  }

  if (segmentCrossesWater({x: fromStation.x, y: fromStation.y}, {x: toStation.x, y: toStation.y})) {
    if (G.assets.tunnels <= 0) {
      showToast('need a tunnel to cross water');
      return false;
    }
    G.assets.tunnels--;
    line.crossings++;
  }
  if (attachEnd === 'start') line.stations.unshift(toStation.id);
  else line.stations.push(toStation.id);
  G._netDirty = true;

  // ensure line has at least one train
  if (!G.trains.some(t => t.lineId === line.id) && G.assets.trainsAvailable > 0) {
    addTrain(line.id);
    G.assets.trainsAvailable--;
  }
  return true;
}

function deleteLine(line) {
  if (!G.mode.canEdit) { showToast('extreme: cannot remove'); return; }
  // recover trains, tunnels, slot
  G.usedLines.delete(line.slot);
  for (let i = G.trains.length - 1; i >= 0; i--) {
    if (G.trains[i].lineId === line.id) {
      G.assets.trainsAvailable++;
      // also recover carriages attached to this train
      G.assets.carriages += (G.trains[i].carriages || 0);
      G.trains.splice(i, 1);
    }
  }
  G.assets.tunnels += line.crossings;
  G.lines.splice(G.lines.indexOf(line), 1);
  G._netDirty = true;
  // Fill any other line that's now trainless, but preserve remaining spares
  // in inventory so a future "rebuild this same line" gets back to its prior
  // train count via createLine's "up to 2 starter trains" policy.
  fillTrainlessLines();
}

/* Shrink a line by removing the endpoint segment on the given side.
   `end` is 'start' or 'end'. If shrinking would leave the line with < 2 stations,
   the line is fully deleted (recovers all assets). */
function shrinkLine(line, end) {
  if (!G.mode.canEdit) { showToast('extreme: cannot edit'); return false; }
  const stations = line.stations;
  if (stations.length <= 2) {
    // single segment: drop the line entirely
    deleteLine(line);
    showToast('line removed');
    return true;
  }
  // figure out the two endpoints of the segment we're removing
  let removedFromId, neighborId;
  if (end === 'start') {
    removedFromId = stations[0];
    neighborId = stations[1];
  } else {
    removedFromId = stations[stations.length - 1];
    neighborId = stations[stations.length - 2];
  }
  const removedStation = G.stations.find(s => s.id === removedFromId);
  const neighborStation = G.stations.find(s => s.id === neighborId);

  // refund a crossing if that segment was over water
  if (removedStation && neighborStation &&
      segmentCrossesWater({x: removedStation.x, y: removedStation.y},
                          {x: neighborStation.x, y: neighborStation.y})) {
    G.assets.tunnels++;
    line.crossings = Math.max(0, line.crossings - 1);
  }

  if (line.loop) {
    // closing-edge removal opens the loop
    line.loop = false;
  }
  if (end === 'start') stations.shift();
  else stations.pop();

  // re-snap any train sitting at or beyond the removed end so it doesn't go off-array
  for (const train of G.trains) {
    if (train.lineId !== line.id) continue;
    if (train.atIdx >= stations.length) {
      train.atIdx = stations.length - 1;
      train.pos = 0;
      train.dir = -1;
    }
    if (train.atIdx < 0) {
      train.atIdx = 0;
      train.pos = 0;
      train.dir = 1;
    }
  }

  G._netDirty = true;
  showToast('segment removed');
  return true;
}

/* Insert a station into the middle of a line segment (creates a detour through
   it). segIdx identifies which segment of the line: the edge from
   line.stations[segIdx] → line.stations[segIdx+1], or for a loop the closing
   edge stations[last] → stations[0] when segIdx === stations.length - 1.
   Returns true on success, false otherwise (e.g. station already on line,
   not enough crossings for water crossings). */
function insertStationIntoSegment(line, segIdx, target) {
  if (!G.mode.canEdit) { showToast('extreme: cannot edit'); return false; }
  if (!line || !target) return false;
  if (line.stations.includes(target.id)) {
    showToast('station already on this line');
    return false;
  }

  // Resolve the two endpoints of the segment being split
  const sids = line.stations;
  const isLoopEdge = line.loop && segIdx === sids.length - 1;
  const aId = sids[segIdx];
  const bId = isLoopEdge ? sids[0] : sids[segIdx + 1];
  const aSt = G.stations.find(s => s.id === aId);
  const bSt = G.stations.find(s => s.id === bId);
  if (!aSt || !bSt) return false;

  // Water-crossing accounting:
  //   old segment A→B: if it crossed water, refund 1 crossing
  //   new segments A→T and T→B: each crossing-of-water consumes 1 crossing
  // Net change = (newCrossings - oldCrossings) must be ≤ G.assets.tunnels
  const ap = { x: aSt.x, y: aSt.y };
  const bp = { x: bSt.x, y: bSt.y };
  const tp = { x: target.x, y: target.y };
  const oldCrossed = segmentCrossesWater(ap, bp) ? 1 : 0;
  const newCrossedAT = segmentCrossesWater(ap, tp) ? 1 : 0;
  const newCrossedTB = segmentCrossesWater(tp, bp) ? 1 : 0;
  const newCrossings = newCrossedAT + newCrossedTB;
  const netChange = newCrossings - oldCrossed;
  if (netChange > G.assets.tunnels) {
    showToast('not enough crossings for detour');
    return false;
  }
  // apply crossing changes
  G.assets.tunnels -= netChange;
  line.crossings = (line.crossings || 0) + netChange;

  // Insert the target into the stations array
  if (isLoopEdge) {
    // loop closes from last → 0, so detour means appending to the end
    sids.push(target.id);
  } else {
    sids.splice(segIdx + 1, 0, target.id);
  }

  // Trains: any train sitting at index > segIdx needs to shift up by 1 because
  // we just inserted a new station in front of them. Trains AT segIdx
  // (just left the now-modified segment's start station) are still valid.
  for (const train of G.trains) {
    if (train.lineId !== line.id) continue;
    if (train.atIdx > segIdx) {
      train.atIdx++;
    }
  }

  G._netDirty = true;
  return true;
}

/* Remove a mid-line station from a line as a detour: stations [A, B, C, D]
   with stationId === B → [A, C, D]. Endpoints are NOT supported (they have
   their own grip-drag shrink mechanic that handles crossing refunds correctly).
   Crossing accounting: refund both old segments through the station; consume
   one new segment if the bypass crosses water. Returns true on success. */
function removeStationFromLine(line, stationId) {
  if (!G.mode.canEdit) { showToast('extreme: cannot edit'); return false; }
  if (!line) return false;
  const sids = line.stations;
  const idx = sids.indexOf(stationId);
  if (idx === -1) return false;
  // Endpoint: refuse — let the user use grip drag, which shrinks correctly
  if (!line.loop && (idx === 0 || idx === sids.length - 1)) {
    showToast('drag the line tip to shrink the end');
    return false;
  }
  // For a 2-station non-loop line, there's no mid station to remove
  if (!line.loop && sids.length < 3) return false;
  // For a loop with only 2 stations, removing one would degenerate it
  if (line.loop && sids.length < 3) return false;

  // Resolve the two neighbors (with loop wrap if needed)
  const prevIdx = (idx - 1 + sids.length) % sids.length;
  const nextIdx = (idx + 1) % sids.length;
  // For non-loop, if removing this station would leave the line bridging
  // a gap that wasn't adjacent before, that's exactly the detour-removal case
  // we want — the new line simply skips it.
  const prevSt = G.stations.find(s => s.id === sids[prevIdx]);
  const nextSt = G.stations.find(s => s.id === sids[nextIdx]);
  const removedSt = G.stations.find(s => s.id === stationId);
  if (!prevSt || !nextSt || !removedSt) return false;

  // Crossing accounting:
  //   refund any water-crossing on prev→removed and removed→next
  //   consume any water-crossing on prev→next (the new bypass)
  const prevP = { x: prevSt.x, y: prevSt.y };
  const nextP = { x: nextSt.x, y: nextSt.y };
  const remP  = { x: removedSt.x, y: removedSt.y };
  const oldA = segmentCrossesWater(prevP, remP) ? 1 : 0;
  const oldB = segmentCrossesWater(remP, nextP) ? 1 : 0;
  const newC = segmentCrossesWater(prevP, nextP) ? 1 : 0;
  const netChange = newC - (oldA + oldB);  // negative = refund, positive = needs more
  if (netChange > G.assets.tunnels) {
    showToast('not enough crossings to shortcut');
    return false;
  }
  G.assets.tunnels -= netChange;
  line.crossings = Math.max(0, (line.crossings || 0) + netChange);

  // Splice out the station
  sids.splice(idx, 1);

  // Trains: any train AT or past idx needs to shift back by 1
  for (const train of G.trains) {
    if (train.lineId !== line.id) continue;
    if (train.atIdx === idx) {
      // train was sitting at the removed station — bump to its previous neighbor
      train.atIdx = Math.max(0, idx - 1);
      train.pos = 0;
      train.state = 'loading';
      train.stateTimer = 0.3;
    } else if (train.atIdx > idx) {
      train.atIdx--;
    }
    // clamp defensively
    if (train.atIdx >= sids.length) train.atIdx = sids.length - 1;
    if (train.atIdx < 0) train.atIdx = 0;
  }

  G._netDirty = true;
  return true;
}

function addTrain(lineId) {
  const train = {
    id: uid(),
    lineId,
    pos: 0,        // distance along the line in segment-fractional units (0..n-1 stations)
    dir: 1,        // +1 forward, -1 backward
    atIdx: 0,
    speed: CFG.TRAIN_SPEED,
    capacity: CFG.TRAIN_BASE_CAPACITY,
    carriages: 0,
    passengers: [],
    state: 'moving',  // moving | loading
    stateTimer: 0,
  };
  G.trains.push(train);
  // load at starting station immediately
  const line = G.lines.find(l => l.id === lineId);
  if (line) {
    const pts = lineStationPoints(line);
    if (pts.length >= 2) handleTrainAtStation(train, line, pts);
  }
}

/* compute station list for a line as resolved {x,y} points */
function lineStationPoints(line) {
  return line.stations.map(id => G.stations.find(s => s.id === id)).filter(Boolean);
}

/* Count waiting passengers across all stations on a line. */
function lineWaiting(line) {
  return lineStationPoints(line).reduce((sum, s) => sum + (s.passengers ? s.passengers.length : 0), 0);
}

/* Total seat capacity across all trains on a line: each train's base capacity
   plus its carriages * carriage capacity. */
function lineCapacity(line) {
  let cap = 0;
  for (const t of G.trains) {
    if (t.lineId !== line.id) continue;
    cap += (t.capacity || CFG.TRAIN_BASE_CAPACITY) + (t.carriages || 0) * CFG.CARRIAGE_CAPACITY;
  }
  return cap;
}

/* -------------------------------------------------------------
 * 6b. ECONOMY — fares, prices, purchases
 * ------------------------------------------------------------- */

function priceOf(kind) {
  const p = CFG.PRICES[kind];
  if (!p) return Infinity;
  const n = G.purchased[kind] || 0;
  if (n >= p.max) return Infinity;
  return p.base + p.step * n;
}

function canBuy(kind) {
  if (G.mode.creative) return true;
  return G.cash >= priceOf(kind);
}

function buy(kind) {
  if (G.mode.creative) {
    // free, but still increment counters and grant
    grantAsset(kind);
    return true;
  }
  const cost = priceOf(kind);
  if (cost === Infinity) { showToast('not available'); return false; }
  if (G.cash < cost) { showToast('not enough coins'); return false; }
  G.cash -= cost;
  G.purchased[kind] = (G.purchased[kind] || 0) + 1;
  grantAsset(kind);
  return true;
}

function grantAsset(kind) {
  switch (kind) {
    case 'line':        G.assets.linesAvailable++;   showToast('+1 line slot'); break;
    case 'train':       G.assets.trainsAvailable++;  autoAttachTrain(); break;
    case 'carriage':    G.assets.carriages++;        autoAttachCarriage(); break;
    case 'interchange': G.assets.interchanges++;     autoApplyInterchange(); break;
    case 'crossing':    G.assets.tunnels++;          showToast('+1 crossing'); break;
  }
  refreshShop();
  refreshTray();
}

/* Pick the best line to receive a new train. Returns a Line or null.
   Priority: any line without a train, then busiest line (penalty per existing train). */
function pickBestLineForTrain() {
  if (G.lines.length === 0) return null;
  const trainless = G.lines.filter(l => !G.trains.some(t => t.lineId === l.id));
  if (trainless.length > 0) {
    return trainless
      .map(line => {
        const stations = lineStationPoints(line);
        const waiting = stations.reduce((sum, s) => sum + s.passengers.length, 0);
        return { line, waiting };
      })
      .sort((a, b) => b.waiting - a.waiting)[0].line;
  }
  return G.lines
    .map(line => {
      const stations = lineStationPoints(line);
      const waiting = stations.reduce((sum, s) => sum + s.passengers.length, 0);
      const trains = G.trains.filter(t => t.lineId === line.id).length;
      return { line, score: waiting - trains * 4 };
    })
    .sort((a, b) => b.score - a.score)[0].line;
}

function autoAttachTrain() {
  if (G.lines.length === 0) {
    showToast('+1 train (build a line first)');
    return;
  }
  const target = pickBestLineForTrain();
  if (!target) return;
  addTrain(target.id);
  G.assets.trainsAvailable--;
  showToast('train assigned');
}

/* Gentle: fill any line with zero trains, but never add a 2nd or 3rd train.
   Used when creating a new line — keeps remaining spares in inventory. */
function fillTrainlessLines() {
  let safety = 20;
  while (G.assets.trainsAvailable > 0 && safety-- > 0) {
    const trainless = G.lines.filter(l => !G.trains.some(t => t.lineId === l.id));
    if (trainless.length === 0) break;
    const target = trainless
      .map(line => {
        const stations = lineStationPoints(line);
        const waiting = stations.reduce((sum, s) => sum + s.passengers.length, 0);
        return { line, waiting };
      })
      .sort((a, b) => b.waiting - a.waiting)[0].line;
    addTrain(target.id);
    G.assets.trainsAvailable--;
  }
}

/* Aggressive: deploy ALL spare trains. Fills trainless lines first, then
   piles onto the busiest line up to MAX_TRAINS_PER_LINE. Used after deleting
   a line so the freed trains return to active service rather than stranding
   in inventory. The user's scenario: line had 2 trains → deleted → recreated
   → that line gets both trains back (or one train + one to busiest other line). */
function redistributeIdleTrains() {
  const MAX_TRAINS_PER_LINE = 4;
  let safety = 50;
  while (G.assets.trainsAvailable > 0 && G.lines.length > 0 && safety-- > 0) {
    const target = pickBestLineForTrain();
    if (!target) break;
    const existing = G.trains.filter(t => t.lineId === target.id).length;
    if (existing >= MAX_TRAINS_PER_LINE) break;
    addTrain(target.id);
    G.assets.trainsAvailable--;
  }
}

/* Count distinct lines that pass through a station. */
function linesThroughStation(stationId) {
  let n = 0;
  for (const line of G.lines) if (line.stations.includes(stationId)) n++;
  return n;
}

function payForDelivery(shape) {
  G.score++;
  let coins = CFG.FARE_BASE;
  if (CFG.EXOTIC_SHAPES.includes(shape)) coins += CFG.FARE_EXOTIC;
  coins = Math.round(coins * G.mode.fareMult);
  if (G.mode.creative) coins = 0; // creative: no money tracking needed
  G.cash += coins;
  G.earnings += coins;
  // milestone toasts on the way to the target
  if (!G.mode.creative) {
    const milestones = [25, 50, 100, 250, 500, 1000, 2000];
    if (milestones.includes(G.score)) {
      showToast(`${G.score} delivered`, 1500);
    }
  }
  // Reaching the mode's target triggers the victory screen (once per game).
  if (G.mode.target > 0 && G.score === G.mode.target && !G.victoryShown) {
    G.victoryShown = true;
    showVictory();
  }
}



function simStep(dt) {
  // dt in real seconds; in-game time scales by 1/SECONDS_PER_DAY days/sec
  // Defensive: if dt is somehow NaN or negative, clamp to 0 — better to skip
  // a frame than poison G.time with NaN (which then crashes refreshHud).
  if (typeof dt !== 'number' || !isFinite(dt) || dt < 0) dt = 0;
  const dayDt = dt / CFG.SECONDS_PER_DAY;
  G.time += dt;
  // sanity guard: if G.time has gone non-finite for any reason, reset
  if (!isFinite(G.time) || G.time < 0) G.time = 0;

  // ensure reachability cache is current
  if (G._netDirty) { recomputeReachability(); G._netDirty = false; }

  // station spawning
  G.daysSinceStation += dayDt;
  if (G.daysSinceStation >= CFG.STATION_SPAWN_DAYS) {
    G.daysSinceStation = 0;
    spawnStation();
  }

  // passenger spawning — proportional to number of stations
  // chance per station per day = 1 / PASSENGER_SPAWN_DAYS, scaled by week and score
  const weekRamp = 1 + G.weekIndex * 0.06;
  // score-based ramp: each 100 deliveries adds difficultyRamp * 0.10 to the multiplier
  const scoreRamp = 1 + (G.score / 100) * 0.10 * G.mode.difficultyRamp;
  const ridershipMult = weekRamp * scoreRamp * G.mode.spawnMult;
  for (const s of G.stations) {
    const chance = (dayDt / CFG.PASSENGER_SPAWN_DAYS) * ridershipMult;
    if (Math.random() < chance) spawnPassenger(s);
  }

  // overcrowding
  for (const s of G.stations) {
    const cap = CFG.STATION_CAPACITY + s.capacityBonus;
    if (s.passengers.length > cap) {
      s.overcrowdTime += dayDt;
      if (!G.mode.endless && s.overcrowdTime >= CFG.OVERCROWD_DAYS) {
        gameOver(`${s.shape} station overcrowded`);
        return;
      }
    } else {
      s.overcrowdTime = Math.max(0, s.overcrowdTime - dayDt * 0.5);
    }
  }

  // train movement & passenger logic
  for (const train of G.trains) updateTrain(train, dt);

  // weekly tick — drives shape escalation and difficulty
  G.daysSinceWeek += dayDt;
  if (G.daysSinceWeek >= CFG.DAYS_PER_WEEK) {
    G.daysSinceWeek = 0;
    G.weekIndex++;
    showToast(`week ${G.weekIndex}`);
  }
}

function updateTrain(train, dt) {
  const line = G.lines.find(l => l.id === train.lineId);
  if (!line) return;
  const pts = lineStationPoints(line);
  if (pts.length < 2) return;
  // Defensive: clamp atIdx in case the line was edited while the train ran
  if (train.atIdx >= pts.length) { train.atIdx = pts.length - 1; train.dir = -1; train.pos = 0; }
  if (train.atIdx < 0)            { train.atIdx = 0;               train.dir =  1; train.pos = 0; }

  if (train.state === 'loading') {
    train.stateTimer -= dt;
    if (train.stateTimer <= 0) train.state = 'moving';
    return;
  }

  const station = pts[train.atIdx];
  if (!station) return;
  // determine next index
  let nextIdx;
  if (line.loop) {
    nextIdx = (train.atIdx + train.dir + pts.length) % pts.length;
  } else {
    nextIdx = train.atIdx + train.dir;
    if (nextIdx >= pts.length) { train.dir = -1; nextIdx = train.atIdx + train.dir; }
    else if (nextIdx < 0)      { train.dir =  1; nextIdx = train.atIdx + train.dir; }
  }
  const next = pts[nextIdx];
  if (!next) return;
  const segLen = dist(station.x, station.y, next.x, next.y);
  // pos goes from 0 (at station) to 1 (at next)
  train.pos += (train.speed * dt) / Math.max(1, segLen);

  if (train.pos >= 1) {
    train.pos = 0;
    train.atIdx = nextIdx;
    // arrived at station — handle passengers
    handleTrainAtStation(train, line, pts);
  }
}

function handleTrainAtStation(train, line, pts) {
  if (G._netDirty || !G._lineReachable) recomputeReachability();
  const station = pts[train.atIdx];
  const cap = train.capacity + train.carriages * CFG.CARRIAGE_CAPACITY;

  const stationLines = G._stationLines.get(station.id) || [];
  const otherLinesHere = stationLines.filter(lid => lid !== line.id);

  // hop distance from the CURRENT line to each shape (memoized in G._lineHopsToShape)
  const myHops = G._lineHopsToShape.get(line.id) || new Map();

  // ---- ALIGHT / TRANSFER ----
  // Rule: a passenger leaves the train if
  //   (a) their target shape is this station's shape (delivered), or
  //   (b) some other line at this station has a strictly shorter hop-distance
  //       to the target shape than the current line.
  // Tie: they stay aboard (avoids ping-pong between equally-short alternatives).
  const stayed = [];
  let alighted = 0;
  let transferred = 0;
  const transferredShapes = []; // queued onto station AFTER boarding pass to avoid re-board same train

  for (const shape of train.passengers) {
    if (shape === station.shape) {
      payForDelivery(shape);
      alighted++;
      continue;
    }
    // current train's distance to destination, measured in *line-hops*.
    // 0 = shape directly on current line; we keep them aboard (they ride to it).
    const myDist = myHops.has(shape) ? myHops.get(shape) : Infinity;

    // is there a strictly better line right here?
    let bestOtherDist = Infinity;
    for (const lid of otherLinesHere) {
      const m = G._lineHopsToShape.get(lid);
      const d = (m && m.has(shape)) ? m.get(shape) : Infinity;
      if (d < bestOtherDist) bestOtherDist = d;
    }

    if (bestOtherDist < myDist) {
      // disembark and queue for re-board (after this train's boarding pass)
      transferredShapes.push(shape);
      transferred++;
    } else {
      stayed.push(shape);
    }
  }
  train.passengers = stayed;

  // ---- BOARD ----
  // A passenger boards if the current line can reach their target,
  // i.e. myHops has the shape with finite distance. Skip station's own shape.
  // If multiple lines stop here, the passenger should pick the line with
  // the smallest hop-distance to their target — but the train that arrived
  // is the one boarding now; passengers whose best option is a different
  // line stay on the platform until that line's train shows up.
  const remaining = [];
  let boarded = 0;
  for (const shape of station.passengers) {
    if (shape === station.shape) { remaining.push(shape); continue; }
    const myDist = myHops.has(shape) ? myHops.get(shape) : Infinity;
    if (myDist === Infinity) { remaining.push(shape); continue; }

    // is another line here strictly better? if so, wait for it.
    let bestOtherDist = Infinity;
    for (const lid of otherLinesHere) {
      const m = G._lineHopsToShape.get(lid);
      const d = (m && m.has(shape)) ? m.get(shape) : Infinity;
      if (d < bestOtherDist) bestOtherDist = d;
    }
    if (bestOtherDist < myDist) { remaining.push(shape); continue; }

    if (train.passengers.length < cap) {
      train.passengers.push(shape);
      boarded++;
    } else {
      remaining.push(shape);
    }
  }
  station.passengers = remaining;

  // now add the just-transferred passengers — they'll wait at this station for
  // their better line. They won't be picked up by THIS train this cycle because
  // boarding already happened above.
  for (const sh of transferredShapes) station.passengers.push(sh);

  const exchanged = alighted + boarded + transferred;
  if (exchanged > 0) {
    train.state = 'loading';
    train.stateTimer = CFG.TRAIN_LOAD_TIME * exchanged * (1 - station.loadSpeedBonus * 0.4);
  }
}

/* -------------------------------------------------------------
 * 7b. NETWORK REACHABILITY
 * For each line, compute the set of shapes reachable via this line
 * including transitive transfers at shared stations. Passengers
 * board if their target shape is in that set.
 * ------------------------------------------------------------- */

function recomputeReachability() {
  // map: stationId -> [lineIds]
  const stationLines = new Map();
  for (const line of G.lines) {
    for (const sid of line.stations) {
      if (!stationLines.has(sid)) stationLines.set(sid, []);
      stationLines.get(sid).push(line.id);
    }
  }
  // direct shapes per line (just the shapes of stations on that line)
  const directShapes = new Map();
  for (const line of G.lines) {
    const set = new Set();
    for (const sid of line.stations) {
      const s = G.stations.find(st => st.id === sid);
      if (s) set.add(s.shape);
    }
    directShapes.set(line.id, set);
  }
  // line adjacency: lines are connected if they share a station
  const lineAdj = new Map();
  for (const line of G.lines) lineAdj.set(line.id, new Set());
  for (const [sid, lids] of stationLines) {
    for (let i = 0; i < lids.length; i++) {
      for (let j = i + 1; j < lids.length; j++) {
        lineAdj.get(lids[i]).add(lids[j]);
        lineAdj.get(lids[j]).add(lids[i]);
      }
    }
  }
  // For each line, BFS over the line-graph computing hop-distance to every line.
  // A line has hop-distance 0 to itself, 1 to lines directly sharing a station, etc.
  // hopsToShape[lineId][shape] = minimum number of line-hops needed (0 = on this line).
  const hopsToShape = new Map();
  const reachable = new Map();
  for (const startLine of G.lines) {
    const dist = new Map(); // lineId -> hops
    dist.set(startLine.id, 0);
    const queue = [startLine.id];
    while (queue.length) {
      const lid = queue.shift();
      const d = dist.get(lid);
      for (const nb of lineAdj.get(lid) || []) {
        if (!dist.has(nb)) {
          dist.set(nb, d + 1);
          queue.push(nb);
        }
      }
    }
    // for each shape, the min hops is the smallest dist over any line that has the shape directly
    const perShape = new Map();
    for (const [lid, d] of dist) {
      for (const sh of directShapes.get(lid) || []) {
        if (!perShape.has(sh) || perShape.get(sh) > d) perShape.set(sh, d);
      }
    }
    hopsToShape.set(startLine.id, perShape);
    reachable.set(startLine.id, new Set(perShape.keys()));
  }

  G._stationLines = stationLines;
  G._lineDirectShapes = directShapes;
  G._lineReachable = reachable;
  G._lineHopsToShape = hopsToShape;
}

// helper: hops from line `lineId` to nearest station with `shape`.
// returns Infinity if unreachable, 0 if shape is directly on the line.
function hopsFromLineToShape(lineId, shape) {
  const map = G._lineHopsToShape && G._lineHopsToShape.get(lineId);
  if (!map) return Infinity;
  const v = map.get(shape);
  return v === undefined ? Infinity : v;
}

/* -------------------------------------------------------------
 * 8. RENDERING
 * ------------------------------------------------------------- */

function resizeCanvas() {
  const c = G.canvas;
  if (!c) return;
  G.dpr = window.devicePixelRatio || 1;
  // Source of truth: the viewport. Never read getBoundingClientRect on the
  // canvas itself — that would round-trip our previous inline size.
  G.width  = Math.max(1, Math.floor(window.innerWidth));
  G.height = Math.max(1, Math.floor(window.innerHeight));
  // Backing-store size (device pixels for crisp HiDPI rendering)
  c.width  = G.width  * G.dpr;
  c.height = G.height * G.dpr;
  // CSS display size (CSS pixels). MUST be set, otherwise the browser shows
  // the canvas at its backing-store size in CSS pixels and HiDPI canvases
  // overflow the viewport.
  c.style.width  = G.width  + 'px';
  c.style.height = G.height + 'px';
  G.ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
}

function render() {
  const ctx = G.ctx;
  // keep stations in sync with current viewport size (they live in normalized space)
  relayoutStations();
  // compute parallel-line offsets so multiple lines on the same A↔B segment render side-by-side
  computeSegmentOffsets();
  ctx.clearRect(0, 0, G.width, G.height);

  drawWater(ctx);
  drawLines(ctx);
  drawTrains(ctx);
  drawStations(ctx);
  drawLineGrips(ctx);
  drawShrinkHint(ctx);
  // Drag preview must render LAST so it's never hidden behind stations or other
  // chrome. Otherwise the first ~13px of the dashed line (covered by the start
  // station) is invisible, which on short drags makes the whole preview look
  // missing.
  if (G.drag && (G.drag.kind === 'newline' || G.drag.kind === 'detour')) drawDragPreview(ctx);
  if (G.deletePrompt) drawDeletePrompt(ctx);
  if (G.trainPrompt) drawTrainPrompt(ctx);
  if (G.stationPrompt) drawStationPrompt(ctx);
  if (G._tapFlash) drawTapFlash(ctx);

  if (G.mode.creative) drawCreativeHint(ctx);
}

/* Brief expanding-ring at the tap point so the player gets visual feedback
   that their touch registered — important on phones where there's no
   cursor to indicate where the OS thinks the touch landed. */
function drawTapFlash(ctx) {
  const tf = G._tapFlash;
  if (!tf) return;
  const age = (performance.now() - tf.t) / 1000;  // seconds
  const lifeSec = 0.35;
  if (age > lifeSec) { G._tapFlash = null; return; }
  const t = age / lifeSec;                 // 0..1
  const r = 8 + t * 22;                    // grow from 8 to 30 px
  const alpha = (1 - t) * 0.55;            // fade out
  ctx.save();
  ctx.strokeStyle = getCss('--ink');
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tf.x, tf.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* Floating "delete this line" prompt rendered on canvas. Tracks its hit-rect
   in G._deletePromptRect for the pointer handler to consume. */
function drawDeletePrompt(ctx) {
  const dp = G.deletePrompt;
  if (!dp || !dp.line) return;
  const padX = 14, padY = 10;
  const labelText = 'delete line';
  ctx.save();
  ctx.font = '600 12px IBM Plex Mono, monospace';
  const tw = ctx.measureText(labelText).width;
  // pill: color swatch + text
  const swatchW = 14;
  const totalW = swatchW + 8 + tw + padX * 2;
  const totalH = 24 + padY;
  // position: above the tap point, clamped to viewport
  let cx = dp.x;
  let cy = dp.y - 30;
  cy = Math.max(totalH / 2 + 8, cy);
  cy = Math.min(G.height - totalH / 2 - 8, cy);
  cx = Math.max(totalW / 2 + 8, cx);
  cx = Math.min(G.width - totalW / 2 - 8, cx);
  const left = cx - totalW / 2;
  const top  = cy - totalH / 2;
  // bg
  roundRect(ctx, left, top, totalW, totalH, totalH / 2);
  ctx.fillStyle = getCss('--ink');
  ctx.fill();
  // colour swatch (the line's colour)
  ctx.fillStyle = dp.line.color;
  ctx.beginPath();
  ctx.arc(left + padX + swatchW / 2, top + totalH / 2, swatchW / 2, 0, Math.PI * 2);
  ctx.fill();
  // text
  ctx.fillStyle = getCss('--paper');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(labelText, left + padX + swatchW + 8, top + totalH / 2);
  ctx.restore();
  // store hit rect for click detection
  G._deletePromptRect = { x: left, y: top, w: totalW, h: totalH };
}

/* Floating "move train to..." prompt with a coloured chip per available
   destination line plus an "× return" chip to send the train to inventory.
   Hit rects stored in G._trainPromptHits as [{x, y, w, h, action}, ...]. */
function drawTrainPrompt(ctx) {
  const tp = G.trainPrompt;
  if (!tp) return;
  // Two modes:
  //   source 'train'      → moving an existing train (chips for other lines + return-to-inventory)
  //   source 'inventory'  → assigning a spare train to a line (chips for all lines, no inventory option)
  const source = tp.source || 'train';

  let options, labelText;
  if (source === 'train') {
    if (!tp.train) return;
    const train = tp.train;
    const otherLines = G.lines.filter(l => l.id !== train.lineId);
    options = [
      ...otherLines.map(l => ({ kind: 'move', lineId: l.id, color: l.color })),
      { kind: 'inventory', color: null },
    ];
    labelText = 'move train';
  } else {
    // inventory mode: pick any line to assign to
    options = G.lines.map(l => ({ kind: 'assign', lineId: l.id, color: l.color }));
    labelText = 'assign to';
  }
  if (options.length === 0) { G._trainPromptHits = []; return; }

  ctx.save();
  ctx.font = '600 11px IBM Plex Mono, monospace';
  const labelW = ctx.measureText(labelText).width;
  const chipR = 11;             // chip radius (so chip diameter = 22px touch target)
  const chipGap = 8;
  const padX = 12, padY = 9;
  // total width: label + gap + N chips + gaps
  const chipsW = options.length * (chipR * 2) + (options.length - 1) * chipGap;
  const totalW = padX + labelW + 12 + chipsW + padX;
  const totalH = chipR * 2 + padY * 2;

  // position above the anchor, clamped to viewport
  let cx = tp.x;
  let cy = tp.y - 28;
  cy = Math.max(totalH / 2 + 8, cy);
  cy = Math.min(G.height - totalH / 2 - 8, cy);
  cx = Math.max(totalW / 2 + 8, cx);
  cx = Math.min(G.width - totalW / 2 - 8, cx);
  const left = cx - totalW / 2;
  const top  = cy - totalH / 2;

  // bg
  roundRect(ctx, left, top, totalW, totalH, totalH / 2);
  ctx.fillStyle = getCss('--ink');
  ctx.fill();

  // label
  ctx.fillStyle = getCss('--paper');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(labelText, left + padX, top + totalH / 2);

  // chips
  const hits = [];
  let chipX = left + padX + labelW + 12 + chipR;
  const chipY = top + totalH / 2;
  for (const opt of options) {
    ctx.beginPath();
    ctx.arc(chipX, chipY, chipR, 0, Math.PI * 2);
    if (opt.kind === 'move' || opt.kind === 'assign') {
      ctx.fillStyle = opt.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = getCss('--paper');
      ctx.stroke();
    } else {
      // "× inventory" chip — outlined, no fill
      ctx.fillStyle = 'transparent';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = getCss('--paper');
      ctx.stroke();
      // X glyph
      ctx.beginPath();
      ctx.moveTo(chipX - 4, chipY - 4);
      ctx.lineTo(chipX + 4, chipY + 4);
      ctx.moveTo(chipX + 4, chipY - 4);
      ctx.lineTo(chipX - 4, chipY + 4);
      ctx.lineWidth = 2;
      ctx.strokeStyle = getCss('--paper');
      ctx.stroke();
    }
    hits.push({ x: chipX - chipR, y: chipY - chipR, w: chipR * 2, h: chipR * 2, opt });
    chipX += chipR * 2 + chipGap;
  }
  ctx.restore();
  G._trainPromptHits = hits;
  G._trainPromptRect = { x: left, y: top, w: totalW, h: totalH };
}

/* Station inspection prompt: shows for each line passing through the tapped
   station the line's busyness and capacity, plus an × chip to remove the
   station from that line as a detour (mid-line stations only — endpoints
   are reachable via the grip-drag shrink mechanic). */
function drawStationPrompt(ctx) {
  const sp = G.stationPrompt;
  if (!sp || !sp.station) return;
  const st = sp.station;
  // Find every line passing through this station, plus whether it's an endpoint
  const linesThrough = G.lines.filter(l => l.stations.includes(st.id));

  ctx.save();
  ctx.font = '600 11px IBM Plex Mono, monospace';

  const padX = 12, padY = 9;
  const rowH = 22;
  const chipR = 9;
  const swatchSz = 12;
  const gap = 8;

  // Build rows. Each row has: [colour swatch] [busy/cap text] [× chip if removable]
  // For a station with NO lines through it: a single info row "isolated".
  const rows = [];
  if (linesThrough.length === 0) {
    rows.push({ kind: 'info', text: `${(st.passengers || []).length} waiting` });
  } else {
    for (const line of linesThrough) {
      const sids = line.stations;
      const idx = sids.indexOf(st.id);
      const isEndpoint = !line.loop && (idx === 0 || idx === sids.length - 1);
      const removable = !isEndpoint && G.mode.canEdit && (line.loop ? sids.length > 2 : sids.length > 2);
      rows.push({
        kind: 'line',
        line, color: line.color,
        text: `${lineWaiting(line)}/${lineCapacity(line)}`,
        removable, isEndpoint,
      });
    }
  }

  // Measure max row width (for layout)
  const textWidths = rows.map(r => ctx.measureText(r.text || '').width);
  const maxTextW = Math.max(0, ...textWidths);
  const rowContentW = swatchSz + gap + maxTextW + gap + (chipR * 2);
  const totalW = padX + rowContentW + padX;
  const totalH = padY + rows.length * rowH + padY;

  // Position above the station, clamped
  let cx = sp.x;
  let cy = sp.y - 14 - totalH / 2;
  cy = Math.max(totalH / 2 + 8, cy);
  cy = Math.min(G.height - totalH / 2 - 8, cy);
  cx = Math.max(totalW / 2 + 8, cx);
  cx = Math.min(G.width - totalW / 2 - 8, cx);
  const left = cx - totalW / 2;
  const top  = cy - totalH / 2;

  // bg
  roundRect(ctx, left, top, totalW, totalH, 12);
  ctx.fillStyle = getCss('--ink');
  ctx.fill();

  // Draw each row
  const hits = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const ry = top + padY + i * rowH + rowH / 2;
    const rx = left + padX;
    if (row.kind === 'info') {
      ctx.fillStyle = getCss('--paper');
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(row.text, rx, ry);
      continue;
    }
    // colour swatch (small filled circle in the line's color)
    ctx.beginPath();
    ctx.arc(rx + swatchSz / 2, ry, swatchSz / 2, 0, Math.PI * 2);
    ctx.fillStyle = row.color;
    ctx.fill();
    // text "X/Y"
    ctx.fillStyle = getCss('--paper');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(row.text, rx + swatchSz + gap, ry);
    // remove chip (× outlined) if removable
    if (row.removable) {
      const chipX = rx + rowContentW - chipR;
      const chipY = ry;
      ctx.beginPath();
      ctx.arc(chipX, chipY, chipR, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = getCss('--paper');
      ctx.stroke();
      // X glyph
      ctx.beginPath();
      ctx.moveTo(chipX - 3.5, chipY - 3.5);
      ctx.lineTo(chipX + 3.5, chipY + 3.5);
      ctx.moveTo(chipX + 3.5, chipY - 3.5);
      ctx.lineTo(chipX - 3.5, chipY + 3.5);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      hits.push({
        x: chipX - chipR, y: chipY - chipR, w: chipR * 2, h: chipR * 2,
        kind: 'remove', lineId: row.line.id,
      });
    }
  }

  ctx.restore();
  G._stationPromptHits = hits;
  G._stationPromptRect = { x: left, y: top, w: totalW, h: totalH };
}

function drawWater(ctx) {
  const rivers = cityRiversCanvas();
  if (rivers.length === 0) return;
  ctx.save();
  ctx.strokeStyle = getCss('--water');
  ctx.lineWidth = 38;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of rivers) {
    ctx.beginPath();
    ctx.moveTo(r[0].x, r[0].y);
    for (let i = 1; i < r.length; i++) ctx.lineTo(r[i].x, r[i].y);
    ctx.stroke();
  }
  // edge stroke
  ctx.lineWidth = 38;
  ctx.strokeStyle = getCss('--water-edge');
  ctx.globalCompositeOperation = 'source-atop';
  for (const r of rivers) {
    ctx.beginPath();
    ctx.moveTo(r[0].x, r[0].y);
    for (let i = 1; i < r.length; i++) ctx.lineTo(r[i].x, r[i].y);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/* Build a per-segment "shared lines" map. For each undirected segment
   (stationA, stationB), tracks all lines that traverse it. Drawing code
   uses this to space parallel lines side-by-side and put trains on the
   correct offset rail. Recomputed each render frame (cheap). */
function computeSegmentOffsets() {
  const segMap = new Map();
  function segKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

  for (const line of G.lines) {
    const sids = line.stations;
    for (let i = 0; i < sids.length - 1; i++) {
      const k = segKey(sids[i], sids[i+1]);
      if (!segMap.has(k)) segMap.set(k, []);
      segMap.get(k).push(line.id);
    }
    if (line.loop && sids.length >= 2) {
      const k = segKey(sids[sids.length - 1], sids[0]);
      if (!segMap.has(k)) segMap.set(k, []);
      segMap.get(k).push(line.id);
    }
  }
  // sort each group by line slot for stable drawing order
  for (const [, ids] of segMap) ids.sort((a, b) => {
    const la = G.lines.find(l => l.id === a);
    const lb = G.lines.find(l => l.id === b);
    return (la ? la.slot : 0) - (lb ? lb.slot : 0);
  });
  G._segMap = segMap;
}

/* Get the perpendicular pixel offset for a given line on a given segment.
   Positive offsets = perpendicular-right relative to segment direction A→B. */
function lineOffsetForSegment(lineId, sidA, sidB) {
  if (!G._segMap) return 0;
  const k = sidA < sidB ? `${sidA}:${sidB}` : `${sidB}:${sidA}`;
  const group = G._segMap.get(k);
  if (!group || group.length <= 1) return 0;
  const slot = group.indexOf(lineId);
  if (slot < 0) return 0;
  const total = group.length;
  const LW = 6, GAP = 1;
  return (slot - (total - 1) / 2) * (LW + GAP);
}

function drawLines(ctx) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;

  for (const line of G.lines) {
    const sids = line.stations;
    const pts = lineStationPoints(line);
    if (pts.length < 2) continue;
    ctx.strokeStyle = line.color;

    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push([i, i + 1]);
    if (line.loop) segs.push([pts.length - 1, 0]);

    for (const [i, j] of segs) {
      const a = pts[i], b = pts[j];
      const off = lineOffsetForSegment(line.id, sids[i], sids[j]);
      if (off === 0) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else {
        // Compute perpendicular from the CANONICAL segment direction (sorted
        // by station id) so two lines traversing the same physical segment
        // in opposite directions still get distinct, consistent offsets.
        // Otherwise the perpendicular vector flips per-line and they overlap.
        let canA = a, canB = b;
        if (sids[i] > sids[j]) { canA = b; canB = a; }
        const dx = canB.x - canA.x, dy = canB.y - canA.y;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len, py = dx / len;
        ctx.beginPath();
        ctx.moveTo(a.x + px * off, a.y + py * off);
        ctx.lineTo(b.x + px * off, b.y + py * off);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawDragPreview(ctx) {
  const d = G.drag;
  // detour: dashed A→cursor→B preview, where A, B are the two stations of the
  // segment being rerouted through the cursor.
  if (d.kind === 'detour') {
    drawDetourPreview(ctx);
    return;
  }
  if (!d.fromStation && !d.fromLineEnd) return;
  const a = d.fromStation || G.stations.find(s => s.id === d.fromLineEnd.stationId);
  if (!a) return;
  const tx = d.cursorX, ty = d.cursorY;
  // bail if the drag hasn't moved at all yet (zero-length line is invisible)
  const dx = tx - a.x, dy = ty - a.y;
  if (dx*dx + dy*dy < 4) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1) wide paper-coloured halo so the dashed line stands out against any
  //    background (water, existing lines, etc.)
  ctx.strokeStyle = getCss('--paper');
  ctx.lineWidth = 10;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  // 2) the dashed line itself in the line colour
  ctx.strokeStyle = d.color || getCss('--ink');
  ctx.lineWidth = 5;
  ctx.setLineDash([10, 7]);
  ctx.lineDashOffset = -((performance.now() / 60) % 17); // slight march for liveliness
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  // 3) a small endpoint marker at the cursor, snapped to a station if hovered
  const hover = stationAt(tx, ty);
  const cx = hover ? hover.x : tx;
  const cy = hover ? hover.y : ty;
  ctx.setLineDash([]);
  ctx.fillStyle = d.color || getCss('--ink');
  ctx.strokeStyle = getCss('--paper');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, hover ? 7 : 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/* Detour preview: shows the rubber-banded path A → cursor → B that the user
   is creating by dragging the middle of a segment toward another station. */
function drawDetourPreview(ctx) {
  const d = G.drag;
  if (!d.line) return;
  const sids = d.line.stations;
  const isLoopEdge = d.line.loop && d.segIdx === sids.length - 1;
  const aId = sids[d.segIdx];
  const bId = isLoopEdge ? sids[0] : sids[d.segIdx + 1];
  const aSt = G.stations.find(s => s.id === aId);
  const bSt = G.stations.find(s => s.id === bId);
  if (!aSt || !bSt) return;
  const tx = d.cursorX, ty = d.cursorY;
  const hover = stationAt(tx, ty);
  // snap to hovered station and check it's not already on the line
  const snapValid = hover && !sids.includes(hover.id);
  const cx = hover ? hover.x : tx;
  const cy = hover ? hover.y : ty;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // halo behind both segments
  ctx.strokeStyle = getCss('--paper');
  ctx.lineWidth = 10;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(aSt.x, aSt.y);
  ctx.lineTo(cx, cy);
  ctx.lineTo(bSt.x, bSt.y);
  ctx.stroke();

  // dashed detour in the line's colour
  ctx.strokeStyle = d.color || getCss('--ink');
  ctx.lineWidth = 5;
  ctx.setLineDash([10, 7]);
  ctx.lineDashOffset = -((performance.now() / 60) % 17);
  ctx.beginPath();
  ctx.moveTo(aSt.x, aSt.y);
  ctx.lineTo(cx, cy);
  ctx.lineTo(bSt.x, bSt.y);
  ctx.stroke();

  // cursor marker — bigger / accent if snapped to a valid target station
  ctx.setLineDash([]);
  ctx.fillStyle = snapValid ? (d.color || getCss('--ink')) : getCss('--paper');
  ctx.strokeStyle = d.color || getCss('--ink');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, snapValid ? 9 : 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/* Grip handles at line endpoints — drawn as a wedge/arrowhead extending from
   the endpoint station along the line's outward direction. Visually distinct
   from passenger dots. Hidden on extreme mode and on looped lines. */
function drawLineGrips(ctx) {
  if (!G.mode.canEdit) return;
  const draggingEnd = G.drag && G.drag.fromLineEnd ? G.drag.fromLineEnd : null;

  for (const line of G.lines) {
    if (line.loop) continue;
    const pts = lineStationPoints(line);
    if (pts.length < 2) continue;
    const ends = [
      { p: pts[0],              end: 'start', neighbor: pts[1] },
      { p: pts[pts.length - 1], end: 'end',   neighbor: pts[pts.length - 2] },
    ];
    for (const e of ends) {
      if (draggingEnd && draggingEnd.line === line && draggingEnd.end === e.end) continue;
      // outward direction (away from neighbor, past the endpoint station)
      const dx = e.p.x - e.neighbor.x, dy = e.p.y - e.neighbor.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      // perpendicular vector
      const px = -uy, py = ux;

      // start the wedge at the station edge, extend outward by ~14px
      const baseDist = CFG.STATION_RADIUS + 4;
      const tipDist  = CFG.STATION_RADIUS + 18;
      const halfWidth = 7;

      const bx = e.p.x + ux * baseDist;
      const by = e.p.y + uy * baseDist;
      const tx = e.p.x + ux * tipDist;
      const ty = e.p.y + uy * tipDist;

      // a triangular pull-tab: base at the station side, tip pointing outward
      ctx.save();
      ctx.fillStyle = line.color;
      ctx.strokeStyle = getCss('--paper');
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(bx + px * halfWidth, by + py * halfWidth);
      ctx.lineTo(bx - px * halfWidth, by - py * halfWidth);
      ctx.lineTo(tx, ty);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

/* When the user is dragging an endpoint and is hovering on the adjacent station
   on that same line, show a clear "release to shrink" hint. */
function drawShrinkHint(ctx) {
  if (!G.drag || !G.drag.fromLineEnd) return;
  const ep = G.drag.fromLineEnd;
  const line = ep.line;
  const stations = line.stations;
  if (stations.length < 2) return;
  const adjacentId = ep.end === 'start' ? stations[1] : stations[stations.length - 2];
  const target = stationAt(G.drag.cursorX, G.drag.cursorY);
  if (!target || target.id !== adjacentId) return;
  ctx.save();
  ctx.strokeStyle = getCss('--danger');
  ctx.lineWidth = 2.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(target.x, target.y, CFG.STATION_RADIUS + 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawStations(ctx) {
  const ink = getCss('--ink');
  const paper = getCss('--paper');
  for (const s of G.stations) {
    drawShape(ctx, s.x, s.y, s.shape, CFG.STATION_RADIUS, ink, paper, s.capacityBonus > 0);
    drawStationPassengers(ctx, s);
    drawOvercrowdRing(ctx, s);
  }
}

function drawShape(ctx, x, y, shape, r, stroke, fill, ringed) {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(x, y, r, 0, Math.PI*2); break;
    case 'square':
      ctx.rect(x-r, y-r, r*2, r*2); break;
    case 'triangle':
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 1.05, y + r * 0.85);
      ctx.lineTo(x - r * 1.05, y + r * 0.85);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r * 1.05, y);
      ctx.lineTo(x, y + r * 1.2);
      ctx.lineTo(x - r * 1.05, y);
      ctx.closePath();
      break;
    case 'pentagon':
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI/2 + i * (Math.PI*2/5);
        const px = x + Math.cos(a) * r * 1.1;
        const py = y + Math.sin(a) * r * 1.1;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI/2 + i * (Math.PI/5);
        const rad = (i % 2 === 0) ? r * 1.25 : r * 0.55;
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 'cross':
      const t = r * 0.45;
      ctx.moveTo(x - t, y - r);
      ctx.lineTo(x + t, y - r);
      ctx.lineTo(x + t, y - t);
      ctx.lineTo(x + r, y - t);
      ctx.lineTo(x + r, y + t);
      ctx.lineTo(x + t, y + t);
      ctx.lineTo(x + t, y + r);
      ctx.lineTo(x - t, y + r);
      ctx.lineTo(x - t, y + t);
      ctx.lineTo(x - r, y + t);
      ctx.lineTo(x - r, y - t);
      ctx.lineTo(x - t, y - t);
      ctx.closePath();
      break;
    case 'gem':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 1.1, y - r * 0.2);
      ctx.lineTo(x + r * 0.7, y + r);
      ctx.lineTo(x - r * 0.7, y + r);
      ctx.lineTo(x - r * 1.1, y - r * 0.2);
      ctx.closePath();
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = i * (Math.PI / 3);
        const px = x + Math.cos(a) * r * 1.1;
        const py = y + Math.sin(a) * r * 1.1;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 'drop': {
      // teardrop: pointy at top, round at bottom
      ctx.moveTo(x, y - r * 1.2);
      ctx.bezierCurveTo(x + r * 1.1, y - r * 0.2, x + r * 1.0, y + r * 0.9, x, y + r);
      ctx.bezierCurveTo(x - r * 1.0, y + r * 0.9, x - r * 1.1, y - r * 0.2, x, y - r * 1.2);
      ctx.closePath();
      break;
    }
    case 'crescent': {
      // moon crescent: outer arc minus inner arc
      const ro = r * 1.05;
      const ri = r * 0.85;
      // outer arc from top to bottom (right side)
      ctx.arc(x, y, ro, -Math.PI / 2, Math.PI / 2, false);
      // inner arc back from bottom to top (cuts the moon)
      ctx.arc(x + r * 0.32, y, ri, Math.PI / 2, -Math.PI / 2, true);
      ctx.closePath();
      break;
    }
    default:
      ctx.arc(x, y, r, 0, Math.PI*2);
  }
  ctx.fill();
  ctx.stroke();
  if (ringed) {
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI*2);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawStationPassengers(ctx, s) {
  if (s.passengers.length === 0) return;
  const ink = getCss('--ink');
  const offsetAngle = -Math.PI / 2;
  const radius = CFG.STATION_RADIUS + 14;
  for (let i = 0; i < s.passengers.length; i++) {
    const a = offsetAngle + i * 0.7;
    const px = s.x + Math.cos(a) * radius;
    const py = s.y + Math.sin(a) * radius;
    drawShape(ctx, px, py, s.passengers[i], 4, ink, ink, false);
  }
}

function drawOvercrowdRing(ctx, s) {
  if (s.overcrowdTime <= 0) return;
  const t = clamp(s.overcrowdTime / CFG.OVERCROWD_DAYS, 0, 1);
  ctx.save();
  ctx.strokeStyle = getCss('--danger');
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(s.x, s.y, CFG.STATION_RADIUS + 9, -Math.PI/2, -Math.PI/2 + t * Math.PI*2);
  ctx.stroke();
  ctx.restore();
}

function drawTrains(ctx) {
  for (const train of G.trains) {
    const line = G.lines.find(l => l.id === train.lineId);
    if (!line) continue;
    const pts = lineStationPoints(line);
    if (pts.length < 2) continue;
    // clamp in case the line was edited mid-frame
    if (train.atIdx >= pts.length) train.atIdx = pts.length - 1;
    if (train.atIdx < 0) train.atIdx = 0;
    let nextIdx;
    if (line.loop) nextIdx = (train.atIdx + train.dir + pts.length) % pts.length;
    else nextIdx = clamp(train.atIdx + train.dir, 0, pts.length - 1);

    const a = pts[train.atIdx], b = pts[nextIdx];
    if (!a || !b) continue;

    // perpendicular offset to align with the offset line on this segment.
    // Use canonical (sorted-id) direction so opposite-traversal lines don't overlap.
    const sidA = line.stations[train.atIdx];
    const sidB = line.stations[nextIdx];
    const off = lineOffsetForSegment(line.id, sidA, sidB);
    let canA = a, canB = b;
    if (sidA > sidB) { canA = b; canB = a; }
    const dxs = canB.x - canA.x, dys = canB.y - canA.y;
    const seglen = Math.hypot(dxs, dys) || 1;
    const px = -dys / seglen, py = dxs / seglen;

    const x = a.x + (b.x - a.x) * train.pos + px * off;
    const y = a.y + (b.y - a.y) * train.pos + py * off;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    // cache screen position for hit-detection (e.g. tap-to-move)
    train._screenX = x;
    train._screenY = y;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = line.color;
    ctx.strokeStyle = getCss('--ink');
    ctx.lineWidth = 1.5;
    const w = 18 + train.carriages * 8, h = 9;
    roundRect(ctx, -w/2, -h/2, w, h, 2);
    ctx.fill();
    ctx.stroke();

    // tiny passenger indicators inside train
    if (train.passengers.length > 0) {
      ctx.fillStyle = getCss('--paper');
      const slots = train.capacity + train.carriages * CFG.CARRIAGE_CAPACITY;
      const filled = train.passengers.length;
      const rectW = (w - 4) * (filled / slots);
      ctx.fillRect(-w/2 + 2, -h/2 + 2, rectW, h - 4);
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCreativeHint(ctx) {
  ctx.save();
  ctx.fillStyle = getCss('--ink-mute');
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.textAlign = 'center';
  ctx.fillText('CREATIVE — DOUBLE-CLICK TO PLACE A STATION', G.width / 2, G.height - 36);
  ctx.restore();
}

const _cssCache = {};
function getCss(name) {
  if (_cssCache[name]) return _cssCache[name];
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  _cssCache[name] = v;
  return v;
}

/* -------------------------------------------------------------
 * 9. INPUT — pointer-driven line creation/editing
 * ------------------------------------------------------------- */

function pointerPos(e) {
  const r = G.canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function stationAt(x, y) {
  // On coarse-pointer (touch) devices use a wider hit radius — fingers are
  // much less precise than a mouse cursor. Cached on first call.
  if (G._hitRadius === undefined) {
    const coarse = (typeof window !== 'undefined' && window.matchMedia &&
                    window.matchMedia('(pointer: coarse)').matches);
    G._hitRadius = coarse ? CFG.HIT_RADIUS + 8 : CFG.HIT_RADIUS;
  }
  for (const s of G.stations) {
    if (dist(s.x, s.y, x, y) <= G._hitRadius) return s;
  }
  return null;
}

function lineEndpointAt(x, y) {
  // Match a comfortable area centered on the wedge grip. Lets a user start a
  // new line from the endpoint station body itself (the body is NOT part of
  // the grip hit-area).
  const coarse = G._hitRadius && G._hitRadius > CFG.HIT_RADIUS;
  const gripTol = coarse ? 24 : 16;
  for (const line of G.lines) {
    if (line.loop) continue;
    const pts = lineStationPoints(line);
    if (pts.length < 2) continue;
    const ends = [
      { p: pts[0],              end: 'start', stationId: line.stations[0],                          neighbor: pts[1] },
      { p: pts[pts.length - 1], end: 'end',   stationId: line.stations[line.stations.length - 1],   neighbor: pts[pts.length - 2] },
    ];
    for (const e of ends) {
      const dx = e.p.x - e.neighbor.x, dy = e.p.y - e.neighbor.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      // grip center: midway between base and tip
      const centerDist = CFG.STATION_RADIUS + 11;
      const gx = e.p.x + ux * centerDist;
      const gy = e.p.y + uy * centerDist;
      if (dist(gx, gy, x, y) <= gripTol) {
        return { line, stationId: e.stationId, end: e.end };
      }
    }
  }
  return null;
}

function lineSegmentAt(x, y) {
  const coarse = G._hitRadius && G._hitRadius > CFG.HIT_RADIUS;
  const TOL = coarse ? 16 : 10;
  for (const line of G.lines) {
    const pts = lineStationPoints(line);
    for (let i = 0; i < pts.length - 1; i++) {
      const proj = projectOnSegment({x, y}, pts[i], pts[i+1]);
      if (dist(proj.x, proj.y, x, y) < TOL) return { line, segIdx: i, projX: proj.x, projY: proj.y };
    }
    // also check the loop-closing segment if applicable
    if (line.loop && pts.length >= 2) {
      const i = pts.length - 1;
      const proj = projectOnSegment({x, y}, pts[i], pts[0]);
      if (dist(proj.x, proj.y, x, y) < TOL) return { line, segIdx: i, projX: proj.x, projY: proj.y };
    }
  }
  return null;
}

/* Find a train whose rendered position is close to (x, y). Trains move, so
   we use the cached screen position from drawTrains (set each render frame). */
function trainAt(x, y) {
  const coarse = G._hitRadius && G._hitRadius > CFG.HIT_RADIUS;
  const tol = coarse ? 20 : 14;
  for (const train of G.trains) {
    if (typeof train._screenX !== 'number') continue;
    if (dist(train._screenX, train._screenY, x, y) <= tol) return train;
  }
  return null;
}

function setupInput() {
  const c = G.canvas;
  c.addEventListener('pointerdown', onPointerDown);
  c.addEventListener('pointermove', onPointerMove);
  c.addEventListener('pointerup', onPointerUp);
  c.addEventListener('pointercancel', onPointerUp);
  c.addEventListener('dblclick', onDoubleClick);
  c.addEventListener('contextmenu', (e) => e.preventDefault());

  // Fallback: if a pointer is released somewhere outside the canvas (e.g. on
  // an HTML element that swallowed the event despite setPointerCapture), make
  // sure we still clear any in-progress drag and force a redraw — otherwise
  // the dashed preview hangs around indefinitely.
  window.addEventListener('pointerup', (e) => {
    if (G.drag) onPointerUp(e);
  });
  window.addEventListener('pointercancel', (e) => {
    if (G.drag) onPointerUp(e);
  });
  // Also clear on visibility change / blur — if the user tabs away mid-drag
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.drag) {
      G.drag = null;
      if (G.running && G.ctx) render();
    }
  });
}

function onPointerDown(e) {
  if (!G.running) return;
  // NOTE: paused is allowed — players can redesign their network while paused

  // Single-pointer enforcement: mobile fires multiple pointer events when the
  // user has more than one finger down (or accidentally brushes the screen).
  // Lock onto the first pointer; ignore the rest until it lifts. This stops
  // a stray second finger from cancelling or hijacking the user's drag.
  if (G._activePointerId !== undefined && G._activePointerId !== e.pointerId) {
    return;
  }
  G._activePointerId = e.pointerId;

  // Prevent the browser from initiating gestures (long-press menu, text
  // selection, double-tap zoom etc.) when the touch lands on the canvas.
  // The canvas has touch-action: none too, but preventDefault here is a
  // belt-and-braces guard for mobile Chrome which occasionally fires
  // pointerdown WITH default action despite touch-action.
  if (e.cancelable) {
    try { e.preventDefault(); } catch {}
  }

  const p = pointerPos(e);

  // visual tap feedback: a brief expanding ring at the tap point. Helps the
  // user confirm the tap was registered, especially on touch where there's
  // no cursor.
  G._tapFlash = { x: p.x, y: p.y, t: performance.now() };

  // capture this pointer so move/up events keep firing on the canvas even if
  // the user drags the cursor off the canvas onto the HUD or tray.
  if (e.pointerId !== undefined) {
    try { G.canvas.setPointerCapture(e.pointerId); } catch {}
  }

  // FIRST: if a train-move/assign prompt is showing, check chip hits before anything else
  if (G.trainPrompt && G._trainPromptHits) {
    for (const hit of G._trainPromptHits) {
      if (p.x >= hit.x && p.x <= hit.x + hit.w && p.y >= hit.y && p.y <= hit.y + hit.h) {
        const train = G.trainPrompt.train;
        if (hit.opt.kind === 'move' && train && G.trains.includes(train)) {
          // reassign train to the chosen line
          train.lineId = hit.opt.lineId;
          train.atIdx = 0;
          train.pos = 0;
          train.dir = 1;
          train.passengers = [];  // drop any in-transit passengers (they'll re-spawn)
          train.state = 'loading';
          train.stateTimer = 0.5;
          showToast('train reassigned');
        } else if (hit.opt.kind === 'inventory' && train && G.trains.includes(train)) {
          // return to inventory; carriages also return
          G.assets.trainsAvailable++;
          G.assets.carriages += (train.carriages || 0);
          G.trains.splice(G.trains.indexOf(train), 1);
          showToast('train returned to inventory');
        } else if (hit.opt.kind === 'assign' && G.assets.trainsAvailable > 0) {
          // assign one spare train from inventory to the chosen line
          addTrain(hit.opt.lineId);
          G.assets.trainsAvailable--;
          showToast('train assigned');
          refreshTray();
        }
        G.trainPrompt = null; G._trainPromptHits = null; G._trainPromptRect = null;
        if (G.ctx) render();
        return;
      }
    }
    // tap outside chips → dismiss
    G.trainPrompt = null; G._trainPromptHits = null; G._trainPromptRect = null;
  }

  // SECOND: if a station prompt is showing, check × chip hits.
  if (G.stationPrompt && G._stationPromptHits) {
    for (const hit of G._stationPromptHits) {
      if (p.x >= hit.x && p.x <= hit.x + hit.w && p.y >= hit.y && p.y <= hit.y + hit.h) {
        const st = G.stationPrompt.station;
        const line = G.lines.find(l => l.id === hit.lineId);
        if (line && st) {
          const ok = removeStationFromLine(line, st.id);
          if (ok) showToast('detour removed');
        }
        G.stationPrompt = null; G._stationPromptHits = null; G._stationPromptRect = null;
        if (G.ctx) render();
        return;
      }
    }
    // outside any chip — dismiss the prompt and continue handling
    if (G._stationPromptRect) {
      const r = G._stationPromptRect;
      const insidePill = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      G.stationPrompt = null; G._stationPromptHits = null; G._stationPromptRect = null;
      if (insidePill) {
        // tap inside pill but not on a chip — just dismiss, don't fall through
        if (G.ctx) render();
        return;
      }
    } else {
      G.stationPrompt = null; G._stationPromptHits = null; G._stationPromptRect = null;
    }
  }

  // THIRD: if a delete prompt is showing and the click hits it, confirm delete.
  if (G.deletePrompt && G._deletePromptRect) {
    const r = G._deletePromptRect;
    const hit = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    if (hit) {
      const lineToDelete = G.deletePrompt.line;
      G.deletePrompt = null;
      G._deletePromptRect = null;
      if (G.lines.includes(lineToDelete)) {
        deleteLine(lineToDelete);
        showToast('line removed');
      }
      refreshTray();
      if (G.ctx) render();
      return;
    } else {
      // dismiss prompt; continue with normal hit testing
      G.deletePrompt = null;
      G._deletePromptRect = null;
    }
  }

  // try line endpoint first (for extending)
  const ep = lineEndpointAt(p.x, p.y);
  if (ep) {
    if (!G.mode.canEdit) { showToast('extreme: cannot edit'); return; }
    G.drag = {
      kind: 'newline',
      fromLineEnd: ep,
      color: ep.line.color,
      cursorX: p.x, cursorY: p.y,
    };
    return;
  }

  // station — start a new line. ALSO record the tap so a no-movement
  // pointerup can pop the station inspection / remove-from-line prompt.
  const st = stationAt(p.x, p.y);
  if (st) {
    const slot = freeLineSlot();
    if (slot >= 0) {
      G.drag = {
        kind: 'newline',
        fromStation: st,
        color: LINE_COLORS[slot % LINE_COLORS.length],
        cursorX: p.x, cursorY: p.y,
      };
    }
    // Record tap intent regardless of whether a drag was set up. If the user
    // moves enough we'll commit a new line; if not, pointerup shows the
    // station prompt. This way a station with no free line slots still
    // responds to taps with the inspection prompt.
    G._tapDownStation = { station: st, x: p.x, y: p.y, moved: false };
    return;
  }

  // train — open the move-train prompt
  const tr = trainAt(p.x, p.y);
  if (tr && G.mode.canEdit) {
    G.trainPrompt = { train: tr, x: tr._screenX, y: tr._screenY };
    if (G.ctx) render();
    return;
  }

  // empty space — record possible tap-on-line. If user releases without
  // moving, this becomes a delete prompt; if they drag, it becomes a detour.
  const onLine = lineSegmentAt(p.x, p.y);
  if (onLine && G.mode.canEdit) {
    G._tapDown = { line: onLine.line, segIdx: onLine.segIdx, x: p.x, y: p.y, moved: false };
  } else {
    G._tapDown = null;
  }
}

function onPointerMove(e) {
  // Only honour moves from the currently-tracked pointer. This stops a stray
  // second finger from corrupting drag coordinates mid-gesture.
  if (e && e.pointerId !== undefined && G._activePointerId !== undefined &&
      e.pointerId !== G._activePointerId) {
    return;
  }
  const p = pointerPos(e);
  // touch devices have wobblier "stationary" gestures than mouse — broader
  // tap-vs-drag threshold so a still finger doesn't accidentally promote to drag
  const coarse = G._hitRadius && G._hitRadius > CFG.HIT_RADIUS;
  const tapTol2 = coarse ? 196 : 64;  // squared: 14px vs 8px
  if (G.drag) {
    G.drag.cursorX = p.x;
    G.drag.cursorY = p.y;
    // Belt-and-suspenders: render immediately so the dashed preview
    // updates without waiting for the next animation frame, even if RAF
    // is throttled (e.g. background tab waking up, slow device).
    if (G.running && G.ctx) render();
  }
  if (G._tapDown) {
    const dx = p.x - G._tapDown.x, dy = p.y - G._tapDown.y;
    if (dx*dx + dy*dy > tapTol2) G._tapDown.moved = true;
    // If a tap-down on a line segment has clearly become a drag, promote it
    // to a detour drag — user wants to insert a station mid-segment.
    if (G._tapDown.moved && !G.drag && G._tapDown.line) {
      G.drag = {
        kind: 'detour',
        line: G._tapDown.line,
        segIdx: G._tapDown.segIdx,
        color: G._tapDown.line.color,
        cursorX: p.x, cursorY: p.y,
      };
      G._tapDown = null;
      if (G.running && G.ctx) render();
    }
  }
  if (G._tapDownStation) {
    const dx = p.x - G._tapDownStation.x, dy = p.y - G._tapDownStation.y;
    if (dx*dx + dy*dy > tapTol2) G._tapDownStation.moved = true;
  }
  G.hover = stationAt(p.x, p.y);
}

function onPointerUp(e) {
  // Single-pointer lock: only the originally-tracked pointer's lift counts
  // as a release. Other simultaneous pointers' events are ignored.
  if (e && e.pointerId !== undefined && G._activePointerId !== undefined &&
      e.pointerId !== G._activePointerId) {
    return;
  }
  G._activePointerId = undefined;
  if (e && e.pointerId !== undefined) {
    try { G.canvas.releasePointerCapture(e.pointerId); } catch {}
  }
  // Tap on a line (no drag started) → show delete prompt
  if (!G.drag && G._tapDown && !G._tapDown.moved) {
    G.deletePrompt = { line: G._tapDown.line, x: G._tapDown.x, y: G._tapDown.y };
    G._tapDown = null;
    G._tapDownStation = null;
    if (G.running && G.ctx) render();
    return;
  }
  // Tap on a station with no movement → show station prompt (line stats + remove)
  if (G._tapDownStation && !G._tapDownStation.moved) {
    const st = G._tapDownStation.station;
    G._tapDownStation = null;
    G._tapDown = null;
    G.drag = null;  // cancel any pending newline drag from this tap
    G.stationPrompt = { station: st, x: st.x, y: st.y };
    if (G.running && G.ctx) render();
    return;
  }
  G._tapDown = null;
  G._tapDownStation = null;
  if (!G.drag) return;
  try {
    const p = pointerPos(e);
    const target = stationAt(p.x, p.y);

    if (G.drag.kind === 'detour') {
      // detour: insert target station mid-segment of G.drag.line
      const line = G.drag.line;
      const segIdx = G.drag.segIdx;
      if (target && line && G.lines.includes(line)) {
        const insertResult = insertStationIntoSegment(line, segIdx, target);
        if (insertResult) showToast('detour added');
      }
    } else if (G.drag.fromStation && target && target.id !== G.drag.fromStation.id) {
      // creating a brand-new line from an empty station to another station
      createLine(G.drag.fromStation, target);
    } else if (G.drag.fromLineEnd) {
      const ep = G.drag.fromLineEnd;
      const line = ep.line;
      if (target) {
        // Decide: extend, close loop, or shrink.
        const stations = line.stations;
        const isStartEnd = ep.end === 'start';
        const adjacentStationId = isStartEnd ? stations[1] : stations[stations.length - 2];
        if (target.id === adjacentStationId && stations.length >= 2) {
          shrinkLine(line, ep.end);
        } else if (stations.includes(target.id)) {
          extendLine(line, ep.stationId, target);
        } else {
          extendLine(line, ep.stationId, target);
        }
      }
      // released in empty space → no-op (the line stays unchanged)
    }
  } catch (err) {
    console.error('pointerup handler error:', err);
  } finally {
    // ALWAYS clear the drag and force a re-render so the dashed preview
    // disappears immediately, even if something above threw or RAF is slow.
    G.drag = null;
    if (G.running && G.ctx) render();
  }
}

function onDoubleClick(e) {
  if (!G.mode.creative) return;
  const p = pointerPos(e);
  // place station if not on water and not too close
  for (const river of cityRiversCanvas()) {
    for (let i = 0; i < river.length - 1; i++) {
      const proj = projectOnSegment(p, river[i], river[i+1]);
      if (dist(proj.x, proj.y, p.x, p.y) < 22) { showToast('on water'); return; }
    }
  }
  for (const s of G.stations) {
    if (dist(s.x, s.y, p.x, p.y) < 50) { showToast('too close'); return; }
  }
  const n = pxToMap(p.x, p.y);
  G.stations.push({
    id: uid(), x: p.x, y: p.y, nx: n.nx, ny: n.ny,
    shape: pickStationShape(),
    passengers: [], overcrowdTime: 0, capacityBonus: 0, loadSpeedBonus: 0,
  });
  G._netDirty = true;
}

/* -------------------------------------------------------------
 * 10. SHOP — buy assets with delivered-passenger fares
 * Open from HUD; pauses time while open.
 * ------------------------------------------------------------- */

const SHOP_ITEMS = {
  line:        { name: 'New Line', desc: 'unlock another colour line' },
  train:       { name: 'Train', desc: 'goes to a line that has none yet' },
  carriage:    { name: 'Carriage', desc: '+6 seats on the train with fewest carriages' },
  interchange: { name: 'Interchange', desc: '+capacity at biggest transfer hub' },
  crossing:    { name: 'Crossing', desc: 'bridge or tunnel for water' },
};

const SHOP_ORDER = ['line', 'train', 'carriage', 'interchange', 'crossing'];

function shopIconSvg(key) {
  switch (key) {
    case 'line':        return '<line x1="6" y1="18" x2="30" y2="18" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>';
    case 'train':       return '<rect x="6" y="14" width="24" height="8" rx="2" fill="currentColor"/>';
    case 'carriage':    return '<rect x="4" y="14" width="13" height="8" rx="1.5" fill="currentColor"/><rect x="19" y="14" width="13" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>';
    case 'interchange': return '<circle cx="18" cy="18" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="18" cy="18" r="3" fill="currentColor"/>';
    case 'crossing':    return '<path d="M4 22 Q18 6 32 22" fill="none" stroke="currentColor" stroke-width="2.5"/>';
  }
  return '';
}

function openShop() {
  if (!G.running) return;
  G.shopOpen = true;
  G.paused = true;
  document.getElementById('shop-overlay').classList.remove('hidden');
  refreshShop();
}

function closeShop() {
  G.shopOpen = false;
  G.paused = false;
  G.lastFrame = performance.now();
  document.getElementById('shop-overlay').classList.add('hidden');
}

function refreshShop() {
  const grid = document.getElementById('shop-options');
  if (!grid) return;
  // update cash readout
  const cashEl = document.getElementById('shop-cash');
  if (cashEl) cashEl.textContent = G.mode.creative ? '∞' : `${G.cash}`;
  grid.innerHTML = '';
  for (const key of SHOP_ORDER) {
    const item = SHOP_ITEMS[key];
    const cost = priceOf(key);
    const owned = G.purchased[key] || 0;
    const max = CFG.PRICES[key].max;
    const soldOut = owned >= max;
    const affordable = canBuy(key);
    const btn = document.createElement('button');
    btn.className = 'shop-option' + (soldOut ? ' sold-out' : '') + (!affordable && !soldOut ? ' unaffordable' : '');
    btn.disabled = soldOut || !affordable;
    btn.innerHTML = `
      <span class="shop-icon">
        <svg viewBox="0 0 36 36" width="32" height="32">${shopIconSvg(key)}</svg>
      </span>
      <span class="shop-body">
        <span class="shop-name">${item.name}</span>
        <span class="shop-desc">${item.desc}</span>
      </span>
      <span class="shop-price">${G.mode.creative ? 'free' : (soldOut ? 'sold out' : `${cost}¢`)}</span>
    `;
    btn.addEventListener('click', () => {
      if (buy(key)) refreshShop();
    });
    grid.appendChild(btn);
  }
}

function autoAttachCarriage() {
  if (G.assets.carriages <= 0) return;
  if (G.trains.length === 0) {
    showToast('+1 carriage in inventory');
    return;
  }
  // Compute waiting passengers per line (used as tiebreaker / weight)
  const waitByLine = new Map();
  for (const line of G.lines) {
    waitByLine.set(line.id, lineWaiting(line));
  }
  // Pick the train with the FEWEST carriages so additions spread across the
  // fleet rather than always growing the same train. Tiebreaker: train on the
  // busier line (more passengers waiting) gets it first, since that's where
  // capacity matters most.
  const ranked = G.trains
    .map(t => ({
      train: t,
      carriages: t.carriages || 0,
      waiting: waitByLine.get(t.lineId) || 0,
    }))
    .sort((a, b) => (a.carriages - b.carriages) || (b.waiting - a.waiting));
  const target = ranked[0].train;
  target.carriages++;
  G.assets.carriages--;
  showToast('carriage attached');
}

function autoApplyInterchange() {
  if (G.assets.interchanges <= 0) return;
  if (G.stations.length === 0) {
    showToast('+1 interchange');
    return;
  }
  // Rank stations by (number of lines through it) DESC, then waiting passengers DESC.
  // Skip stations that already have an interchange.
  const candidates = G.stations
    .filter(s => !s.capacityBonus)
    .map(s => ({ s, lines: linesThroughStation(s.id), waiting: s.passengers.length }))
    .sort((a, b) => (b.lines - a.lines) || (b.waiting - a.waiting));
  if (candidates.length === 0) {
    // Every station already has one — keep in inventory
    showToast('+1 interchange in inventory');
    return;
  }
  const top = candidates[0];
  // If the top candidate isn't actually a transfer hub (only one line through),
  // we still place it on the busiest unupgraded station — better than nothing,
  // but the toast hints at the rationale.
  top.s.capacityBonus += 6;
  top.s.loadSpeedBonus += 0.5;
  G.assets.interchanges--;
  if (top.lines >= 2) {
    showToast(`interchange placed on ${top.lines}-line hub`);
  } else {
    showToast('interchange placed');
  }
}

/* -------------------------------------------------------------
 * 11. UI / TRAY / HUD WIRING
 * ------------------------------------------------------------- */

function refreshTray() {
  const linesEl = document.getElementById('tray-lines');
  const assetsEl = document.getElementById('tray-assets');
  // Set up event delegation ONCE per element. The tray DOM is rebuilt every
  // frame so per-element click listeners would fire unreliably (a chip the
  // user pointed-down on might be replaced by the next frame before the
  // click event resolves). Delegation on the parent container survives any
  // amount of inner rebuilding.
  if (!linesEl._delegated) {
    // Use pointerup (not click) — more reliable on touch devices, especially
    // with touch-action: none on body which can suppress click synthesis.
    const handler = (e) => {
      const chip = e.target.closest('.line-chip.removable');
      if (!chip) return;
      e.preventDefault();
      const slot = parseInt(chip.dataset.slot, 10);
      if (!isNaN(slot)) {
        const line = G.lines.find(l => l.slot === slot);
        if (line) { deleteLine(line); showToast('line removed'); refreshTray(); render(); }
      }
    };
    linesEl.addEventListener('pointerup', handler);
    linesEl.addEventListener('click', handler);  // desktop fallback
    linesEl._delegated = true;
  }
  if (!assetsEl._delegated) {
    const handler = (e) => {
      const chip = e.target.closest('.asset-chip.clickable');
      if (!chip) return;
      e.preventDefault();
      e.stopPropagation();
      // dedupe: pointerup will fire first on touch; click follows. Skip the
      // click if we just handled the pointerup for the same gesture.
      if (e.type === 'click' && assetsEl._lastHandled && Date.now() - assetsEl._lastHandled < 500) return;
      assetsEl._lastHandled = Date.now();

      const kind = chip.dataset.kind;
      if (kind === 'train') {
        if (G.lines.length === 0) { showToast('build a line first'); return; }
        if (G.assets.trainsAvailable <= 0) return;
        const rect = chip.getBoundingClientRect();
        const canvasRect = G.canvas.getBoundingClientRect();
        G.trainPrompt = {
          source: 'inventory',
          x: rect.left + rect.width / 2 - canvasRect.left,
          y: rect.top - canvasRect.top,
        };
        if (G.ctx) render();
      } else if (kind === 'carriage') {
        autoAttachCarriage();
        refreshTray();
      } else if (kind === 'interchange') {
        autoApplyInterchange();
        refreshTray();
      }
    };
    assetsEl.addEventListener('pointerup', handler);
    assetsEl.addEventListener('click', handler);  // desktop fallback
    assetsEl._delegated = true;
  }

  linesEl.innerHTML = '';
  const totalLines = CFG.STARTING_LINES + G.assets.linesAvailable;
  for (let i = 0; i < totalLines; i++) {
    const inUse = G.usedLines.has(i);
    const line = inUse ? G.lines.find(l => l.slot === i) : null;
    if (inUse && line) {
      // wrap chip + stats label vertically. The wrapper carries data-slot so
      // tapping anywhere on it (including the stats label) still hits the
      // delegated click handler.
      const wrap = document.createElement('div');
      wrap.className = 'line-stat';
      wrap.dataset.slot = String(i);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'line-chip used' + (G.mode.canEdit ? ' removable' : '');
      chip.style.background = LINE_COLORS[i % LINE_COLORS.length];
      chip.dataset.slot = String(i);
      chip.title = G.mode.canEdit ? 'click to remove this line' : 'in use (extreme: cannot remove)';
      if (!G.mode.canEdit) chip.disabled = true;
      wrap.appendChild(chip);
      const stat = document.createElement('span');
      stat.className = 'line-stat-text';
      const w = lineWaiting(line);
      const c = lineCapacity(line);
      stat.textContent = `${w}/${c}`;
      // tint red if waiting > capacity (overloaded)
      if (c > 0 && w > c) stat.classList.add('overloaded');
      stat.title = `${w} waiting, ${c} seats`;
      wrap.appendChild(stat);
      linesEl.appendChild(wrap);
    } else {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'line-chip';
      chip.style.background = LINE_COLORS[i % LINE_COLORS.length];
      chip.dataset.slot = String(i);
      chip.title = 'available — drag from a station to use';
      chip.disabled = true;
      linesEl.appendChild(chip);
    }
  }
  assetsEl.innerHTML = '';
  const items = [
    ['trains', G.assets.trainsAvailable, 'train'],
    ['crossings', G.assets.tunnels, null],
    ['carriages', G.assets.carriages, 'carriage'],
    ['interchanges', G.assets.interchanges, 'interchange'],
  ];
  for (const [name, n, kind] of items) {
    const span = document.createElement('span');
    const clickable = n > 0 && kind !== null && G.lines.length > 0;
    span.className = 'asset-chip' + (n === 0 ? ' zero' : '') + (clickable ? ' clickable' : '');
    span.innerHTML = `${name} <span class="asset-count">${n}</span>`;
    if (clickable) {
      span.dataset.kind = kind;
      span.title = (kind === 'train')       ? 'tap a line to assign a train'
                 : (kind === 'carriage')    ? 'attach to train with fewest carriages'
                 : (kind === 'interchange') ? 'place on biggest transfer hub'
                 : '';
    }
    assetsEl.appendChild(span);
  }
}

function refreshHud() {
  document.getElementById('hud-score').textContent = G.score;
  // target indicator + progress bar
  const targetEl = document.getElementById('hud-target');
  const barEl    = document.getElementById('hud-progress');
  const fillEl   = document.getElementById('hud-progress-fill');
  if (targetEl && barEl && fillEl) {
    if (G.mode && G.mode.target > 0) {
      targetEl.textContent = ` / ${G.mode.target}`;
      barEl.style.display = 'block';
      const pct = Math.min(100, Math.round((G.score / G.mode.target) * 100));
      fillEl.style.width = pct + '%';
    } else {
      targetEl.textContent = '';
      barEl.style.display = 'none';
    }
  }
  const cashEl = document.getElementById('hud-cash');
  if (cashEl) cashEl.textContent = G.mode.creative ? '∞' : `${G.cash}¢`;
  document.getElementById('hud-city').textContent = G.city ? G.city.name : '—';
  document.getElementById('hud-mode').textContent = G.modeId;
  // clock — defensive guards against NaN/negative time so a transient bad
  // frame can't kill refreshHud (and thus the whole loop).
  const days = ['mon','tue','wed','thu','fri','sat','sun'];
  const safeTime = (typeof G.time === 'number' && isFinite(G.time) && G.time >= 0) ? G.time : 0;
  const totalDays = safeTime / CFG.SECONDS_PER_DAY;
  const dayIdx = ((Math.floor(totalDays) % 7) + 7) % 7;
  const hour = Math.floor((totalDays % 1) * 24);
  const minute = Math.floor(((totalDays % 1) * 24 % 1) * 60);
  document.getElementById('hud-day').textContent = days[dayIdx].toUpperCase();
  document.getElementById('hud-time').textContent =
    `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  // speed label — kept in sync with G.speed so restart resets the visual
  const speedLabel = document.getElementById('speed-label');
  if (speedLabel) speedLabel.textContent = G.speed + '×';
}

/* -------------------------------------------------------------
 * 12. FLOW — start, pause, end
 * ------------------------------------------------------------- */

/* Spawn the first three stations of a non-creative game. Tries hard to
   guarantee 3 stations even on small or river-heavy maps so the game
   never starts in a dead state. */
function spawnStarterStations() {
  const N = 3;
  // Round 1: normal spawn
  for (let i = 0; i < 30 && G.stations.length < N; i++) {
    const s = spawnStation();
    if (s && G.stations.length <= N) s.shape = CFG.BASE_SHAPES[G.stations.length - 1];
  }
  // Round 2: relaxed constraints
  for (let i = 0; i < 30 && G.stations.length < N; i++) {
    const s = spawnStation({ relaxed: true });
    if (s && G.stations.length <= N) s.shape = CFG.BASE_SHAPES[G.stations.length - 1];
  }
  // Round 3: deterministic grid fallback. Can't fail.
  if (G.stations.length < N) {
    const M = mapMargin();
    const pad = 20;
    const W = (G.width  && G.width  > 100) ? G.width  : 800;
    const H = (G.height && G.height > 100) ? G.height : 600;
    const cx = W / 2, cy = H / 2;
    const r  = Math.min(W, H) * 0.22;
    const slots = [
      { x: cx - r,        y: cy - r * 0.3 },
      { x: cx + r * 0.7,  y: cy - r * 0.6 },
      { x: cx,            y: cy + r * 0.7 },
    ];
    for (let i = G.stations.length; i < N; i++) {
      const slot = slots[i] || { x: cx + (i - 1) * 60, y: cy };
      const x = Math.max(M.left + pad, Math.min(W - M.right  - pad, slot.x));
      const y = Math.max(M.top  + pad, Math.min(H - M.bottom - pad, slot.y));
      const n = pxToMap(x, y);
      G.stations.push({
        id: uid(),
        x, y,
        nx: n.nx, ny: n.ny,
        shape: CFG.BASE_SHAPES[i],
        passengers: [], overcrowdTime: 0, capacityBonus: 0, loadSpeedBonus: 0,
      });
      G._netDirty = true;
    }
  }
}

function startGame(cityId, modeId) {
  G.city = CITIES.find(c => c.id === cityId) || CITIES[0];
  G.modeId = modeId;
  G.mode = MODES[modeId];

  // hide menu first so the canvas is unobscured (and so any layout-dependent
  // measurements are taken with the playing chrome shown)
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('tray').classList.remove('hidden');
  document.getElementById('pause-banner').classList.add('hidden');
  document.getElementById('gameover-overlay').classList.add('hidden');
  document.getElementById('shop-overlay').classList.add('hidden');

  // Re-measure the canvas: viewport may have changed since boot (mobile address
  // bars settle, fonts load, etc.). This guarantees stations spawn into a
  // canvas with correct pixel dimensions and the first frame paints visibly.
  resizeCanvas();

  // reset state
  G.stations = []; G.lines = []; G.trains = [];
  G.usedLines = new Set();
  G.assets = {
    tunnels: CFG.STARTING_TUNNELS,
    interchanges: CFG.STARTING_INTERCHANGES,
    carriages: 0,
    trainsAvailable: CFG.STARTING_TRAINS,
    linesAvailable: 0,
  };
  G.cash = CFG.STARTING_CASH;
  G.earnings = 0;
  G.purchased = { line: 0, train: 0, carriage: 0, interchange: 0, crossing: 0 };
  G.score = 0;
  G.weekIndex = 0;
  G.daysSinceWeek = 0;
  G.daysSinceStation = 0;
  G.time = 0;
  G.paused = false;
  G.shopOpen = false;
  G.victoryShown = false;
  G.speed = 1;
  G._netDirty = true;
  G.drag = null;
  G._tapDown = null;
  G._tapDownStation = null;
  G.deletePrompt = null;
  G._deletePromptRect = null;
  G.trainPrompt = null;
  G._trainPromptHits = null;
  G._trainPromptRect = null;
  G.stationPrompt = null;
  G._stationPromptHits = null;
  G._stationPromptRect = null;
  G._activePointerId = undefined;

  // creative starts with no preset stations; player places them.
  // other modes: spawn a few starter stations with the three base shapes
  if (!G.mode.creative) {
    spawnStarterStations();
  }

  refreshTray();
  refreshHud();
  // paint the first frame immediately so the user sees something even before
  // the first requestAnimationFrame tick.
  render();

  G.running = true;
  G.lastFrame = performance.now();
  requestAnimationFrame(loop);

  savePrefs({ ...loadPrefs(), lastCity: cityId, lastMode: modeId });

  // Briefing on the first game ever — quick reminder of the objective
  const prefs = loadPrefs();
  if (!prefs.briefingShown) {
    setTimeout(() => {
      showToast('drag between stations to build a line', 3000);
    }, 400);
    setTimeout(() => {
      const goal = G.mode.target > 0
        ? `goal: deliver ${G.mode.target} passengers without overcrowding.`
        : 'deliver as many passengers as you can.';
      showToast(goal, 4200);
    }, 3700);
    savePrefs({ ...prefs, briefingShown: true });
  }
}

function pauseFor(reason) { G.paused = true; }
function resumeFrom(reason) { G.paused = false; G.lastFrame = performance.now(); }

function togglePause() {
  if (G.shopOpen) { closeShop(); return; }
  G.paused = !G.paused;
  document.getElementById('pause-banner').classList.toggle('hidden', !G.paused);
  if (!G.paused) G.lastFrame = performance.now();
}

function gameOver(reason) {
  G.running = false;
  // record stats
  const data = loadSaveData();
  data.stats[G.city.id] = data.stats[G.city.id] || {};
  const cs = data.stats[G.city.id];
  cs[G.modeId] = cs[G.modeId] || { best: 0, plays: 0, completed: false };
  cs[G.modeId].best = Math.max(cs[G.modeId].best, G.score);
  cs[G.modeId].plays = (cs[G.modeId].plays || 0) + 1;
  // unlock extreme: deliver 100+ in normal (also automatic if completed)
  if (G.modeId === 'normal' && G.score >= 100) {
    data.unlocks[G.city.id] = data.unlocks[G.city.id] || {};
    data.unlocks[G.city.id].extreme = true;
  }
  writeSaveData(data);

  document.getElementById('result-score').textContent = G.score;
  document.getElementById('result-earnings').textContent = G.earnings;
  document.getElementById('result-days').textContent = Math.floor(G.time / CFG.SECONDS_PER_DAY);
  document.getElementById('result-stations').textContent = G.stations.length;
  document.getElementById('gameover-reason').textContent = reason;
  document.getElementById('gameover-overlay').classList.remove('hidden');
}

/* Victory: player hit the mode's target score. Pause, record, offer
   continue (game proceeds in endless mode) or quit. */
function showVictory() {
  G.paused = true;
  // persist the completion
  const data = loadSaveData();
  data.stats[G.city.id] = data.stats[G.city.id] || {};
  data.stats[G.city.id][G.modeId] = data.stats[G.city.id][G.modeId] || { best: 0, plays: 0, completed: false };
  data.stats[G.city.id][G.modeId].completed = true;
  data.stats[G.city.id][G.modeId].best = Math.max(data.stats[G.city.id][G.modeId].best, G.score);
  // hitting the target in normal also unlocks extreme on this city
  if (G.modeId === 'normal') {
    data.unlocks[G.city.id] = data.unlocks[G.city.id] || {};
    data.unlocks[G.city.id].extreme = true;
  }
  writeSaveData(data);

  document.getElementById('victory-score').textContent = G.score;
  document.getElementById('victory-target').textContent = G.mode.target;
  document.getElementById('victory-earnings').textContent = G.earnings;
  document.getElementById('victory-days').textContent = Math.floor(G.time / CFG.SECONDS_PER_DAY);
  document.getElementById('victory-overlay').classList.remove('hidden');
}

/* Continue past victory — converts current run into an endless one. */
function continuePastVictory() {
  // flip the run into endless: the original mode flag values stay, but we
  // mark the active run as endless so no further victory toasts fire.
  G.mode = { ...G.mode, endless: true, target: 0 };
  G.paused = false;
  G.lastFrame = performance.now();
  document.getElementById('victory-overlay').classList.add('hidden');
}

function quitToMenu() {
  G.running = false;
  G.shopOpen = false;
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('tray').classList.add('hidden');
  document.getElementById('pause-banner').classList.add('hidden');
  document.getElementById('gameover-overlay').classList.add('hidden');
  document.getElementById('victory-overlay').classList.add('hidden');
  document.getElementById('shop-overlay').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  updateMenuFooter();
}

/* -------------------------------------------------------------
 * 13. MAIN LOOP
 * ------------------------------------------------------------- */

function loop(now) {
  if (!G.running) return;
  try {
    const realDt = Math.min(0.1, (now - G.lastFrame) / 1000);
    G.lastFrame = now;
    if (!G.paused) simStep(realDt * G.speed);
    refreshHud();
    refreshTray();
    render();
  } catch (err) {
    // Never let a single bad frame kill the loop. Log and keep going.
    console.error('freemetro loop error:', err);
    G.lastFrame = performance.now();
  }
  requestAnimationFrame(loop);
}

/* -------------------------------------------------------------
 * 14. MENU / OVERLAY WIRING
 * ------------------------------------------------------------- */

function buildCityGrid() {
  const grid = document.getElementById('city-grid');
  grid.innerHTML = '';
  const data = loadSaveData();
  const prefs = loadPrefs();
  for (const c of CITIES) {
    const card = document.createElement('button');
    card.className = 'city-card';
    if (prefs.lastCity === c.id) card.classList.add('selected');
    const stats = (data.stats[c.id] || {});
    const best = Math.max(...Object.values(stats).map(v => v.best || 0), 0);
    const completedNormal  = !!(stats.normal  && stats.normal.completed);
    const completedExtreme = !!(stats.extreme && stats.extreme.completed);
    let badge = '';
    if (completedExtreme) badge = '<span class="city-badge" title="extreme completed">★</span>';
    else if (completedNormal) badge = '<span class="city-badge" title="normal completed">✓</span>';
    card.innerHTML = `
      <span class="city-name">${c.name}${badge}</span>
      <span class="city-meta">${best ? 'best ' + best : 'unplayed'}</span>
    `;
    card.addEventListener('click', () => {
      savePrefs({ ...loadPrefs(), lastCity: c.id });
      buildCityGrid();
      updateMenuFooter();
    });
    grid.appendChild(card);
  }
}

function buildModeGrid() {
  const grid = document.getElementById('mode-grid');
  const prefs = loadPrefs();
  const data = loadSaveData();
  for (const card of grid.querySelectorAll('.mode-card')) {
    card.classList.remove('selected', 'locked');
    const m = card.dataset.mode;
    if (prefs.lastMode === m) card.classList.add('selected');
    if (m === 'extreme') {
      const cityId = prefs.lastCity || CITIES[0].id;
      const unlocked = (data.unlocks[cityId] || {}).extreme;
      if (!unlocked) {
        card.classList.add('locked');
      }
    }
    card.onclick = () => {
      if (card.classList.contains('locked')) {
        showToast('reach 100 in normal to unlock extreme');
        return;
      }
      savePrefs({ ...loadPrefs(), lastMode: m });
      buildModeGrid();
      updateMenuFooter();
    };
  }
}

function buildStats() {
  const el = document.getElementById('stats-content');
  const data = loadSaveData();
  const rows = [];
  for (const c of CITIES) {
    const cs = data.stats[c.id];
    if (!cs) continue;
    for (const m in cs) {
      rows.push(`<div class="stat-row"><span class="stat-key">${c.name} · ${m}</span><span class="stat-num">${cs[m].best || 0}</span></div>`);
    }
  }
  if (rows.length === 0) {
    el.innerHTML = '<p style="text-align:center;color:var(--ink-mute);font-family:var(--font-mono);font-size:11px;padding:24px 0;">no games played yet</p>';
  } else {
    el.innerHTML = rows.join('');
  }
}

function updateMenuFooter() {
  const prefs = loadPrefs();
  const c = CITIES.find(c => c.id === prefs.lastCity) || CITIES[0];
  const m = prefs.lastMode || 'normal';
  document.getElementById('menu-current').textContent = `${c.name} — ${m}`;
}

function showOverlay(id) {
  for (const o of document.querySelectorAll('.overlay')) {
    if (o.id !== 'menu') o.classList.add('hidden');
  }
  document.getElementById('menu').classList.add('hidden');
  document.getElementById(id).classList.remove('hidden');
}

function bindMenu() {
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = btn.dataset.action;
      switch (action) {
        case 'play': {
          const prefs = loadPrefs();
          startGame(prefs.lastCity || CITIES[0].id, prefs.lastMode || 'normal');
          break;
        }
        case 'cities': buildCityGrid(); showOverlay('cities-overlay'); break;
        case 'modes':  buildModeGrid(); showOverlay('modes-overlay'); break;
        case 'stats':  buildStats(); showOverlay('stats-overlay'); break;
        case 'how':    showOverlay('how-overlay'); break;
        case 'back':
          document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
          document.getElementById('menu').classList.remove('hidden');
          updateMenuFooter();
          break;
        case 'restart': {
          const prefs = loadPrefs();
          startGame(prefs.lastCity || CITIES[0].id, prefs.lastMode || 'normal');
          break;
        }
        case 'resume': togglePause(); break;
        case 'quit': quitToMenu(); break;
        case 'shop': openShop(); break;
        case 'close-shop': closeShop(); break;
        case 'continue-victory': continuePastVictory(); break;
        case 'reset-stats':
          if (confirm('Reset all statistics and unlocks?')) {
            localStorage.removeItem(SAVE_KEY);
            buildStats();
            showToast('all data cleared');
          }
          break;
      }
    });
  });

  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-speed').addEventListener('click', () => {
    G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1;
    document.getElementById('speed-label').textContent = G.speed + '×';
  });
  document.getElementById('btn-menu').addEventListener('click', togglePause);
  const shopBtn = document.getElementById('btn-shop');
  if (shopBtn) shopBtn.addEventListener('click', () => {
    if (G.shopOpen) closeShop(); else openShop();
  });

  // keyboard
  window.addEventListener('keydown', (e) => {
    if (!G.running) return;
    if (e.key === 'Escape') {
      // Escape priority: dismiss prompts first, then shop, then pause toggle
      if (G.stationPrompt) {
        e.preventDefault();
        G.stationPrompt = null; G._stationPromptHits = null; G._stationPromptRect = null;
        if (G.ctx) render();
        return;
      }
      if (G.trainPrompt) {
        e.preventDefault();
        G.trainPrompt = null; G._trainPromptHits = null; G._trainPromptRect = null;
        if (G.ctx) render();
        return;
      }
      if (G.deletePrompt) {
        e.preventDefault();
        G.deletePrompt = null; G._deletePromptRect = null;
        if (G.ctx) render();
        return;
      }
      if (G.shopOpen) { e.preventDefault(); closeShop(); return; }
      e.preventDefault();
      togglePause();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (G.shopOpen) closeShop(); else togglePause();
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      if (G.shopOpen) closeShop(); else openShop();
    }
  });
}

/* -------------------------------------------------------------
 * 15. BOOT
 * ------------------------------------------------------------- */

function boot() {
  G.canvas = document.getElementById('canvas');
  G.ctx = G.canvas.getContext('2d');
  resizeCanvas();

  const onResize = () => {
    resizeCanvas();
    if (G.running) render();
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  // mobile chrome: visualViewport changes when the address bar shows/hides
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onResize);
  }
  // re-measure once after page load (CSS/fonts may have settled by then)
  window.addEventListener('load', onResize);

  setupInput();
  bindMenu();
  updateMenuFooter();
}

document.addEventListener('DOMContentLoaded', boot);
