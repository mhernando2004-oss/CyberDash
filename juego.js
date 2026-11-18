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

// Datos del juego
const bloques = [];  // cajas de los bloques
const pinchos = [];  // cajas de los pinchos
const gemas = [];    // objetos de las gemas
let meta, cubo;
let x = 0, y = 0, vy = 0;          // posición y velocidad del cubo
let enSuelo = true, saltar = false, jugando = false, numGemas = 0;
const texto = document.getElementById('texto');

// Cargar la pista
const loader = new GLTFLoader();
loader.load('modelos/pista.glb', (gltf) => {
  scene.add(gltf.scene);
  gltf.scene.traverse((obj) => {
    if (!obj.isMesh) return; // los colores vienen de los materiales de Blender
    const caja = new THREE.Box3().setFromObject(obj);
    if (obj.name.startsWith('Bloque')) bloques.push(caja);
    if (obj.name.startsWith('Pincho')) pinchos.push(caja.expandByVector(new THREE.Vector3(-0.5, -0.35, 0))); // un poco más pequeña
    if (obj.name === 'Meta') meta = caja;
  });

  // Cargar el cubo y la gema
  loader.load('modelos/cubo.glb', (gltf2) => {
    const gema = gltf2.scene.getObjectByName('Cilindro001');
    gema.removeFromParent();
    gema.geometry.center();
    gema.scale.setScalar(0.12);

    cubo = gltf2.scene;
    cubo.scale.setScalar(0.5); // el cubo del Blender mide 2, lo dejamos en 1
    scene.add(cubo);

    // Una gema encima de cada grupo de pinchos
    let ultimo = -10;
    for (const p of pinchos) {
      const centro = (p.min.x + p.max.x) / 2;
      if (centro - ultimo > 3) {
        const g = gema.clone();
        g.position.set(centro, 2.5, 0);
        scene.add(g);
        gemas.push(g);
      }
      ultimo = centro;
    }
    listo();
  }, undefined, () => error('modelos/cubo.glb'));
}, undefined, () => error('modelos/pista.glb'));

// Si falta un modelo, lo decimos en pantalla
function error(archivo) {
  texto.textContent = 'ERROR: no se encuentra ' + archivo + ' (revisa la carpeta modelos)';
}

// ===== MENÚ PRINCIPAL (los elementos están en juego.html) =====
const $ = (id) => document.getElementById(id);   // atajo para no escribir tanto
const menu = $('menu');
const btnJugar = $('btn-jugar');
const btnNucleo = $('btn-nucleo');
let preparado = false;   // true cuando los modelos han cargado

// Récord (mejor progreso). Se guarda en el navegador para que no se pierda al recargar
let record = 0;
try { record = Number(localStorage.getItem('cyberdash-record')) || 0; } catch (e) {}
$('record').textContent = record + '%';

// Botones del menú
btnJugar.addEventListener('click', empezar);
btnNucleo.addEventListener('click', empezar);

// Panel lateral de controles: se abre con Controles, Ajustes o el menú ☰
const panel = $('panel');
const abrirPanel = () => panel.classList.toggle('abierto');
$('btn-controles').addEventListener('click', abrirPanel);
$('btn-ajustes').addEventListener('click', abrirPanel);
$('btn-menu').addEventListener('click', abrirPanel);
$('btn-cerrar').addEventListener('click', () => panel.classList.remove('abierto'));

// Teclado: Espacio / ↑ saltan (en el menú empiezan la partida). Esc vuelve al menú
addEventListener('keydown', (e) => {
  if (e.code === 'Escape') return jugando ? fin('Pausa') : panel.classList.remove('abierto');
  if (e.code !== 'Space' && e.code !== 'ArrowUp') return;
  e.preventDefault();
  if (!jugando) empezar();
  saltar = true;
});
addEventListener('keyup', () => { saltar = false; });
// Clic en el juego para saltar (solo en el canvas, para no saltar al pulsar los botones del menú)
renderer.domElement.addEventListener('mousedown', () => { if (jugando) saltar = true; });
addEventListener('mouseup', () => { saltar = false; });

