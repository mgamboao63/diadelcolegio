const CLAVE_CONTROL = '136101521';
const MAX_EQUIPOS = 10;
const MAX_GANADORES = 3;
const AVATARES = ['Rayo','Fénix','Tigre','Halcón','Lobo','Jaguar','Cometa','Titán','Nébula','Vector'];

function json(d){ return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON); }
function t(v){ return String(v == null ? '' : v).trim(); }
function sh(n){ const h=SpreadsheetApp.getActive().getSheetByName(n); if(!h) throw Error('Falta la pestaña '+n); return h; }
function filas(n){ const h=sh(n); return h.getLastRow()<2?[]:h.getDataRange().getValues().slice(1); }
function preparar(){
  const defs={Sesiones:['id','estado','ganadores','actualizado'],Equipos:['sesionId','equipoId','nombre','avatarId','avatarNombre','codigo','intentos','puesto','creado'],Intentos:['sesionId','equipoId','intento','exactos','desordenados','fecha']};
  const libro=SpreadsheetApp.getActive();
  Object.keys(defs).forEach(n=>{let h=libro.getSheetByName(n);if(!h)h=libro.insertSheet(n);if(h.getLastRow()===0)h.appendRow(defs[n]);});
}
function crearSesion(){ const s={id:'CM-'+Date.now(),estado:'inscripcion',ganadores:[]};sh('Sesiones').appendRow([s.id,s.estado,'[]',new Date()]);return s; }
function sesion(){ const f=filas('Sesiones');if(!f.length)return crearSesion();const x=f[f.length-1];let g=[];try{g=JSON.parse(t(x[2])||'[]')}catch(e){}return{id:t(x[0]),estado:t(x[1]),ganadores:g}; }
function guardarSesion(s){ const h=sh('Sesiones');h.getRange(h.getLastRow(),1,1,4).setValues([[s.id,s.estado,JSON.stringify(s.ganadores),new Date()]]); }
function equipos(sid){return filas('Equipos').filter(x=>t(x[0])===sid).map(x=>({equipoId:t(x[1]),nombre:t(x[2]),avatarId:Number(x[3]),avatarNombre:t(x[4]),intentos:Number(x[6])||0,puesto:Number(x[7])||0})).sort((a,b)=>a.avatarId-b.avatarId);}
function misIntentos(sid,eid){return filas('Intentos').filter(x=>t(x[0])===sid&&t(x[1])===eid).map(x=>({codigo:t(x[2]),exactos:Number(x[3]),desordenados:Number(x[4])}));}
function estado(equipoId){preparar();const s=sesion(), es=equipos(s.id);return{error:false,sesion:s,equipos:es,capacidad:MAX_EQUIPOS,misIntentos:equipoId?misIntentos(s.id,equipoId):[]};}
function clave(req){if(t(req.clave)!==CLAVE_CONTROL)throw Error('Clave de control incorrecta.');}
function codigo(){let a=[];while(a.length<4){const n=Math.floor(Math.random()*10).toString();if(!a.includes(n))a.push(n);}return a.join('');}
function registrar(req){const s=sesion();if(s.estado!=='inscripcion')throw Error('La inscripción está cerrada.');const nombre=t(req.nombre);if(nombre.length<2||nombre.length>24)throw Error('El nombre debe tener entre 2 y 24 caracteres.');const es=equipos(s.id);if(es.length>=MAX_EQUIPOS)throw Error('Ya hay 10 equipos.');if(es.some(x=>x.nombre.toLowerCase()===nombre.toLowerCase()))throw Error('Ese nombre ya está en uso.');const id=Utilities.getUuid(), av=es.length;sh('Equipos').appendRow([s.id,id,nombre,av,AVATARES[av],codigo(),0,'',new Date()]);return{error:false,equipoId:id};}
function abrir(req){clave(req);const s=sesion();if(s.estado==='abierta')throw Error('El juego ya está abierto.');if(s.estado==='finalizada')throw Error('La partida terminó. Reinicia para una nueva.');if(!equipos(s.id).length)throw Error('Primero debe inscribirse al menos un equipo.');s.estado='abierta';guardarSesion(s);return estado();}
function pista(secreto,intento){let exactos=0,desordenados=0;for(let i=0;i<4;i++){if(secreto[i]===intento[i])exactos++;else if(secreto.includes(intento[i]))desordenados++;}return{exactos,desordenados};}
function intentar(req){const s=sesion();if(s.estado!=='abierta')throw Error('El juego no está abierto.');const eid=t(req.equipoId), intento=t(req.codigo);if(!/^\d{4}$/.test(intento)||new Set(intento).size!==4)throw Error('Escribe cuatro dígitos distintos.');const es=equipos(s.id), equipo=es.find(x=>x.equipoId===eid);if(!equipo)throw Error('Equipo no válido.');if(equipo.puesto)throw Error('Tu equipo ya descubrió el código.');const fila=filas('Equipos').findIndex(x=>t(x[0])===s.id&&t(x[1])===eid);const secreto=t(filas('Equipos')[fila][5]);const p=pista(secreto,intento), numero=equipo.intentos+1;sh('Intentos').appendRow([s.id,eid,intento,p.exactos,p.desordenados,new Date()]);sh('Equipos').getRange(fila+2,7).setValue(numero);
  if(p.exactos===4){const puesto=s.ganadores.length+1;s.ganadores.push(eid);sh('Equipos').getRange(fila+2,8).setValue(puesto);if(s.ganadores.length>=MAX_GANADORES)s.estado='finalizada';guardarSesion(s);p.puesto=puesto;p.finalizado=s.estado==='finalizada';}return{error:false,pista:p};}
function reiniciar(req){clave(req);['Sesiones','Equipos','Intentos'].forEach(n=>{const h=sh(n);if(h.getLastRow()>1)h.getRange(2,1,h.getLastRow()-1,h.getLastColumn()).clearContent();});return{error:false,sesion:crearSesion()};}
function doGet(e){try{if(t(e.parameter.accion)==='estado')return json(estado(t(e.parameter.equipoId)));return json({error:true,mensaje:'Acción no reconocida.'});}catch(err){return json({error:true,mensaje:String(err.message||err)});}}
function doPost(e){const lock=LockService.getScriptLock();let ok=false;try{const r=JSON.parse(e.postData.contents);preparar();lock.waitLock(10000);ok=true;let out;switch(t(r.accion)){case'registrar':out=registrar(r);break;case'abrir':out=abrir(r);break;case'intentar':out=intentar(r);break;case'reiniciar':out=reiniciar(r);break;default:throw Error('Acción no reconocida.');}SpreadsheetApp.flush();return json(out);}catch(err){return json({error:true,mensaje:String(err.message||err)});}finally{if(ok)lock.releaseLock();}}
