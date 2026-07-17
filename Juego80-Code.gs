const MAX_RONDAS = 6;
const CLAVE_CONTROL = '136101521';

const AVATARES = [
  { nombre: 'Rayo', icono: '⚡', color: '#f59e0b' },
  { nombre: 'Fénix', icono: '🔥', color: '#ef4444' },
  { nombre: 'Tigre', icono: '🐯', color: '#f97316' },
  { nombre: 'Halcón', icono: '🦅', color: '#3b82f6' },
  { nombre: 'Lobo', icono: '🐺', color: '#64748b' },
  { nombre: 'Jaguar', icono: '🐆', color: '#a16207' },
  { nombre: 'Cometa', icono: '☄️', color: '#8b5cf6' },
  { nombre: 'Titán', icono: '🛡️', color: '#0f766e' },
  { nombre: 'Nébula', icono: '🌌', color: '#6366f1' },
  { nombre: 'Vector', icono: '🚀', color: '#06b6d4' }
];

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function prepararHojas() {
  const libro = SpreadsheetApp.getActive();
  const definiciones = {
    Sesiones: ['id', 'estado', 'ronda', 'maxRondas', 'objetivo', 'actualizado'],
    Jugadores: ['sesionId', 'playerId', 'nickname', 'avatarId', 'avatarNombre', 'victorias', 'creado'],
    Respuestas: ['sesionId', 'ronda', 'playerId', 'numero', 'ganador', 'creado']
  };

  Object.keys(definiciones).forEach(nombre => {
    let sh = libro.getSheetByName(nombre);
    if (!sh) sh = libro.insertSheet(nombre);
    if (sh.getLastRow() === 0) sh.appendRow(definiciones[nombre]);
  });
}

function hoja(nombre) {
  const sh = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!sh) throw new Error('No se encontró la pestaña ' + nombre + '.');
  return sh;
}

function valores(nombre) {
  const sh = hoja(nombre);
  return sh.getLastRow() < 2 ? [] : sh.getDataRange().getValues().slice(1);
}

function texto(valor) {
  return String(valor == null ? '' : valor).trim();
}

function limpiarDatos() {
  ['Sesiones', 'Jugadores', 'Respuestas'].forEach(nombre => {
    const sh = hoja(nombre);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  });
}

function crearSesion() {
  const id = 'J80-' + new Date().getTime();
  hoja('Sesiones').appendRow([id, 'inscripcion', 0, MAX_RONDAS, '', new Date()]);
  return { id: id, estado: 'inscripcion', ronda: 0, maxRondas: MAX_RONDAS, objetivo: null };
}

function sesionActual() {
  const filas = valores('Sesiones');
  if (!filas.length) return crearSesion();
  const f = filas[filas.length - 1];
  return { id: texto(f[0]), estado: texto(f[1]), ronda: Number(f[2]) || 0, maxRondas: Number(f[3]) || MAX_RONDAS, objetivo: f[4] === '' ? null : Number(f[4]) };
}

function actualizarSesion(sesion) {
  const sh = hoja('Sesiones');
  const fila = sh.getLastRow();
  sh.getRange(fila, 1, 1, 6).setValues([[sesion.id, sesion.estado, sesion.ronda, sesion.maxRondas, sesion.objetivo == null ? '' : sesion.objetivo, new Date()]]);
}

function jugadoresDe(sesionId) {
  return valores('Jugadores')
    .filter(f => texto(f[0]) === sesionId)
    .map(f => ({
      playerId: texto(f[1]), nickname: texto(f[2]), avatarId: Number(f[3]),
      avatarNombre: texto(f[4]), victorias: Number(f[5]) || 0
    }))
    .sort((a, b) => a.avatarId - b.avatarId);
}

function respuestasDe(sesionId, ronda) {
  return valores('Respuestas')
    .filter(f => texto(f[0]) === sesionId && Number(f[1]) === Number(ronda))
    .map(f => ({ playerId: texto(f[2]), numero: Number(f[3]), ganador: f[4] === true || f[4] === 'TRUE' }));
}

function estado() {
  prepararHojas();
  const sesion = sesionActual();
  const jugadores = jugadoresDe(sesion.id);
  const respuestas = respuestasDe(sesion.id, sesion.ronda);
  const mostrarNumeros = sesion.estado === 'cerrada' || sesion.estado === 'finalizada';
  const porJugador = {};
  respuestas.forEach(r => porJugador[r.playerId] = mostrarNumeros ? r : { playerId: r.playerId, enviado: true });

  return {
    error: false,
    sesion: sesion,
    jugadores: jugadores.map(j => ({ ...j, respuesta: porJugador[j.playerId] || null })),
    cantidadRespuestas: respuestas.length,
    capacidad: AVATARES.length
  };
}

function validarControl(req) {
  if (texto(req.clave) !== CLAVE_CONTROL) throw new Error('Clave de control incorrecta.');
}

