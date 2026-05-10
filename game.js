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
  EXOTIC_SHAPES: ['diamond', 'pentagon', 'star', 'cross', 'gem'],
  EXOTIC_SHAPE_WEEK: 2,            // first week an exotic shape can appear
  EXOTIC_PASSENGER_RATE: 0.04,     // passengers wanting exotic shapes
  // trains
  TRAIN_SPEED: 80,                 // px/s base
  TRAIN_LOAD_TIME: 0.18,           // seconds per passenger boarding/alighting
  TRAIN_BASE_CAPACITY: 6,
  CARRIAGE_CAPACITY: 6,
  // assets at start
  STARTING_LINES: 3,
  STARTING_TRAINS: 3,
  STARTING_TUNNELS: 3,
  STARTING_INTERCHANGES: 0,
  // line snap distance
  HIT_RADIUS: 22,
  // station radius
  STATION_RADIUS: 13,
  // map margin from edges
  MAP_MARGIN: 60,
  // station shape weights — common shapes are far more frequent
  COMMON_WEIGHT: 9,
  EXOTIC_STATION_WEIGHT: 1,
  EXOTIC_FIRST_WEEK: 1,
};

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
  normal:   { canEdit: true,  endless: false, weeklyUpgrades: true,  earnUpgrades: false, creative: false },
  extreme:  { canEdit: false, endless: false, weeklyUpgrades: true,  earnUpgrades: false, creative: false },
  endless:  { canEdit: true,  endless: true,  weeklyUpgrades: false, earnUpgrades: true,  creative: false },
  creative: { canEdit: true,  endless: true,  weeklyUpgrades: false, earnUpgrades: false, creative: true  },
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

  // assets pool
  assets: { tunnels: 0, interchanges: 0, carriages: 0, trainsAvailable: 0, linesAvailable: 0 },
  usedLines: new Set(), // slots in use

  // input
  drag: null,
  hover: null,

  // stats / score
  score: 0,             // delivered passengers
  weekIndex: 0,
  daysSinceWeek: 0,
  daysSinceStation: 0,

  // weekly upgrade pending
  pendingUpgrade: false,
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
  const m = CFG.MAP_MARGIN, w = G.width - 2*m, h = G.height - 2*m;
  return G.city.rivers.map(line => line.map(([nx, ny]) => ({ x: m + nx*w, y: m + ny*h })));
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
  return choice(pool);
}

