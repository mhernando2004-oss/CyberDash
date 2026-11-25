// CYBER DASH 3D · versión alpha del juego
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Ajustes
const VELOCIDAD = 10;  // metros por segundo
const GRAVEDAD = 70;
const SALTO = 19;      // fuerza del salto

// Escena, cámara, luces
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
const luz = new THREE.DirectionalLight(0xffffff, 2);
luz.position.set(-5, 10, 5);
scene.add(luz);

// Niveles: cada uno con su pista, su música, su color de fondo y el color de sus gemas
const NIVELES = [
  { pista: 'modelos/pista.glb',  musica: 'musica/nivel1.mp3', cancion: 'Madame', fondo: 0x111111, colorGema: null },      // 1. Ciudad Neón
];
let nivel = 0;   // el nivel que se juega (0 = nivel 1, 1 = nivel 2)
// Cosas del nivel actual (se cambian en elegirNivel)
let bloques = [], pinchos = [], plataformas = [], lasers = [], gemas = [], meta;
let cubo;
const giro = new THREE.Group();
let angulo = 0;   // giro del cubo en el aire (solo se ve, no cambia la caja de choque)

// ---------- MODO DÚO (dos jugadores en el mismo teclado, pantalla dividida, solo nivel 1) ----------
let modo = 'historia';        // 'historia' o 'duo' (se elige en la barra de arriba)
let partidaDuo = false;       // true mientras dura una partida en dúo
let jugadorActual = null;     // el jugador que se está moviendo en este momento
const giro2 = new THREE.Group();   // el cubo del jugador 2
const jugadores = [
  { nombre: 'J1', giro: giro,  camara: new THREE.PerspectiveCamera(60, 1, 0.1, 500) },
  { nombre: 'J2', giro: giro2, camara: new THREE.PerspectiveCamera(60, 1, 0.1, 500) },
];
let x = 0, y = 0, vy = 0;          // posición y velocidad del cubo
let enSuelo = true, saltar = false, jugando = false, numGemas = 0;
let tiempoAire = 0;   // tiempo desde que dejaste de pisar suelo (tiempo de coyote)
let bufferSalto = 0;  // si pulsas justo antes de aterrizar, el salto se guarda un momento
let tiempo = 0;       // segundos desde que empezó el intento (mueve los láseres)
const texto = document.getElementById('texto');

// Cargar el cubo (y la gema) y después las pistas de todos los niveles
const loader = new GLTFLoader();
loader.load('modelos/cubo.glb', (gltf2) => {
  const gema = gltf2.scene.getObjectByName('Cilindro001');
  gema.removeFromParent();
  gema.geometry.center();
  gema.scale.setScalar(0.12);

  cubo = gltf2.scene;
  cubo.scale.setScalar(0.5); // el cubo del Blender mide 2, lo dejamos en 1
  // El cubo va dentro de un grupo para que gire sobre su centro
  scene.add(giro);
  giro.add(cubo);
  cubo.position.sub(new THREE.Box3().setFromObject(cubo).getCenter(new THREE.Vector3()));   // centro del cubo = centro del giro

  // Jugador 2 (modo dúo): una copia del cubo, en rosa
  const cubo2 = cubo.clone();
  cubo2.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (o.material.color.b > o.material.color.r + 0.1) o.material.color.set(0xff2bd6);            // la parte azul -> rosa
    if (o.material.emissive.b > o.material.emissive.r + 0.05) o.material.emissive.set(0xff2bd6).multiplyScalar(0.5);
  });
  giro2.add(cubo2);
  scene.add(giro2);
  giro2.visible = false;

  let cargados = 0;
  NIVELES.forEach((datos) => {
    loader.load(datos.pista, (gltf) => {
      prepararPista(datos, gltf.scene, gema);
      cargados++;
      if (cargados === NIVELES.length) listo();
    }, undefined, () => error(datos.pista));
  });
}, undefined, () => error('modelos/cubo.glb'));

