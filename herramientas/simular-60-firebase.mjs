const firebaseConfig = {
  apiKey: 'AIzaSyCnM74qIoBtYY943dChQPYEclRSvUfDu1g',
  databaseURL: 'https://brasilia-borderland-en-vivo-default-rtdb.firebaseio.com'
};

const args = parseArgs(process.argv.slice(2));
const durationSeconds = Number(args.seconds || args.s || 45);
const hz = Number(args.hz || 2);
const runId = args.run || new Date().toISOString().replace(/[:.]/g, '-');
const mode = args.mode || 'safe';
const basePath = mode === 'live' ? '' : `stressTests/${runId}`;
const authPoolSize = Math.max(1, Number(args.authPool || args['auth-pool'] || 8));

const gameProfiles = [
  { id: 'juego80', weight: 10, path: joinPath(basePath, 'juegos/juego80'), kind: 'roundAnswer' },
  { id: 'codigoMaestro', weight: 10, path: joinPath(basePath, 'juegos/codigoMaestro'), kind: 'attempts' },
  { id: 'cuatroFiguras', weight: 10, path: joinPath(basePath, 'juegos/cuatroFiguras'), kind: 'cards' },
  { id: 'ganaElimina', weight: 10, path: joinPath(basePath, 'juegos/ganaElimina'), kind: 'fastAnswer' },
  { id: 'carrera', weight: 10, path: joinPath(basePath, 'carrerasLagunaSeca/simulacion60'), kind: 'race' }
];

const perGame = args.perGame || args['per-game'];
const clients = Number(args.clients || args.c || (perGame ? Number(perGame) * gameProfiles.length : 60));
const selectedProfiles = perGame ? repeatEachProfile(gameProfiles, Number(perGame)) : expandProfiles(gameProfiles, clients);
const intervalMs = Math.max(120, Math.round(1000 / hz));
const deadline = Date.now() + durationSeconds * 1000;
const metrics = {
  ok: 0,
  fail: 0,
  latencies: [],
  byStatus: new Map(),
  byGame: new Map()
};

main().catch(error => {
  console.error('\nFALLO GENERAL:', error.message);
  process.exitCode = 1;
});

async function main() {
  printHeader();
  if (mode === 'live') {
    console.log('ADVERTENCIA: modo live escribe en rutas reales de juego.');
    console.log('Usalo solo si antes reiniciaste las salas y aceptas datos de prueba.\n');
  }

  await cleanupSafeRun();
  await seedSafeRooms();

  const authPool = await createAuthPool(authPoolSize);
  const runners = selectedProfiles.map((profile, index) => runClient(index + 1, profile, authPool));
  await Promise.all(runners);

  await finalReads();
  printSummary();
}

async function runClient(number, profile, authPool) {
  const name = `SIM-${profile.id}-${String(number).padStart(2, '0')}`;
  const auth = authPool[(number - 1) % authPool.length];
  const uid = `sim_${number}_${auth.localId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16)}`;
  const client = { number, name, uid, profile, token: auth.idToken };

  await timed(profile.id, () => registerClient(client));

  let tick = 0;
  while (Date.now() < deadline) {
    tick += 1;
    await sleep(Math.random() * intervalMs);
    await timed(profile.id, () => publishTick(client, tick));
    await sleep(intervalMs * (0.55 + Math.random() * 0.65));
  }
}

async function registerClient(client) {
  const { profile, uid, name } = client;
  if (profile.kind === 'race') {
    const slot = ((client.number - 1) % 40) + 1;
    await patch(profile.path, client.token, {
      [`players/${uid}`]: {
        nickname: name,
        slot,
        x: 260 + slot * 28,
        z: 120,
        angle: 0,
        progress: 0,
        lap: 1,
        finished: false,
        joinedAt: now()
      }
    });
    return;
  }

  if (profile.kind === 'position') {
    await patch(profile.path, client.token, {
      [`players/${uid}`]: {
        uid,
        nickname: name,
        team: client.number % 2 ? 'blue' : 'red',
        avatar: client.number % 10,
        spawnSlot: client.number % 20,
        health: 3,
        alive: true,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        joinedAt: now(),
        updatedAt: now()
      }
    });
    return;
  }

  await patch(profile.path, client.token, {
    [`players/${uid}`]: {
      nombre: name,
      nickname: name,
      avatar: client.number % 10,
      wins: 0,
      intentos: 0,
      activo: true,
      eliminado: false,
      joinedAt: now()
    }
  });
}

