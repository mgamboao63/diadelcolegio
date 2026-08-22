# Informe de revision de juegos sin Paintball

Fecha de revision: 2026-08-22

Juegos revisados:

- Juego del 80%
- Codigo Maestro
- Las Cuatro Figuras
- Gana y elimina
- Carrera Laguna Seca multijugador

Paintball queda por fuera por decision del proyecto.

## Hallazgos

### Capacidad de inscripcion

- Juego del 80%: limite actual de 40 jugadores.
- Codigo Maestro: limite actual de 40 jugadores.
- Las Cuatro Figuras: limite actual de 40 jugadores.
- Gana y elimina: limite actual de 40 jugadores.
- Carrera Laguna Seca: estaba limitada a 10 cupos. Se aumento a 40 cupos.

### Nickname y sesiones

- Juego del 80%, Cuatro Figuras, Gana y elimina y Carrera usan un identificador de sesion adicional. Esto ayuda cuando se hacen pruebas con varias ventanas o sesiones.
- Codigo Maestro usaba solo el `uid` anonimo de Firebase. Se ajusto para usar tambien identificador de sesion.
- Los juegos bloquean nicknames repetidos dentro de la misma partida.

### Sincronizacion grafica

- Los cuatro juegos de tablero usan `onValue` sobre la sala completa del juego. Para 30 jugadores por juego es razonable porque los datos son pequenos.
- Carrera escucha la sala completa, pero publica movimiento por jugador en su propia ruta. Esto es correcto para evitar que cada movimiento bloquee toda la sala.
- Carrera es el juego con mayor riesgo grafico porque renderiza 3D y puede mostrar muchos carros remotos. Firebase no parece ser el primer cuello de botella; el riesgo mayor esta en equipos lentos o navegadores saturados.

### Riesgo encontrado

Firebase Auth puede bloquear si se crean demasiados inicios anonimos en el mismo segundo. En la prueba fuerte aparecio:

```text
TOO_MANY_ATTEMPTS_TRY_LATER
```

Eso no significa que Realtime Database no aguante; significa que Firebase Auth detecto demasiados intentos anonimos simultaneos.

Recomendacion para el evento:

- Abrir los juegos antes de iniciar la competencia.
- Dar 1 o 2 minutos para que los estudiantes entren y escriban nickname.
- No pedir que todos presionen "Entrar" exactamente al mismo tiempo.
- Si una sala se bloquea por Auth, esperar unos minutos y reintentar.

## Pruebas realizadas

Prueba previa con 60 clientes repartidos entre juegos:

```text
Operaciones totales : 2067
Exitosas            : 2067
Fallidas            : 0
Latencia promedio   : 155 ms
p50 / p95 / p99     : 126 / 366 / 966 ms
```

Prueba fuerte intentada:

```text
150 clientes virtuales
30 por juego
5 juegos sin Paintball
Resultado: bloqueada por Firebase Auth con TOO_MANY_ATTEMPTS_TRY_LATER
```

## Cambios aplicados

- `carrera-laguna-seca-multijugador.html`: cupos subidos de 10 a 40.
- `codigo-maestro-firebase.html`: identificador de jugador ajustado para soportar sesiones multiples.
- `herramientas/simular-60-firebase.mjs`: actualizado para probar cinco juegos sin Paintball y soportar `--per-game`.
- `herramientas/ejecutar-prueba-60.bat`: actualizado para correr 30 por juego.
- `herramientas/PRUEBAS-CONEXION.md`: guia actualizada.

## Conclusion

Con la informacion actual, los juegos de tablero se ven aptos para 30 jugadores por juego. Carrera ya no queda limitada a 10, pero conviene probarla en computadores reales por rendimiento grafico.

La accion mas importante para el evento es escalonar el ingreso: primero que todos abran pagina y registren nickname, luego el juez inicia cada juego.