// Lee los objetos de una pista por su nombre de Blender
function prepararPista(datos, pista, gema) {
  scene.add(pista);
  pista.visible = false;       // solo se ve la pista del nivel que juegas
  datos.escena = pista;
  datos.bloques = []; datos.pinchos = []; datos.plataformas = []; datos.lasers = []; datos.gemas = [];
  const pinchosSuelo = [];     // solo tus pinchos del suelo (los que llevan gema encima)
  const puntosGema = [];       // posiciones de las gemas puestas a mano en Blender (objetos "Gema")
  pista.traverse((obj) => {
    if (obj.name.startsWith('Gema')) puntosGema.push(obj.getWorldPosition(new THREE.Vector3()));
    if (!obj.isMesh) return; // los colores vienen de los materiales de Blender
    const caja = new THREE.Box3().setFromObject(obj);
    if (obj.name.startsWith('Bloque')) datos.bloques.push(caja);
    if (obj.name.startsWith('Plataforma')) datos.plataformas.push(caja);
    if (obj.name.startsWith('Pincho')) datos.pinchos.push(caja.clone().expandByVector(new THREE.Vector3(-0.5, -0.35, 0))); // un poco más pequeña
    if (obj.name.startsWith('Pincho') && !obj.name.includes('_')) pinchosSuelo.push(caja);  // Pincho_cielo, Pincho_foso... no
    if (obj.name.startsWith('Laser')) datos.lasers.push({ obj: obj, y0: obj.position.y });  // Laser, LaserMovil, LaserIntermitente
    if (obj.name === 'Meta') datos.meta = caja;
  });

  // La gema de este nivel, con su color (en el nivel 2 son rojas)
  let modelo = gema;
  if (datos.colorGema) {
    modelo = gema.clone();
    modelo.material = gema.material.clone();
    modelo.material.color.set(datos.colorGema);
    modelo.material.emissive.set(datos.colorGema).multiplyScalar(0.3);
  }
  const ponerGema = (px, py, pz) => {
    const g = modelo.clone();
    g.position.set(px, py, pz);
    pista.add(g);
    datos.gemas.push(g);
  };
  // Una gema encima del centro de cada grupo de pinchos (justo donde pasas al saltarlos)
  const centros = pinchosSuelo.map((p) => (p.min.x + p.max.x) / 2).sort((a, b) => a - b);
  let grupo = [];
  centros.forEach((c, i) => {
    grupo.push(c);
    if (i === centros.length - 1 || centros[i + 1] - c > 3) {  // se acaba el grupo
      ponerGema((grupo[0] + c) / 2, 2.8, 0);
      grupo = [];
    }
  });
  // Y las gemas que has colocado tú en Blender
  for (const punto of puntosGema) ponerGema(punto.x, punto.y, punto.z);
}

// Cambia al nivel n: enseña su pista y usa sus bloques, pinchos, láseres...
function elegirNivel(n) {
  nivel = n;
  const datos = NIVELES[n];
  NIVELES.forEach((d, i) => { d.escena.visible = (i === n); });
  bloques = datos.bloques; pinchos = datos.pinchos; plataformas = datos.plataformas;
  lasers = datos.lasers; gemas = datos.gemas; meta = datos.meta;
  scene.background.set(datos.fondo);
  document.body.classList.toggle('nivel-2', n === 1);   // en el nivel 2 el contador de gemas se pone rojo
  if (!musica.src.endsWith(datos.musica)) musica.src = datos.musica;
  $('rp-titulo').textContent = datos.cancion;
  pintarRecord();
}

// Láseres: los móviles suben y bajan, los intermitentes se encienden y se apagan.
// Sus datos (amplitud, periodo, desfase) son propiedades personalizadas del objeto en Blender
function moverLaseres() {
  for (const l of lasers) {
    const d = l.obj.userData;
    if (l.obj.name.startsWith('LaserMovil')) {
      l.obj.position.y = l.y0 + d.amplitud * (0.5 - 0.5 * Math.cos(2 * Math.PI * (tiempo + d.desfase) / d.periodo));
    }
    if (l.obj.name.startsWith('LaserIntermitente')) {
      l.obj.visible = (tiempo + d.desfase) % d.periodo < d.periodo / 2;   // encendido la mitad del tiempo
    }
  }
}

// Si falta un modelo, lo decimos en pantalla
function error(archivo) {
  texto.textContent = 'ERROR: no se encuentra ' + archivo + ' (revisa la carpeta modelos)';
}

// =================== MENÚ PRINCIPAL ===================
// (todos los elementos están en juego.html)
const $ = (id) => document.getElementById(id);   // atajo para no escribir tanto
const menu = $('menu');
const video = $('menu-video');
let preparado = false;   // true cuando los modelos han cargado

// ---------- Guardar y leer datos en el navegador (localStorage) ----------
function leer(clave, porDefecto) {
  try { return JSON.parse(localStorage.getItem(clave)) ?? porDefecto; } catch (e) { return porDefecto; }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {}
}
// Un récord por nivel (el del nivel 1 se sigue llamando como antes)
const claveRecord = (n) => (n === 0 ? 'cyberdash-record' : 'cyberdash-record-' + (n + 1));
const records = NIVELES.map((d, n) => leer(claveRecord(n), 0));
let ajustes = leer('cyberdash-ajustes', { fov: 60, verGemas: true, fondoAnimado: true });
let perfil = leer('cyberdash-perfil', null);    // null = Invitado
if (ajustes.volumen === undefined) ajustes.volumen = 60;   // los ajustes guardados de antes no tenían volumen