async function publishTick(client, tick) {
  const { profile, uid } = client;
  const t = now();

  if (profile.kind === 'race') {
    await patch(`${profile.path}/players/${uid}`, client.token, {
      x: Number((200 + Math.sin(tick / 5) * 80 + client.number).toFixed(2)),
      z: Number((120 + tick * 9).toFixed(2)),
      angle: Number(((tick / 12) % 6.28).toFixed(4)),
      progress: tick * 25,
      lap: 1 + Math.floor(tick / 140),
      updatedAt: t
    });
    return;
  }

  if (profile.kind === 'position') {
    await patch(`${profile.path}/players/${uid}`, client.token, {
      x: Number((Math.sin(tick / 4 + client.number) * 850).toFixed(2)),
      y: 0,
      z: Number((Math.cos(tick / 5 + client.number) * 850).toFixed(2)),
      yaw: Number(((tick / 10) % 6.28).toFixed(4)),
      rotationY: Number(((tick / 10) % 6.28).toFixed(4)),
      crouching: tick % 17 === 0,
      updatedAt: t
    });
    return;
  }

  if (profile.kind === 'roundAnswer') {
    await patch(profile.path, client.token, {
      [`answers/${uid}`]: { n: (tick + client.number) % 21, updatedAt: t }
    });
    return;
  }

  if (profile.kind === 'attempts') {
    const guess = String((tick + client.number) % 6) +
      String((tick + client.number + 1) % 6) +
      String((tick + client.number + 2) % 6) +
      String((tick + client.number + 3) % 6);
    await patch(profile.path, client.token, {
      [`tries/${uid}/${tick}`]: { i: guess, e: tick % 2, d: tick % 3, updatedAt: t }
    });
    return;
  }

  if (profile.kind === 'cards') {
    await patch(profile.path, client.token, {
      [`cards/${uid}`]: { n: ((client.number + tick) % 52) + 1, fig: ['Corazones', 'Treboles', 'Diamantes', 'Picas'][tick % 4], answer: tick % 3 ? '' : 'Picas' }
    });
    return;
  }

  if (profile.kind === 'fastAnswer') {
    await patch(profile.path, client.token, {
      [`respuestas/${uid}`]: { ok: tick % 2 === 0, tiempo: t }
    });
  }
}

async function seedSafeRooms() {
  if (mode === 'live') return;

  const payload = {};
  payload['juegos/juego80'] = { estado: 'abierta', ronda: 1, objetivo: null, players: {}, answers: {} };
  payload['juegos/codigoMaestro'] = { estado: 'abierta', players: {}, tries: {}, puestos: [] };
  payload['juegos/cuatroFiguras'] = { estado: 'respuestas', ronda: 1, players: {}, cards: {}, requests: {} };
  payload['juegos/ganaElimina'] = { estado: 'abierta', players: {}, historial: [], respuestas: {}, proteccion: {}, pregunta: { id: 0 }, deadline: Date.now() + 120000, mensaje: '' };
  payload['carrerasLagunaSeca/simulacion60'] = { players: {}, game: { phase: 'running', cycle: 1, startAt: now() } };

  const auth = await anonymousAuth();
  await patch(basePath, auth.idToken, payload);
}

async function cleanupSafeRun() {
  if (mode === 'live') return;
  const auth = await anonymousAuth();
  await del(basePath, auth.idToken).catch(() => {});
}

async function finalReads() {
  const auth = await anonymousAuth();
  for (const profile of gameProfiles) {
    const start = performance.now();
    try {
      const data = await get(profile.path, auth.idToken);
      const elapsed = performance.now() - start;
      const players = Object.keys(data?.players || {}).length;
      console.log(`${profile.id.padEnd(14)} lectura final: ${players} jugadores, ${Math.round(elapsed)} ms`);
    } catch (error) {
      console.log(`${profile.id.padEnd(14)} lectura final fallo: ${error.message}`);
    }
  }
}

