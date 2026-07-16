const HOJA_NOMBRE = "Estudiantes";
const JUEZ_USUARIO = "Juez";
const JUEZ_CONTRASENA = "136101521";

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

function nombreEstudiante(fila) {
  return [texto(fila[4]), texto(fila[2])].filter(Boolean).join(' ');
}

function datosEstudiante(fila) {
  return {
    curso: texto(fila[1]),
    nombre: nombreEstudiante(fila),
    juegos: {
      juego1: numero(fila[6]), juego2: numero(fila[7]),
      juego3: numero(fila[8]), juego4: numero(fila[9]),
      juego5: numero(fila[10]), juego6: numero(fila[11]),
      juego7: numero(fila[12]), juego8: numero(fila[13]),
      penalizacion: numero(fila[14]), total: numero(fila[15])
    }
  };
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
    return json({ error: true, mensaje: 'Estudiante no encontrado' });
  } catch (err) {
    return json({ error: true, mensaje: String(err) });
  }
}

function esJuez(req) {
  return texto(req.usuario) === JUEZ_USUARIO && texto(req.contrasena) === JUEZ_CONTRASENA;
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
  if (!Number.isInteger(juego) || juego < 1 || juego > 9) {
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
      const columna = juego <= 8 ? 6 + juego : 15;
      const valor = numero(datos[i][columna - 1]) + (juego <= 8 ? 1 : -1);
      sh.getRange(fila, columna).setValue(valor);
      SpreadsheetApp.flush();

      return json({
        error: false,
        estudiante: nombreEstudiante(datos[i]),
        curso: texto(datos[i][1]),
        juego: juego,
        puntajeJuego: valor,
        total: sh.getRange(fila, 16).getValue()
      });
    }
    return json({ error: true, mensaje: 'No existe el estudiante.' });
  } catch (err) {
    return json({ error: true, mensaje: String(err) });
  } finally {
    if (bloqueoAdquirido) lock.releaseLock();
  }
}