// ---------- MÚSICA (cada nivel pone la suya en elegirNivel) ----------
const musica = new Audio();
musica.loop = true;              // si la canción se acaba, vuelve a empezar

// ---------- MÚSICA estilo osu!: suena en el menú y el centro late con el bajo ----------
let analizador = null, frecuencias = null;
let pausadaPorTi = false;        // si la pausas con el botón del reproductor, no vuelve a sonar sola
function prepararAudio() {
  // El analizador "escucha" la canción y nos dice lo fuerte que suena cada frecuencia (graves, agudos...)
  if (analizador) return;
  const ctx = new AudioContext();
  const fuente = ctx.createMediaElementSource(musica);
  analizador = ctx.createAnalyser();
  analizador.fftSize = 256;                      // 128 frecuencias
  fuente.connect(analizador);
  analizador.connect(ctx.destination);           // y de ahí a los altavoces
  frecuencias = new Uint8Array(analizador.frequencyBinCount);
}
// El navegador no deja sonar nada hasta el primer clic o tecla: en ese momento arranca la música del menú
function primerToque() {
  prepararAudio();
  if (!menu.hidden && !pausadaPorTi) musica.play().catch(() => {});
}
addEventListener('pointerdown', primerToque, { once: true });
addEventListener('keydown', primerToque, { once: true });

$('rp-play').addEventListener('click', () => {
  prepararAudio();
  if (musica.paused) { musica.play().catch(() => {}); pausadaPorTi = false; }
  else { musica.pause(); pausadaPorTi = true; }
});

const lienzo = $('visualizador');
const pincel = lienzo.getContext('2d');
pincel.scale(2, 2);                              // el lienzo es el doble de grande para que se vea nítido
// Cambia el texto solo si es distinto (escribir en la página en cada fotograma la hace ir más lenta)
function escribir(elemento, texto) {
  if (elemento.textContent !== String(texto)) elemento.textContent = texto;
}
function dibujarMusica() {
  escribir($('rp-play'), musica.paused ? '▶' : '❚❚');
  $('rp-progreso').style.transform = 'scaleX(' + (musica.currentTime / musica.duration || 0) + ')';
  pincel.clearRect(0, 0, 460, 460);
  const nucleo = $('btn-nucleo');
  if (!analizador || musica.paused) { nucleo.style.setProperty('--pulso', 1); return; }
  analizador.getByteFrequencyData(frecuencias);

  // Graves (las primeras frecuencias): el centro crece cuando suena el bajo
  let grave = 0;
  for (let i = 0; i < 8; i++) grave += frecuencias[i];
  grave = grave / (8 * 255);                     // de 0 a 1
  nucleo.style.setProperty('--pulso', (1 + grave * grave * 0.12).toFixed(3));

  // Barras alrededor del centro, como el logo de osu!
  const n = 72;
  for (let i = 0; i < n; i++) {
    const v = frecuencias[3 + (i < n / 2 ? i : n - i)] / 255;   // simétrico a los dos lados
    const angulo = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = 152, largo = 4 + v * v * 64;
    const lados = Math.min(1, Math.abs(Math.sin(angulo)) * 2.5);   // a los lados se apagan para no tapar los botones
    pincel.strokeStyle = 'hsla(' + (190 + v * 120) + ', 100%, 65%, ' + (0.35 + v * 0.6) * lados + ')';
    pincel.lineWidth = 4;
    pincel.beginPath();
    pincel.moveTo(230 + Math.cos(angulo) * r, 230 + Math.sin(angulo) * r);
    pincel.lineTo(230 + Math.cos(angulo) * (r + largo), 230 + Math.sin(angulo) * (r + largo));
    pincel.stroke();
  }
}

// ---------- Ventanas (Niveles, Ajustes, Cuenta, Funciones) ----------
let ventanaAbierta = null;
function abrir(id) {
  cerrar();
  ventanaAbierta = $(id);
  ventanaAbierta.hidden = false;
}
function cerrar() {
  if (ventanaAbierta) ventanaAbierta.hidden = true;
  ventanaAbierta = null;
}
document.querySelectorAll('.cerrar').forEach((b) => b.addEventListener('click', cerrar));
// Clic fuera de la caja también cierra
document.querySelectorAll('.ventana').forEach((v) => v.addEventListener('click', (e) => { if (e.target === v) cerrar(); }));