async function timed(game, action) {
  const start = performance.now();
  try {
    await action();
    const ms = performance.now() - start;
    metrics.ok += 1;
    metrics.latencies.push(ms);
    addMetric(metrics.byGame, game, 1);
  } catch (error) {
    metrics.fail += 1;
    addMetric(metrics.byStatus, error.status || error.name || 'ERROR', 1);
  }
}

async function anonymousAuth() {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response, data);
  return data;
}

async function createAuthPool(size) {
  const pool = [];
  for (let i = 0; i < size; i += 1) {
    pool.push(await anonymousAuth());
    await sleep(150);
  }
  return pool;
}

async function get(path, token) {
  return request('GET', path, token);
}

async function put(path, token, body) {
  return request('PUT', path, token, body);
}

async function patch(path, token, body) {
  return request('PATCH', path, token, body);
}

async function del(path, token) {
  return request('DELETE', path, token);
}

async function request(method, path, token, body) {
  const cleanPath = path.replace(/^\/+|\/+$/g, '');
  const url = `${firebaseConfig.databaseURL}/${cleanPath}.json?auth=${encodeURIComponent(token)}`;
  const start = performance.now();
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = httpError(response, data);
    error.latency = performance.now() - start;
    throw error;
  }
  return data;
}

function httpError(response, data) {
  const error = new Error(data?.error?.message || data?.error || response.statusText || 'HTTP error');
  error.status = response.status;
  return error;
}

function expandProfiles(profiles, total) {
  const expanded = [];
  let index = 0;
  while (expanded.length < total) {
    expanded.push(profiles[index % profiles.length]);
    index += 1;
  }
  return expanded;
}

function repeatEachProfile(profiles, count) {
  const expanded = [];
  for (const profile of profiles) {
    for (let i = 0; i < count; i += 1) expanded.push(profile);
  }
  return expanded;
}

function parseArgs(raw) {
  const out = {};
  for (let i = 0; i < raw.length; i += 1) {
    const arg = raw[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = raw[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function joinPath(...parts) {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

function addMetric(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function now() {
  return Date.now();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printHeader() {
  console.log('\nSimulacion de conexiones Firebase');
  console.log('----------------------------------');
  console.log(`Clientes virtuales : ${clients}`);
  if (perGame) console.log(`Clientes por juego : ${perGame}`);
  console.log(`Duracion           : ${durationSeconds}s`);
  console.log(`Frecuencia         : ${hz} escrituras/seg por cliente aprox.`);
  console.log(`Sesiones Auth      : ${authPoolSize}`);
  console.log(`Modo               : ${mode}`);
  console.log(`Ruta base          : ${basePath || '(rutas reales)'}\n`);
}

function printSummary() {
  const total = metrics.ok + metrics.fail;
  const avg = metrics.latencies.length
    ? metrics.latencies.reduce((sum, value) => sum + value, 0) / metrics.latencies.length
    : 0;

  console.log('\nResumen');
  console.log('-------');
  console.log(`Operaciones totales : ${total}`);
  console.log(`Exitosas            : ${metrics.ok}`);
  console.log(`Fallidas            : ${metrics.fail}`);
  console.log(`Latencia promedio   : ${Math.round(avg)} ms`);
  console.log(`p50 / p95 / p99     : ${Math.round(percentile(metrics.latencies, 50))} / ${Math.round(percentile(metrics.latencies, 95))} / ${Math.round(percentile(metrics.latencies, 99))} ms`);

  if (metrics.byStatus.size) {
    console.log('\nErrores por estado:');
    for (const [status, count] of metrics.byStatus) console.log(`  ${status}: ${count}`);
  }

  console.log('\nOperaciones por juego:');
  for (const [game, count] of metrics.byGame) console.log(`  ${game}: ${count}`);

  if (mode !== 'live') {
    console.log(`\nDatos de prueba escritos en: ${basePath}`);
    console.log('Puedes borrarlos desde Firebase Console o ejecutando otra prueba con el mismo --run para sobrescribirlos.');
  }
}