function empezar() {
  if (!preparado) return;
  reiniciar();
  jugando = true;
  menu.hidden = true;               // escondemos el menú
  panel.classList.remove('abierto');
  $('menu-video').pause();          // el vídeo no hace falta mientras juegas
  texto.textContent = '◆ 0';
}

function reiniciar() {
  x = 0; y = 0; vy = 0; numGemas = 0;
  gemas.forEach((g) => { g.visible = true; });
}

// Cuando los modelos han cargado, se puede jugar
function listo() {
  reiniciar();
  preparado = true;
  texto.textContent = '';
  btnJugar.disabled = false;
  btnNucleo.disabled = false;
  $('nucleo-texto').textContent = 'Pulsa para jugar';
  $('info-gemas').textContent = gemas.length;
}

// Al morir, ganar o pausar: vuelve el menú con el resultado
function fin(mensaje, gana) {
  jugando = false;
  saltar = false;
  const progreso = gana ? 100 : Math.floor((x / meta.min.x) * 100);

  // ¿Nuevo récord?
  if (progreso > record) {
    record = progreso;
    $('record').textContent = record + '%';
    try { localStorage.setItem('cyberdash-record', record); } catch (e) {}
  }

  // Rellenamos el panel de resultado
  $('res-etiqueta').textContent = gana ? 'Victoria' : (mensaje === 'Pausa' ? 'En pausa' : 'Derrota');
  $('res-titulo').textContent = mensaje;
  $('res-datos').innerHTML = 'Progreso <b>' + progreso + '%</b> · Gemas <b>' + numGemas + '/' + gemas.length + '</b>';
  $('resultado').classList.toggle('gana', !!gana);
  $('resultado').hidden = false;

  $('jugar-texto').textContent = 'Reintentar';
  $('nucleo-texto').textContent = 'Pulsa para reintentar';
  texto.textContent = '';
  menu.hidden = false;              // mostramos el menú
  $('menu-video').play();
}

function actualizar(dt) {
  // Avanzar, saltar y caer
  x += VELOCIDAD * dt;
  if (saltar && enSuelo) vy = SALTO;
  const yAntes = y;
  vy -= GRAVEDAD * dt;
  y += vy * dt;
  enSuelo = false;
  if (y <= 0) { y = 0; vy = 0; enSuelo = true; }

  // Caja del cubo (1 x 1 x 1)
  const caja = new THREE.Box3(new THREE.Vector3(x - 0.45, y, -0.5), new THREE.Vector3(x + 0.45, y + 1, 0.5));

  // Bloques: si caes desde arriba te quedas encima; si no, mueres
  for (const b of bloques) {
    if (!caja.intersectsBox(b)) continue;
    if (yAntes >= b.max.y - 0.1) { y = b.max.y; vy = 0; enSuelo = true; }
    else return fin('¡Choque!');
  }

  // Pinchos
  for (const p of pinchos) {
    if (caja.intersectsBox(p)) return fin('¡Pinchado!');
  }

  // Gemas
  for (const g of gemas) {
    if (g.visible && g.position.distanceTo(new THREE.Vector3(x, y + 0.5, 0)) < 1) {
      g.visible = false;
      numGemas++;
      texto.textContent = '◆ ' + numGemas;
    }
  }

  // Meta
  if (x + 0.5 >= meta.min.x) fin('¡Meta!', true);
}

// Bucle del juego
const reloj = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(reloj.getDelta(), 0.05);
  if (jugando) actualizar(dt);
  if (!menu.hidden) return;         // con el menú abierto no hace falta dibujar el juego
  if (cubo) {
    cubo.position.set(x, y, 0);
    camera.position.set(x - 7, 4, 5.5);     // la cámara sigue al cubo desde detrás
    camera.lookAt(x + 6, 1, 0);
  }
  gemas.forEach((g) => { g.rotation.y += dt * 2; });
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