// Aviso pequeño abajo
let temporizador;
function aviso(mensaje) {
  $('aviso').textContent = mensaje;
  $('aviso').classList.add('visible');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => $('aviso').classList.remove('visible'), 2200);
}

// ---------- Botones del menú ----------
$('btn-nucleo').addEventListener('click', empezar);
$('nivel-1').addEventListener('click', () => { elegirNivel(0); empezar(); });
$('btn-niveles').addEventListener('click', () => abrir('v-niveles'));
$('btn-ajustes').addEventListener('click', () => abrir('v-ajustes'));
$('btn-ajustes2').addEventListener('click', () => abrir('v-ajustes'));
$('btn-cuenta').addEventListener('click', () => abrir('v-cuenta'));
$('btn-funciones').addEventListener('click', () => { abrir('v-funciones'); pestana('como'); });
$('btn-controles').addEventListener('click', () => { abrir('v-funciones'); pestana('controles'); });
document.querySelectorAll('.proximamente').forEach((b) => b.addEventListener('click', () => aviso('Próximamente')));

// ---------- AJUSTES ----------
function aplicarAjustes() {
  camera.fov = ajustes.fov;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));   // calidad normal
  $('hud').style.visibility = ajustes.verGemas ? 'visible' : 'hidden';
  $('hud-duo').style.visibility = ajustes.verGemas ? 'visible' : 'hidden';
  if (ajustes.fondoAnimado) video.play().catch(() => {}); else video.pause();
  // Ponemos los valores guardados en los controles de la ventana
  $('aj-fov').value = ajustes.fov;
  $('aj-fov-valor').textContent = ajustes.fov + '°';
  $('aj-gemas').checked = ajustes.verGemas;
  $('aj-fondo').checked = ajustes.fondoAnimado;
  musica.volume = ajustes.volumen / 100;
  $('aj-volumen').value = ajustes.volumen;
  $('aj-volumen-valor').textContent = ajustes.volumen + '%';
}
function cambiarAjustes() {
  guardar('cyberdash-ajustes', ajustes);
  aplicarAjustes();
}
$('aj-fov').addEventListener('input', (e) => { ajustes.fov = Number(e.target.value); cambiarAjustes(); });
$('aj-gemas').addEventListener('change', (e) => { ajustes.verGemas = e.target.checked; cambiarAjustes(); });
$('aj-fondo').addEventListener('change', (e) => { ajustes.fondoAnimado = e.target.checked; cambiarAjustes(); });
$('aj-volumen').addEventListener('input', (e) => { ajustes.volumen = Number(e.target.value); cambiarAjustes(); });
$('aj-borrar').addEventListener('click', () => {
  NIVELES.forEach((d, n) => { records[n] = 0; guardar(claveRecord(n), 0); });
  pintarRecord();
  aviso('Récord borrado');
});

// ---------- CUENTA (se guarda en el navegador, no hay servidor) ----------
let colorElegido = 'cian';
document.querySelectorAll('.color').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.color').forEach((c) => c.classList.remove('elegido'));
  b.classList.add('elegido');
  colorElegido = b.dataset.color;
}));
$('form-cuenta').addEventListener('submit', (e) => {
  e.preventDefault();                          // que el formulario no recargue la página
  const nombre = $('cu-nombre').value.trim();
  if (nombre.length < 3) return aviso('El nombre necesita 3 letras como mínimo');
  perfil = { nombre: nombre, color: colorElegido, partidas: 0, gemas: 0 };
  guardar('cyberdash-perfil', perfil);
  pintarCuenta();
  aviso('Bienvenido, ' + nombre);
});
$('cu-salir').addEventListener('click', () => {
  perfil = null;
  guardar('cyberdash-perfil', null);
  pintarCuenta();
  aviso('Sesión cerrada');
});
function pintarCuenta() {
  const dentro = perfil !== null;
  $('form-cuenta').hidden = dentro;            // sin sesión: formulario
  $('cu-perfil').hidden = !dentro;             // con sesión: perfil
  $('tb-nombre').textContent = dentro ? perfil.nombre : 'Invitado';
  $('tb-avatar').dataset.color = dentro ? perfil.color : '';
  if (dentro) {
    $('cu-saludo').textContent = perfil.nombre;
    $('cu-avatar').dataset.color = perfil.color;
    $('cu-partidas').textContent = perfil.partidas;
    $('cu-gemas').textContent = perfil.gemas;
    $('cu-record').textContent = records[nivel] + '%';
  }
}