function registrarJugador(req) {
  const sesion = sesionActual();
  if (sesion.estado !== 'inscripcion') throw new Error('La inscripción está cerrada.');
  const nickname = texto(req.nickname);
  if (nickname.length < 2 || nickname.length > 20) throw new Error('El nickname debe tener entre 2 y 20 caracteres.');
  const jugadores = jugadoresDe(sesion.id);
  if (jugadores.length >= AVATARES.length) throw new Error('La partida ya tiene 10 participantes.');
  if (jugadores.some(j => j.nickname.toLowerCase() === nickname.toLowerCase())) throw new Error('Ese nickname ya está en uso.');

  const avatarId = jugadores.length;
  const avatar = AVATARES[avatarId];
  const playerId = Utilities.getUuid();
  hoja('Jugadores').appendRow([sesion.id, playerId, nickname, avatarId, avatar.nombre, 0, new Date()]);
  return { error: false, jugador: { playerId, nickname, avatarId, avatarNombre: avatar.nombre, avatar } };
}

function abrirRonda(req) {
  validarControl(req);
  const sesion = sesionActual();
  if (sesion.estado === 'abierta') throw new Error('Ya hay una ronda abierta.');
  if (sesion.ronda >= MAX_RONDAS) throw new Error('Las seis rondas ya terminaron. Reinicia para una nueva partida.');
  if (jugadoresDe(sesion.id).length === 0) throw new Error('Primero deben inscribirse participantes.');
  sesion.ronda += 1;
  sesion.estado = 'abierta';
  sesion.objetivo = null;
  actualizarSesion(sesion);
  return estado();
}

function enviarNumero(req) {
  const sesion = sesionActual();
  if (sesion.estado !== 'abierta') throw new Error('No hay una ronda abierta para responder.');
  const playerId = texto(req.playerId);
  const numero = Number(req.numero);
  if (!Number.isInteger(numero) || numero < 0 || numero > 20) throw new Error('El número debe ser un entero entre 0 y 20.');
  if (!jugadoresDe(sesion.id).some(j => j.playerId === playerId)) throw new Error('Participante no válido.');
  if (respuestasDe(sesion.id, sesion.ronda).some(r => r.playerId === playerId)) throw new Error('Ya enviaste tu número en esta ronda.');
  hoja('Respuestas').appendRow([sesion.id, sesion.ronda, playerId, numero, false, new Date()]);
  return { error: false, mensaje: 'Respuesta registrada.' };
}

function cerrarRonda(req) {
  validarControl(req);
  const sesion = sesionActual();
  if (sesion.estado !== 'abierta') throw new Error('No hay una ronda abierta.');
  const respuestas = respuestasDe(sesion.id, sesion.ronda);
  if (!respuestas.length) throw new Error('Aún no hay respuestas para calificar.');

  const promedio = respuestas.reduce((s, r) => s + r.numero, 0) / respuestas.length;
  const objetivo = promedio * 0.8;
  const diferenciaMenor = Math.min(...respuestas.map(r => Math.abs(r.numero - objetivo)));
  const ganadores = respuestas.filter(r => Math.abs(r.numero - objetivo) === diferenciaMenor);
  const ganadoresIds = new Set(ganadores.map(r => r.playerId));

  const shRespuestas = hoja('Respuestas');
  const filas = valores('Respuestas');
  filas.forEach((f, indice) => {
    if (texto(f[0]) === sesion.id && Number(f[1]) === sesion.ronda) {
      shRespuestas.getRange(indice + 2, 5).setValue(ganadoresIds.has(texto(f[2])));
    }
  });

  const shJugadores = hoja('Jugadores');
  valores('Jugadores').forEach((f, indice) => {
    if (texto(f[0]) === sesion.id && ganadoresIds.has(texto(f[1]))) {
      shJugadores.getRange(indice + 2, 6).setValue((Number(f[5]) || 0) + 1);
    }
  });

  sesion.estado = sesion.ronda >= MAX_RONDAS ? 'finalizada' : 'cerrada';
  sesion.objetivo = objetivo;
  actualizarSesion(sesion);
  return estado();
}

function reiniciar(req) {
  validarControl(req);
  limpiarDatos();
  const sesion = crearSesion();
  return { error: false, mensaje: 'Partida reiniciada.', sesion: sesion };
}

function doGet(e) {
  try {
    if (texto(e.parameter.accion) === 'estado') return json(estado());
    return json({ error: true, mensaje: 'Acción no reconocida.' });
  } catch (err) {
    return json({ error: true, mensaje: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let adquirido = false;
  try {
    const req = JSON.parse(e.postData.contents);
    prepararHojas();
    lock.waitLock(10000);
    adquirido = true;
    let respuesta;
    switch (texto(req.accion)) {
      case 'registrarJugador': respuesta = registrarJugador(req); break;
      case 'abrirRonda': respuesta = abrirRonda(req); break;
      case 'enviarNumero': respuesta = enviarNumero(req); break;
      case 'cerrarRonda': respuesta = cerrarRonda(req); break;
      case 'reiniciar': respuesta = reiniciar(req); break;
      default: throw new Error('Acción no reconocida.');
    }
    SpreadsheetApp.flush();
    return json(respuesta);
  } catch (err) {
    return json({ error: true, mensaje: String(err.message || err) });
  } finally {
    if (adquirido) lock.releaseLock();
  }
}
