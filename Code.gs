const HOJA_NOMBRE = "Estudiantes";
const JUEZ_USUARIO = "Juez";
const JUEZ_CONTRASENA_PROPIEDAD = "JUEZ_CONTRASENA";
const TOTAL_JUEGOS_PUNTUABLES = 10;
const TOTAL_RESERVAS = 30;
const PRIMERA_COLUMNA_JUEGO = 7;
const COLUMNA_PENALIZACION = PRIMERA_COLUMNA_JUEGO + TOTAL_JUEGOS_PUNTUABLES;
const COLUMNA_TOTAL = COLUMNA_PENALIZACION + 1;

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function hoja() {
  const sh = SpreadsheetApp.getActive().getSheetByName(HOJA_NOMBRE);
  if (!sh) throw new Error('No existe la hoja "' + HOJA_NOMBRE + '".');
  return sh;
}

function texto(valor) {
  return String(valor == null ? '' : valor).trim();
}

function numero(valor) {
  return Number(valor) || 0;
}

function contrasenaJuez() {
  return PropertiesService.getScriptProperties().getProperty(JUEZ_CONTRASENA_PROPIEDAD) || '';
}

function nombreEstudiante(fila) {
  return [texto(fila[4]), texto(fila[2])].filter(Boolean).join(' ');
}

function datosEstudiante(fila) {
  return {
    curso: texto(fila[1]),
    nombre: nombreEstudiante(fila),
    juegos: (() => {
      const juegos = {};
      for (let i = 1; i <= TOTAL_JUEGOS_PUNTUABLES; i++) {
        juegos['juego' + i] = numero(fila[PRIMERA_COLUMNA_JUEGO - 2 + i]);
      }
      juegos.penalizacion = numero(fila[COLUMNA_PENALIZACION - 1]);
      juegos.total = numero(fila[COLUMNA_TOTAL - 1]);
      return juegos;
    })()
  };
}

function numeroReserva(id) {
  const m = /^RESERVA-(\d{2})$/.exec(texto(id));
  if (!m) return 0;
  const n = Number(m[1]);
  return n >= 1 && n <= TOTAL_RESERVAS ? n : 0;
}

function datosReserva(id) {
  const n = numeroReserva(id);
  if (!n) return null;
  const juegos = {};
  for (let i = 1; i <= TOTAL_JUEGOS_PUNTUABLES; i++) juegos['juego' + i] = 0;
  juegos.penalizacion = 0;
  juegos.total = 0;
  return {
    id: texto(id),
    curso: 'Por asignar',
    nombre: 'Reserva ' + n,
    juegos: juegos
  };
}

function crearFilaReserva(sh, id) {
  const reserva = datosReserva(id);
  if (!reserva) return null;

  const fila = sh.getLastRow() + 1;
  const valores = new Array(COLUMNA_TOTAL).fill('');
  valores[0] = reserva.id;
  valores[1] = reserva.curso;
  valores[2] = reserva.nombre;
  for (let col = PRIMERA_COLUMNA_JUEGO; col <= COLUMNA_PENALIZACION; col++) {
    valores[col - 1] = 0;
  }
  sh.getRange(fila, 1, 1, COLUMNA_TOTAL).setValues([valores]);
  sh.getRange(fila, COLUMNA_TOTAL).setFormula(`=SUM(G${fila}:Q${fila})`);
  SpreadsheetApp.flush();

  return fila;
}

function doGet(e) {
  try {
    const accion = texto(e.parameter.accion);
    const datos = hoja().getDataRange().getValues();

    if (accion === 'ranking') {
      const ranking = [];
      for (let i = 1; i < datos.length; i++) {
        if (!texto(datos[i][0])) continue;
        const estudiante = datosEstudiante(datos[i]);
        ranking.push({
          nombre: estudiante.nombre,
          curso: estudiante.curso,
          juegos: estudiante.juegos
        });
      }
      ranking.sort((a, b) => b.juegos.total - a.juegos.total || a.nombre.localeCompare(b.nombre));
      return json({ error: false, ranking: ranking });
    }

    const id = texto(e.parameter.id);
    if (!id) return json({ error: true, mensaje: 'Falta id' });

    for (let i = 1; i < datos.length; i++) {
      if (texto(datos[i][0]) === id) {
        return json({ error: false, estudiante: { id: datos[i][0], ...datosEstudiante(datos[i]) } });
      }
    }
    const reserva = datosReserva(id);
    if (reserva) return json({ error: false, estudiante: reserva });
    return json({ error: true, mensaje: 'Estudiante no encontrado' });
  } catch (err) {
    return json({ error: true, mensaje: String(err) });
  }
}

function esJuez(req) {
  return texto(req.usuario) === JUEZ_USUARIO && texto(req.contrasena) === contrasenaJuez();
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ error: true, mensaje: 'Solicitud inválida.' });
  }

  if (req.accion === 'login') {
    return esJuez(req)
      ? json({ error: false, mensaje: 'Acceso autorizado.' })
      : json({ error: true, mensaje: 'Usuario o contraseña incorrectos.' });
  }

  if (req.accion !== 'registrar') {
    return json({ error: true, mensaje: 'Acción no reconocida.' });
  }
  if (!esJuez(req)) return json({ error: true, mensaje: 'Sesión de juez no autorizada.' });

  const id = texto(req.id);
  const juego = Number(req.juego);
  if (!id) return json({ error: true, mensaje: 'Falta el ID del estudiante.' });
  if (!Number.isInteger(juego) || juego < 1 || juego > TOTAL_JUEGOS_PUNTUABLES + 1) {
    return json({ error: true, mensaje: 'Juego inválido.' });
  }

  const lock = LockService.getScriptLock();
  let bloqueoAdquirido = false;
  try {
    lock.waitLock(10000);
    bloqueoAdquirido = true;
    const sh = hoja();
    const datos = sh.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (texto(datos[i][0]) !== id) continue;

      const fila = i + 1;
      const columna = juego <= TOTAL_JUEGOS_PUNTUABLES ? PRIMERA_COLUMNA_JUEGO + juego - 1 : COLUMNA_PENALIZACION;
      const valor = numero(datos[i][columna - 1]) + (juego <= TOTAL_JUEGOS_PUNTUABLES ? 1 : -1);
      sh.getRange(fila, columna).setValue(valor);
      SpreadsheetApp.flush();

      return json({
        error: false,
        estudiante: nombreEstudiante(datos[i]),
        curso: texto(datos[i][1]),
        juego: juego,
        puntajeJuego: valor,
        total: sh.getRange(fila, COLUMNA_TOTAL).getValue()
      });
    }
    const filaReserva = crearFilaReserva(sh, id);
    if (filaReserva) {
      const columna = juego <= TOTAL_JUEGOS_PUNTUABLES ? PRIMERA_COLUMNA_JUEGO + juego - 1 : COLUMNA_PENALIZACION;
      const valor = juego <= TOTAL_JUEGOS_PUNTUABLES ? 1 : -1;
      sh.getRange(filaReserva, columna).setValue(valor);
      SpreadsheetApp.flush();

      return json({
        error: false,
        estudiante: 'Reserva ' + numeroReserva(id),
        curso: 'Por asignar',
        juego: juego,
        puntajeJuego: valor,
        total: sh.getRange(filaReserva, COLUMNA_TOTAL).getValue()
      });
    }
    return json({ error: true, mensaje: 'No existe el estudiante.' });
  } catch (err) {
    return json({ error: true, mensaje: String(err) });
  } finally {
    if (bloqueoAdquirido) lock.releaseLock();
  }
}