// ---------- FUNCIONES (pestañas) ----------
function pestana(nombre) {
  document.querySelectorAll('.pestana').forEach((p) => p.classList.toggle('activa', p.dataset.p === nombre));
  document.querySelectorAll('.seccion').forEach((s) => { s.hidden = s.dataset.p !== nombre; });
}
document.querySelectorAll('.pestana').forEach((p) => p.addEventListener('click', () => pestana(p.dataset.p)));

// ---------- Teclado y ratón ----------
const pantallaFin = $('pantalla-fin');
const pantallaPausa = $('pantalla-pausa');
let finHora = 0;   // momento en que salió la pantalla de muerte (para no reintentar sin querer)

addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {                   // Esc: cerrar ventana, pausar, continuar o ir al menú
    if (ventanaAbierta) return cerrar();
    if (jugando) return pausar();
    if (!pantallaPausa.hidden) return continuar();
    if (!pantallaFin.hidden) return volverMenu();
    return;
  }
  if (e.target.tagName === 'INPUT') return;    // escribiendo tu nombre o tocando un ajuste: no saltar
  const teclaJ1 = e.code === 'KeyW', teclaJ2 = e.code === 'ArrowUp';
  if (e.code !== 'Space' && !teclaJ1 && !teclaJ2) return;
  e.preventDefault();
  if (ventanaAbierta) return;                  // con una ventana abierta, Espacio no hace nada
  if (!pantallaPausa.hidden) return continuar();
  if (!pantallaFin.hidden) {                   // Espacio en la pantalla de muerte = reintentar
    if (performance.now() - finHora > 600) empezar();
    return;
  }
  if (!jugando) empezar();
  if (partidaDuo) {                            // dúo: W salta el jugador 1 y ↑ el jugador 2
    if (teclaJ1 || teclaJ2) {
      const j = jugadores[teclaJ1 ? 0 : 1];
      j.saltar = true;
      j.bufferSalto = 0.12;
    }
    return;
  }
  saltar = true;
  bufferSalto = 0.12;
});
addEventListener('keyup', (e) => {
  saltar = false;
  if (e.code === 'KeyW') jugadores[0].saltar = false;
  if (e.code === 'ArrowUp') jugadores[1].saltar = false;
});
renderer.domElement.addEventListener('mousedown', () => { if (jugando && !partidaDuo) { saltar = true; bufferSalto = 0.12; } });
addEventListener('mouseup', () => { saltar = false; });

$('pf-reintentar').addEventListener('click', empezar);
$('pf-menu').addEventListener('click', volverMenu);
$('pa-continuar').addEventListener('click', continuar);
$('pa-reintentar').addEventListener('click', empezar);
$('pa-menu').addEventListener('click', volverMenu);

// ---------- Partida ----------
// Puntuación: 10 puntos por metro + 500 por gema (+5000 si llegas a la meta)
function calcularPuntos(gana) {
  return Math.floor(x) * 10 + numGemas * 500 + (gana ? 5000 : 0);
}
const progresoActual = () => Math.min(100, Math.floor((x / meta.min.x) * 100));

function empezar() {
  if (!preparado) return;
  partidaDuo = (modo === 'duo');
  if (partidaDuo) elegirNivel(0);              // el modo dúo solo tiene el nivel 1
  camarasDuo();
  cerrar();
  $('aviso').classList.remove('visible');      // que el aviso del menú no tape el juego
  reiniciar();
  jugando = true;
  menu.hidden = true;                          // escondemos el menú y las pantallas
  pantallaFin.hidden = true;
  pantallaPausa.hidden = true;
  $('hud').hidden = partidaDuo;                // y enseñamos el HUD (en dúo, uno para cada jugador)
  $('hud-duo').hidden = !partidaDuo;
  video.pause();                               // el vídeo no hace falta mientras juegas
  document.body.classList.add('sin-raton');    // escondemos el ratón mientras juegas
  prepararAudio();
  musica.currentTime = 0;                      // la canción empieza desde el principio en cada intento
  musica.play().catch(() => {});
  actualizarHUD();
}

function reiniciar() {
  x = 0; y = 0; vy = 0; numGemas = 0;
  tiempoAire = 0; bufferSalto = 0;
  tiempo = 0; moverLaseres();
  alturaCamara = 0;
  angulo = 0;
  gemas.forEach((g) => { g.visible = true; });
  // Los dos jugadores del dúo empiezan desde el principio
  jugadores.forEach((j) => Object.assign(j, { x: 0, y: 0, vy: 0, enSuelo: true, saltar: false, tiempoAire: 0, bufferSalto: 0,
    numGemas: 0, tiempo: 0, angulo: 0, alturaCamara: 0, vivo: true, meta: false }));
  giro.visible = true;
  giro2.visible = partidaDuo;
}

