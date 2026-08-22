# Pruebas de conexion para el dia del colegio

Este proyecto usa Firebase Realtime Database. Para probar si aguanta muchos equipos al tiempo no necesitas 60 computadores: puedes lanzar clientes virtuales desde un solo PC.

## Que prueba hace

El script `simular-60-firebase.mjs` crea usuarios anonimos reales contra Firebase y simula actividad en cinco juegos. Paintball queda por fuera de esta prueba:

- Juego del 80%
- Codigo Maestro
- Cuatro Figuras
- Gana y elimina
- Carrera Laguna Seca

Por seguridad, el modo normal escribe en `stressTests/<fecha>/...`, no en las partidas reales.

## Comando recomendado: 30 por juego

Desde esta carpeta del proyecto:

```powershell
cd "C:\Users\mgo17\Documents\Codex\2026-07-21\es\diadelcolegio"
& "C:\Users\mgo17\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" ".\herramientas\simular-60-firebase.mjs" --per-game 30 --seconds 60 --hz 2 --auth-pool 8
```

Esto simula 150 jugadores durante 60 segundos: 30 por cada juego, con unas 2 escrituras por segundo por jugador.

## Prueba mas fuerte

```powershell
& "C:\Users\mgo17\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" ".\herramientas\simular-60-firebase.mjs" --per-game 40 --seconds 90 --hz 3 --auth-pool 8
```

Si esta pasa bien, la conexion de Firebase probablemente no sera el problema principal. Lo que habria que revisar despues seria el rendimiento grafico de cada computador, especialmente Carrera.

## Si aparece TOO_MANY_ATTEMPTS_TRY_LATER

Eso viene de Firebase Auth, no de Realtime Database. Significa que se intentaron crear demasiadas sesiones anonimas al mismo tiempo.

Recomendacion para el evento:

- Abrir primero las paginas de los juegos en los computadores.
- Dar 1 o 2 minutos para que todos entren antes de iniciar.
- Evitar que 150 estudiantes presionen "Entrar" exactamente en el mismo segundo.
- Si sale ese error en una prueba, esperar unos minutos y repetir con `--auth-pool 3` o `--auth-pool 1`.

## Como leer el resultado

Al final veras:

- `Exitosas`: operaciones que Firebase acepto.
- `Fallidas`: errores de conexion, permisos o cuota.
- `Latencia promedio`: tiempo medio por escritura.
- `p95`: si esta por debajo de 800 ms, va bastante bien para juegos escolares.
- `p99`: si se dispara mucho, hubo momentos de congestion.

## Importante

No uses `--mode live` durante una partida real. Ese modo escribe en rutas reales de los juegos y puede ensuciar salas activas.

El modo seguro, sin `--mode live`, es el que debes usar normalmente.