function spawnStation() {
  if (G.stations.length >= 50) return; // hard ceiling
  const m = CFG.MAP_MARGIN + 20;
  for (let attempt = 0; attempt < 30; attempt++) {
    const x = rand(m, G.width - m);
    const y = rand(m, G.height - m);
    // not on water (river)
    let onWater = false;
    for (const river of cityRiversCanvas()) {
      for (let i = 0; i < river.length - 1; i++) {
        const proj = projectOnSegment({x,y}, river[i], river[i+1]);
        if (dist(proj.x, proj.y, x, y) < 22) { onWater = true; break; }
      }
      if (onWater) break;
    }
    if (onWater) continue;
    // not too close to existing stations
    let tooClose = false;
    for (const s of G.stations) {
      if (dist(x, y, s.x, s.y) < 70) { tooClose = true; break; }
    }
    if (tooClose) continue;

    const station = {
      id: uid(),
      x, y,
      shape: pickStationShape(),
      passengers: [],
      overcrowdTime: 0,
      capacityBonus: 0,    // interchanges
      loadSpeedBonus: 0,
    };
    G.stations.push(station);
    return station;
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
  // give the line a starting train if available
  if (G.assets.trainsAvailable > 0) {
    addTrain(line.id);
    G.assets.trainsAvailable--;
  }
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

/* -------------------------------------------------------------
 * 7. SIMULATION STEP
 * ------------------------------------------------------------- */

function simStep(dt) {
  // dt in real seconds; in-game time scales by 1/SECONDS_PER_DAY days/sec
  const dayDt = dt / CFG.SECONDS_PER_DAY;
  G.time += dt;

  // station spawning
  G.daysSinceStation += dayDt;
  if (G.daysSinceStation >= CFG.STATION_SPAWN_DAYS) {
    G.daysSinceStation = 0;
    spawnStation();
  }

  // passenger spawning — proportional to number of stations
  // chance per station per day = 1 / PASSENGER_SPAWN_DAYS, scaled by week
  const ridershipMult = 1 + G.weekIndex * 0.06;
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

  // weekly tick
  G.daysSinceWeek += dayDt;
  if (G.daysSinceWeek >= CFG.DAYS_PER_WEEK) {
    G.daysSinceWeek = 0;
    G.weekIndex++;
    if (G.mode.weeklyUpgrades) {
      G.pendingUpgrade = true;
      pauseFor('upgrade');
      showUpgradeOverlay();
    }
  }

  // endless: earn upgrades by ridership (every 30 deliveries)
  if (G.mode.earnUpgrades) {
    const tier = Math.floor(G.score / 30);
    if (tier > G._lastEarnTier) {
      G._lastEarnTier = tier;
      if (tier > 0) grantRandomUpgrade(false);
    }
  }
}

function updateTrain(train, dt) {
  const line = G.lines.find(l => l.id === train.lineId);
  if (!line) return;
  const pts = lineStationPoints(line);
  if (pts.length < 2) return;

  if (train.state === 'loading') {
    train.stateTimer -= dt;
    if (train.stateTimer <= 0) train.state = 'moving';
    return;
  }

  const station = pts[train.atIdx];
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
  const station = pts[train.atIdx];
  const cap = train.capacity + train.carriages * CFG.CARRIAGE_CAPACITY;
  // future stations on this train's path (used to decide if a passenger should board)
  const reachableShapes = new Set(pts.map(s => s.shape));

  // alight: any train passenger whose desired shape == station.shape
  const stayed = [];
  let alighted = 0;
  for (const shape of train.passengers) {
    if (shape === station.shape) {
      G.score++;
      alighted++;
    } else {
      stayed.push(shape);
    }
  }
  train.passengers = stayed;

  // board: those whose shape is reachable on this line
  const remaining = [];
  let boarded = 0;
  for (const shape of station.passengers) {
    if (train.passengers.length < cap && reachableShapes.has(shape)) {
      train.passengers.push(shape);
      boarded++;
    } else {
      remaining.push(shape);
    }
  }
  station.passengers = remaining;

  const exchanged = alighted + boarded;
  if (exchanged > 0) {
    train.state = 'loading';
    train.stateTimer = CFG.TRAIN_LOAD_TIME * exchanged * (1 - station.loadSpeedBonus * 0.4);
  }
}

/* -------------------------------------------------------------
 * 8. RENDERING
 * ------------------------------------------------------------- */

function resizeCanvas() {
  const c = G.canvas;
  G.dpr = window.devicePixelRatio || 1;
  G.width = window.innerWidth;
  G.height = window.innerHeight;
  c.width = G.width * G.dpr;
  c.height = G.height * G.dpr;
  c.style.width = G.width + 'px';
  c.style.height = G.height + 'px';
  G.ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
}

function render() {
  const ctx = G.ctx;
  ctx.clearRect(0, 0, G.width, G.height);

  drawWater(ctx);
  if (G.drag && G.drag.kind === 'newline') drawDragPreview(ctx);
  drawLines(ctx);
  drawTrains(ctx);
  drawStations(ctx);

  if (G.mode.creative) drawCreativeHint(ctx);
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

function drawLines(ctx) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  for (const line of G.lines) {
    const pts = lineStationPoints(line);
    if (pts.length < 2) continue;
    ctx.strokeStyle = line.color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (line.loop) ctx.lineTo(pts[0].x, pts[0].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDragPreview(ctx) {
  const d = G.drag;
  if (!d.fromStation && !d.fromLineEnd) return;
  const a = d.fromStation || G.stations.find(s => s.id === d.fromLineEnd.stationId);
  if (!a) return;
  ctx.save();
  ctx.strokeStyle = d.color || getCss('--ink');
  ctx.lineWidth = 4;
  ctx.setLineDash([8, 6]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(d.cursorX, d.cursorY);
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
    let nextIdx;
    if (line.loop) nextIdx = (train.atIdx + train.dir + pts.length) % pts.length;
    else nextIdx = clamp(train.atIdx + train.dir, 0, pts.length - 1);

    const a = pts[train.atIdx], b = pts[nextIdx];
    const x = a.x + (b.x - a.x) * train.pos;
    const y = a.y + (b.y - a.y) * train.pos;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);

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
  for (const s of G.stations) {
    if (dist(s.x, s.y, x, y) <= CFG.HIT_RADIUS) return s;
  }
  return null;
}

function lineEndpointAt(x, y) {
  for (const line of G.lines) {
    const pts = lineStationPoints(line);
    if (pts.length === 0) continue;
    const first = pts[0], last = pts[pts.length - 1];
    if (dist(first.x, first.y, x, y) <= CFG.HIT_RADIUS) return { line, stationId: first.id, end: 'start' };
    if (dist(last.x,  last.y,  x, y) <= CFG.HIT_RADIUS) return { line, stationId: last.id,  end: 'end' };
  }
  return null;
}

function lineSegmentAt(x, y) {
  for (const line of G.lines) {
    const pts = lineStationPoints(line);
    for (let i = 0; i < pts.length - 1; i++) {
      const proj = projectOnSegment({x, y}, pts[i], pts[i+1]);
      if (dist(proj.x, proj.y, x, y) < 8) return line;
    }
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

  // long-press for delete
  let longPressTimer = null, longPressPos = null;
  c.addEventListener('pointerdown', (e) => {
    longPressPos = pointerPos(e);
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (!G.drag) {
        const line = lineSegmentAt(longPressPos.x, longPressPos.y);
        if (line) {
          deleteLine(line);
          showToast('line removed');
        }
      }
    }, 600);
  });
  c.addEventListener('pointerup', () => clearTimeout(longPressTimer));
  c.addEventListener('pointermove', () => {
    // cancel long-press if user is drag-creating a line
    if (G.drag) clearTimeout(longPressTimer);
  });
}

function onPointerDown(e) {
  if (!G.running || G.paused) return;
  const p = pointerPos(e);

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

  // station — start a new line
  const st = stationAt(p.x, p.y);
  if (st) {
    const slot = freeLineSlot();
    if (slot < 0) { showToast('no free lines'); return; }
    G.drag = {
      kind: 'newline',
      fromStation: st,
      color: LINE_COLORS[slot % LINE_COLORS.length],
      cursorX: p.x, cursorY: p.y,
    };
  }
}

function onPointerMove(e) {
  const p = pointerPos(e);
  if (G.drag) {
    G.drag.cursorX = p.x;
    G.drag.cursorY = p.y;
  }
  G.hover = stationAt(p.x, p.y);
}

function onPointerUp(e) {
  if (!G.drag) return;
  const p = pointerPos(e);
  const target = stationAt(p.x, p.y);
  if (target) {
    if (G.drag.fromStation && target.id !== G.drag.fromStation.id) {
      createLine(G.drag.fromStation, target);
    } else if (G.drag.fromLineEnd) {
      extendLine(G.drag.fromLineEnd.line, G.drag.fromLineEnd.stationId, target);
    }
  }
  G.drag = null;
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
  G.stations.push({
    id: uid(), x: p.x, y: p.y,
    shape: pickStationShape(),
    passengers: [], overcrowdTime: 0, capacityBonus: 0, loadSpeedBonus: 0,
  });
}

/* -------------------------------------------------------------
 * 10. WEEKLY UPGRADE
 * ------------------------------------------------------------- */

const UPGRADES = {
  line:        { name: 'New Line', desc: 'unlock another line slot', icon: 'L' },
  train:       { name: 'Train', desc: 'a new locomotive', icon: 'T' },
  carriage:    { name: 'Carriage', desc: 'extend a train by 6 seats', icon: 'C' },
  interchange: { name: 'Interchange', desc: '+capacity, faster loading', icon: 'I' },
  tunnel:      { name: 'Tunnels (×2)', desc: 'cross water', icon: '~' },
};

function rollUpgradeOptions() {
  // always include train; randomize the second
  const pool = ['line', 'carriage', 'interchange', 'tunnel'];
  const second = choice(pool);
  return ['train', second];
}

function showUpgradeOverlay() {
  const overlay = document.getElementById('upgrade-overlay');
  const optsEl = document.getElementById('upgrade-options');
  const subEl = document.getElementById('upgrade-sub');
  subEl.textContent = `week ${G.weekIndex} — choose an upgrade`;
  optsEl.innerHTML = '';
  const opts = rollUpgradeOptions();
  for (const key of opts) {
    const u = UPGRADES[key];
    const btn = document.createElement('button');
    btn.className = 'upgrade-option';
    btn.innerHTML = `
      <span class="upgrade-icon">
        <svg viewBox="0 0 36 36" width="36" height="36">${upgradeIconSvg(key)}</svg>
      </span>
      <span class="upgrade-name">${u.name}</span>
      <span class="upgrade-desc">${u.desc}</span>
    `;
    btn.addEventListener('click', () => {
      applyUpgrade(key);
      overlay.classList.add('hidden');
      G.pendingUpgrade = false;
      resumeFrom('upgrade');
    });
    optsEl.appendChild(btn);
  }
  overlay.classList.remove('hidden');
}

function upgradeIconSvg(key) {
  switch (key) {
    case 'line':        return '<line x1="6" y1="18" x2="30" y2="18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>';
    case 'train':       return '<rect x="6" y="14" width="24" height="8" rx="2" fill="currentColor"/>';
    case 'carriage':    return '<rect x="4" y="14" width="13" height="8" rx="1.5" fill="currentColor"/><rect x="19" y="14" width="13" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>';
    case 'interchange': return '<circle cx="18" cy="18" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="18" cy="18" r="3" fill="currentColor"/>';
    case 'tunnel':      return '<path d="M4 22 Q18 6 32 22" fill="none" stroke="currentColor" stroke-width="2.5"/>';
  }
  return '';
}

function applyUpgrade(key) {
  switch (key) {
    case 'line':
      G.assets.linesAvailable++;
      showToast('+1 line unlocked');
      break;
    case 'train':
      G.assets.trainsAvailable++;
      showToast('+1 train');
      break;
    case 'carriage':
      // attach to the train with most passengers waiting
      G.assets.carriages++;
      // try to auto-attach
      autoAttachCarriage();
      break;
    case 'interchange':
      G.assets.interchanges++;
      autoApplyInterchange();
      break;
    case 'tunnel':
      G.assets.tunnels += 2;
      showToast('+2 tunnels');
      break;
  }
  refreshTray();
}

function autoAttachCarriage() {
  // attach to train of busiest line (most total passengers waiting)
  const busiest = G.lines
    .map(line => {
      const stations = lineStationPoints(line);
      const waiting = stations.reduce((sum, s) => sum + s.passengers.length, 0);
      return { line, waiting };
    })
    .sort((a, b) => b.waiting - a.waiting)[0];
  if (busiest) {
    const t = G.trains.find(t => t.lineId === busiest.line.id);
    if (t) {
      t.carriages++;
      G.assets.carriages--;
      showToast('carriage attached');
      return;
    }
  }
  showToast('+1 carriage in inventory');
}

function autoApplyInterchange() {
  // upgrade the most-busy station
  const busiest = [...G.stations].sort((a, b) => b.passengers.length - a.passengers.length)[0];
  if (busiest) {
    busiest.capacityBonus += 6;
    busiest.loadSpeedBonus += 0.5;
    G.assets.interchanges--;
    showToast('interchange placed');
  } else {
    showToast('+1 interchange');
  }
}

function grantRandomUpgrade(silent) {
  const key = choice(['train', 'tunnel', 'carriage']);
  applyUpgrade(key);
  if (!silent) showToast(`bonus: ${UPGRADES[key].name}`);
}

/* -------------------------------------------------------------
 * 11. UI / TRAY / HUD WIRING
 * ------------------------------------------------------------- */

function refreshTray() {
  const linesEl = document.getElementById('tray-lines');
  const assetsEl = document.getElementById('tray-assets');
  linesEl.innerHTML = '';
  const totalLines = CFG.STARTING_LINES + G.assets.linesAvailable;
  for (let i = 0; i < totalLines; i++) {
    const chip = document.createElement('span');
    chip.className = 'line-chip' + (G.usedLines.has(i) ? ' used' : '');
    chip.style.background = LINE_COLORS[i % LINE_COLORS.length];
    chip.title = G.usedLines.has(i) ? 'in use' : 'available';
    linesEl.appendChild(chip);
  }
  assetsEl.innerHTML = '';
  const items = [
    ['trains', G.assets.trainsAvailable],
    ['tunnels', G.assets.tunnels],
    ['carriages', G.assets.carriages],
    ['interchanges', G.assets.interchanges],
  ];
  for (const [name, n] of items) {
    const span = document.createElement('span');
    span.className = 'asset-chip' + (n === 0 ? ' zero' : '');
    span.innerHTML = `${name} <span class="asset-count">${n}</span>`;
    assetsEl.appendChild(span);
  }
}

function refreshHud() {
  document.getElementById('hud-score').textContent = G.score;
  document.getElementById('hud-city').textContent = G.city ? G.city.name : '—';
  document.getElementById('hud-mode').textContent = G.modeId;
  // clock
  const days = ['mon','tue','wed','thu','fri','sat','sun'];
  const totalDays = G.time / CFG.SECONDS_PER_DAY;
  const dayIdx = Math.floor(totalDays) % 7;
  const hour = Math.floor((totalDays % 1) * 24);
  const minute = Math.floor(((totalDays % 1) * 24 % 1) * 60);
  document.getElementById('hud-day').textContent = days[dayIdx].toUpperCase();
  document.getElementById('hud-time').textContent =
    `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}

/* -------------------------------------------------------------
 * 12. FLOW — start, pause, end
 * ------------------------------------------------------------- */

function startGame(cityId, modeId) {
  G.city = CITIES.find(c => c.id === cityId) || CITIES[0];
  G.modeId = modeId;
  G.mode = MODES[modeId];
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
  G.score = 0;
  G.weekIndex = 0;
  G.daysSinceWeek = 0;
  G.daysSinceStation = 0;
  G.time = 0;
  G.paused = false;
  G.speed = 1;
  G._lastEarnTier = 0;

  // creative starts with no preset stations; player places them.
  // other modes: spawn a few starter stations (basic shapes, ensure mix)
  if (!G.mode.creative) {
    let attempts = 0;
    while (G.stations.length < 3 && attempts < 50) {
      attempts++;
      const s = spawnStation();
      if (!s) continue;
      // force first three to be the three base shapes
      if (G.stations.length <= 3) s.shape = CFG.BASE_SHAPES[G.stations.length - 1];
    }
  }

  // hide menu, show HUD/tray
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('tray').classList.remove('hidden');
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('gameover-overlay').classList.add('hidden');

  refreshTray();
  refreshHud();

  G.running = true;
  G.lastFrame = performance.now();
  requestAnimationFrame(loop);

  savePrefs({ ...loadPrefs(), lastCity: cityId, lastMode: modeId });
}

function pauseFor(reason) { G.paused = true; }
function resumeFrom(reason) { G.paused = false; G.lastFrame = performance.now(); }

function togglePause() {
  if (G.pendingUpgrade) return;
  G.paused = !G.paused;
  document.getElementById('pause-overlay').classList.toggle('hidden', !G.paused);
  if (!G.paused) G.lastFrame = performance.now();
}

function gameOver(reason) {
  G.running = false;
  // record stats
  const data = loadSaveData();
  data.stats[G.city.id] = data.stats[G.city.id] || {};
  const cs = data.stats[G.city.id];
  cs[G.modeId] = cs[G.modeId] || { best: 0, plays: 0 };
  cs[G.modeId].best = Math.max(cs[G.modeId].best, G.score);
  cs[G.modeId].plays = (cs[G.modeId].plays || 0) + 1;
  // unlock extreme: deliver 100+ in normal
  if (G.modeId === 'normal' && G.score >= 100) {
    data.unlocks[G.city.id] = data.unlocks[G.city.id] || {};
    data.unlocks[G.city.id].extreme = true;
  }
  writeSaveData(data);

  document.getElementById('result-score').textContent = G.score;
  document.getElementById('result-days').textContent = Math.floor(G.time / CFG.SECONDS_PER_DAY);
  document.getElementById('result-stations').textContent = G.stations.length;
  document.getElementById('gameover-reason').textContent = reason;
  document.getElementById('gameover-overlay').classList.remove('hidden');
}

function quitToMenu() {
  G.running = false;
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('tray').classList.add('hidden');
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('gameover-overlay').classList.add('hidden');
  document.getElementById('upgrade-overlay').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  updateMenuFooter();
}

/* -------------------------------------------------------------
 * 13. MAIN LOOP
 * ------------------------------------------------------------- */

function loop(now) {
  if (!G.running) return;
  const realDt = Math.min(0.1, (now - G.lastFrame) / 1000);
  G.lastFrame = now;
  if (!G.paused) simStep(realDt * G.speed);
  refreshHud();
  refreshTray();
  render();
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
    card.innerHTML = `
      <span class="city-name">${c.name}</span>
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

  // keyboard
  window.addEventListener('keydown', (e) => {
    if (!G.running) return;
    if (e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      togglePause();
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
  window.addEventListener('resize', () => { resizeCanvas(); if (G.running) render(); });
  setupInput();
  bindMenu();
  updateMenuFooter();
  // first render of menu state
}

document.addEventListener('DOMContentLoaded', boot);