// Cuando los modelos han cargado, se puede jugar
function listo() {
  elegirNivel(0);
  reiniciar();
  preparado = true;
  texto.textContent = '';
  $('btn-nucleo').disabled = false;
  $('nucleo-texto').textContent = 'Pulsa para jugar';
  $('info-gemas').textContent = gemas.length;
  $('n1-gemas').textContent = NIVELES[0].gemas.length;
}

// HUD: se actualiza en cada fotograma mientras juegas
function actualizarHUD() {
  const p = progresoActual();
  escribir($('hud-puntos'), calcularPuntos(false));
  const textoGemas = numGemas + '/' + gemas.length;
  if ($('hud-gemas').textContent !== textoGemas && numGemas > 0) {   // acabas de coger una gema
    $('hud-gemas').classList.remove('coge');
    void $('hud-gemas').offsetWidth;                                 // truco para reiniciar la animación
    $('hud-gemas').classList.add('coge');
  }
  escribir($('hud-gemas'), textoGemas);
  if ($('hud-pct').textContent !== p + '%') {
    $('hud-pct').textContent = p + '%';
    $('hud-barra').style.width = p + '%';
  }
}

function pintarRecord() {
  $('record').textContent = records[nivel] + '%';       // arriba: el récord del nivel elegido
  $('n1-record').textContent = records[0] + '%';
  $('cu-record').textContent = records[nivel] + '%';
}

// Al morir o llegar a la meta: pantalla de resultado
function fin(causa, gana) {
  jugando = false;
  saltar = false;
  const progreso = gana ? 100 : progresoActual();

  if (progreso > records[nivel]) {             // ¿nuevo récord?
    records[nivel] = progreso;
    guardar(claveRecord(nivel), progreso);
    pintarRecord();
  }
  if (perfil) {                                // estadísticas de tu cuenta
    perfil.partidas++;
    perfil.gemas += numGemas;
    guardar('cyberdash-perfil', perfil);
    pintarCuenta();
  }

  $('pf-titulo').textContent = gana ? 'Nivel completado' : 'Has muerto';
  $('pf-causa').textContent = gana ? '¡Has llegado a la meta!' : causa;
  $('pf-puntos').textContent = calcularPuntos(gana);
  $('pf-progreso').textContent = progreso + '%';
  $('pf-gemas').textContent = numGemas + '/' + gemas.length;
  pantallaFin.classList.toggle('gana', !!gana);

  $('hud').hidden = true;
  pantallaFin.hidden = false;
  document.body.classList.remove('sin-raton'); // en muerte y victoria vuelve el ratón
  musica.pause();
  finHora = performance.now();
}

function pausar() {
  jugando = false;
  saltar = false;
  jugadores.forEach((j) => { j.saltar = false; });
  pantallaPausa.hidden = false;
  document.body.classList.remove('sin-raton'); // en pausa también, para poder pulsar los botones
  musica.pause();
}

function continuar() {
  pantallaPausa.hidden = true;
  reloj.getDelta();                            // que no cuente el tiempo que estuvo en pausa
  document.body.classList.add('sin-raton');
  musica.play().catch(() => {});               // sigue por donde iba
  jugando = true;
}

function volverMenu() {
  jugando = false;
  partidaDuo = false;
  $('hud-duo').hidden = true;
  pantallaFin.hidden = true;
  pantallaPausa.hidden = true;
  $('hud').hidden = true;
  document.body.classList.remove('sin-raton');
  if (!pausadaPorTi) musica.play().catch(() => {});   // en el menú sigue sonando, como en osu!
  menu.hidden = false;                         // mostramos el menú
  if (ajustes.fondoAnimado) video.play().catch(() => {});
}

// Al abrir la página: ponemos récord, cuenta y ajustes guardados
pintarRecord();
pintarCuenta();
aplicarAjustes();

function actualizar(dt) {
  // Avanzar, saltar y caer
  x += VELOCIDAD * dt;
  tiempo += dt;
  // Puedes saltar si pisas algo o si te acabas de caer del borde (0,1 s de margen)
  bufferSalto -= dt;
  if ((saltar || bufferSalto > 0) && (enSuelo || tiempoAire < 0.1)) {
    vy = SALTO;
    tiempoAire = 1;   // ya has saltado: no vale volver a saltar en el aire
    bufferSalto = 0;
  }
  const yAntes = y;
  vy -= GRAVEDAD * dt;
  y += vy * dt;
  enSuelo = false;
  if (y <= 0) { y = 0; vy = 0; enSuelo = true; }

  // Plataformas del cielo: desde abajo las atraviesas, cayendo te quedas encima.
  // Si te quedas corto por poco (hasta 0,3 m por debajo del borde) también subes
  for (const p of plataformas) {
    if (vy > 0 || x + 0.45 < p.min.x || x - 0.45 > p.max.x) continue;
    if (yAntes >= p.max.y - 0.3 && y <= p.max.y) { y = p.max.y; vy = 0; enSuelo = true; }
  }

  // Caja del cubo (1 x 1 x 1)
  const caja = new THREE.Box3(new THREE.Vector3(x - 0.45, y, -0.5), new THREE.Vector3(x + 0.45, y + 1, 0.5));

  // Bloques: si caes desde arriba te quedas encima; si no, mueres
  for (const b of bloques) {
    if (!caja.intersectsBox(b)) continue;
    if (yAntes >= b.max.y - 0.1) { y = b.max.y; vy = 0; enSuelo = true; }
    else return perder('¡Choque!');
  }

  // Pinchos
  for (const p of pinchos) {
    if (caja.intersectsBox(p)) return perder('¡Pinchado!');
  }

  // Láseres (los apagados no hacen daño)
  moverLaseres();
  for (const l of lasers) {
    if (l.obj.visible && caja.intersectsBox(new THREE.Box3().setFromObject(l.obj))) return perder('¡Láser!');
  }

  // Gemas: se cogen si están a tu lado, desde un poco por debajo de tus pies hasta un poco por encima de tu cabeza
  for (const g of gemas) {
    const p = g.position;
    if (g.visible && Math.abs(p.x - x) < 1 && p.y > y - 0.8 && p.y < y + 1.6) {
      g.visible = false;
      numGemas++;
    }
  }

  // Meta
  if (x + 0.5 >= meta.min.x) llegarMeta();
  tiempoAire = enSuelo ? 0 : tiempoAire + dt;
}

// Al chocar o al llegar a la meta. En dúo no se acaba la partida: solo para ese jugador
function perder(causa) {
  if (!partidaDuo) return fin(causa);
  jugadorActual.vivo = false;
}
function llegarMeta() {
  if (!partidaDuo) return fin('¡Meta!', true);
  jugadorActual.vivo = false;
  jugadorActual.meta = true;
}

// =================== MODO DÚO ===================
const progresoDe = (j) => (j.meta ? 100 : Math.min(100, Math.floor((j.x / meta.min.x) * 100)));
const puntosDe = (j) => Math.floor(j.x) * 10 + j.numGemas * 500 + (j.meta ? 5000 : 0);

// Cada jugador se mueve con la MISMA función actualizar() del modo historia:
// copiamos sus datos a las variables del juego, lo movemos y guardamos otra vez sus datos
function actualizarDuo(dt) {
  for (const j of jugadores) {
    if (!j.vivo) continue;
    jugadorActual = j;
    ({ x, y, vy, enSuelo, saltar, tiempoAire, bufferSalto, numGemas, tiempo } = j);
    actualizar(dt);
    Object.assign(j, { x, y, vy, enSuelo, saltar, tiempoAire, bufferSalto, numGemas, tiempo });
  }
  jugadores.forEach((j, i) => {
    escribir($('hd' + (i + 1)), j.meta ? '¡META!' : (j.vivo ? progresoDe(j) + '% · ◆ ' + j.numGemas : 'ELIMINADO'));
  });
  // Se acaba cuando uno llega a la meta o cuando han caído los dos
  if (jugadores.some((j) => j.meta) || jugadores.every((j) => !j.vivo)) finDuo();
}

function finDuo() {
  jugando = false;
  const [a, b] = jugadores;
  // Gana quien llega a la meta; si no llega nadie, el que haya ido más lejos
  let ganador = 0;
  if (a.meta !== b.meta) ganador = a.meta ? 1 : 2;
  else if (Math.abs(a.x - b.x) > 0.01) ganador = a.x > b.x ? 1 : 2;
  $('pf-titulo').textContent = ganador ? 'Gana el Jugador ' + ganador : 'Empate';
  $('pf-causa').textContent = (a.meta || b.meta) ? '¡Ha llegado a la meta!' : 'Los dos han caído';
  $('pf-puntos').textContent = 'J1 ' + puntosDe(a) + ' · J2 ' + puntosDe(b);
  $('pf-progreso').textContent = 'J1 ' + progresoDe(a) + '% · J2 ' + progresoDe(b) + '%';
  $('pf-gemas').textContent = 'J1 ' + a.numGemas + ' · J2 ' + b.numGemas;
  pantallaFin.classList.add('gana');
  $('hud-duo').hidden = true;
  pantallaFin.hidden = false;
  document.body.classList.remove('sin-raton');
  musica.pause();
  finHora = performance.now();
}

// Pantalla dividida: el jugador 1 arriba y el 2 abajo, cada uno con su cámara
function camarasDuo() {
  for (const j of jugadores) {
    j.camara.fov = ajustes.fov;
    j.camara.aspect = innerWidth / (innerHeight / 2);
    j.camara.updateProjectionMatrix();
  }
}
function dibujarDuo(dt) {
  const ancho = innerWidth, alto = innerHeight / 2;
  for (const j of jugadores) {                 // el cubo y la cámara de cada uno (igual que en el modo historia)
    if (!j.enSuelo) j.angulo -= dt * 5.8;
    else j.angulo = Math.round(j.angulo / (Math.PI / 2)) * (Math.PI / 2);
    j.giro.rotation.z = j.angulo;
    j.giro.position.set(j.x, j.y + 0.5, 0);
    if (j.enSuelo) j.alturaCamara += (j.y - j.alturaCamara) * Math.min(1, dt * 4);
    j.camara.position.set(j.x - 7, 4 + j.alturaCamara, 5.5);
    j.camara.lookAt(j.x + 6, 1 + j.alturaCamara, 0);
  }
  renderer.setScissorTest(true);               // solo dibujamos dentro de un trozo de la pantalla
  jugadores.forEach((j, i) => {
    // En cada mitad solo se ve el cubo de ese jugador (y si ha caído, ninguno)
    jugadores.forEach((otro) => { otro.giro.visible = (otro === j) && (otro.vivo || otro.meta); });
    const abajo = (i === 0) ? alto : 0;        // jugador 1 en la mitad de arriba
    renderer.setViewport(0, abajo, ancho, alto);
    renderer.setScissor(0, abajo, ancho, alto);
    renderer.render(scene, j.camara);
  });
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, ancho, innerHeight);
}

// Botones de modo (barra de arriba)
function elegirModo(m) {
  modo = m;
  $('modo-historia').classList.toggle('activo', m === 'historia');
  $('modo-duo').classList.toggle('activo', m === 'duo');
  if (preparado) $('nucleo-texto').textContent = (m === 'duo') ? 'Jugar en dúo' : 'Pulsa para jugar';
  $('pie-texto').innerHTML = (m === 'duo')
    ? 'Jugador 1 <kbd>W</kbd> · Jugador 2 <kbd>↑</kbd> · Solo nivel 1'
    : 'Pulsa el centro o <kbd>Espacio</kbd> para empezar';
  if (m === 'duo') {
    if (preparado) elegirNivel(0);
    aviso('Modo dúo: el jugador 1 salta con W y el 2 con ↑');
  }
}
$('modo-historia').addEventListener('click', () => elegirModo('historia'));
$('modo-duo').addEventListener('click', () => elegirModo('duo'));

// Bucle del juego
const reloj = new THREE.Clock();
let alturaCamara = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(reloj.getDelta(), 0.05);
  if (jugando) {
    if (partidaDuo) actualizarDuo(dt);
    else { actualizar(dt); if (jugando) actualizarHUD(); }
  }
  if (!menu.hidden) return dibujarMusica();   // en el menú: dibujamos la música (el juego no hace falta)
  gemas.forEach((g) => { g.rotation.y += dt * 2; });
  if (partidaDuo) return dibujarDuo(dt);       // dúo: pantalla dividida
  if (cubo) {
    // En el aire gira hacia delante (media vuelta por salto); en el suelo se queda recto
    if (!enSuelo) angulo -= dt * 5.8;
    else angulo = Math.round(angulo / (Math.PI / 2)) * (Math.PI / 2);
    giro.rotation.z = angulo;
    giro.position.set(x, y + 0.5, 0);
    // La cámara sube y baja poco a poco hasta la altura donde está apoyado el cubo
    // (así se ve bien cuando subes a los eslabones del cielo)
    if (enSuelo) alturaCamara += (y - alturaCamara) * Math.min(1, dt * 4);
    camera.position.set(x - 7, 4 + alturaCamara, 5.5);   // la cámara sigue al cubo desde detrás
    camera.lookAt(x + 6, 1 + alturaCamara, 0);
  }
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  camarasDuo();
  renderer.setSize(innerWidth, innerHeight);
});
