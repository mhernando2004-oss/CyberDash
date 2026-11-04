/* Cyber Dash 3D · script.js
   1. Fondo en vídeo (cyber-dash-fondo.mp4): se reproduce en bucle y al
      hacer scroll se va acercando y la cámara corre más rápido.
   2. Cabecera: cambia al hacer scroll + menú desplegable en móvil.
   3. Indicador lateral: marca la sección que estás viendo.
   4. Animación de aparición de los contenidos. */
 
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 
  /* =================== 1. FONDO EN VÍDEO =================== */
  // El vídeo se reproduce en bucle. Al hacer scroll:
  //  - se va acercando (zoom) cuanto más bajas por la página
  //  - la cámara corre más rápido mientras te mueves
  const video = document.getElementById('bg');
  const MAX_ZOOM = 0.6;    // al final de la página: escala 1.6
  const MAX_SPEED = 4;     // velocidad máxima del vídeo al hacer scroll
 
  let zoom = 1, speed = 1, lastY = window.scrollY;
 
  if (reduceMotion) {
    video.pause();
  } else {
    // Algunos navegadores bloquean el autoplay: lo forzamos
    video.play().catch(() => {});
  }
 
  function bgLoop() {
    const y = window.scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
 
    // Zoom según lo que has bajado (0 arriba → 1 abajo)
    const targetZoom = 1 + (y / maxScroll) * MAX_ZOOM;
    zoom += (targetZoom - zoom) * 0.08;
    video.style.transform = `scale(${zoom.toFixed(4)})`;
 
    // Fuera del inicio se oscurece un poco para que el texto se lea bien
    const dim = Math.min(1, y / (window.innerHeight * 0.9));
    video.style.opacity = (1 - dim * 0.45).toFixed(3);
 
    // Velocidad según lo rápido que haces scroll
    const dy = Math.abs(y - lastY);
    lastY = y;
    const targetSpeed = Math.min(MAX_SPEED, 1 + dy * 0.08);
    speed += (targetSpeed - speed) * (targetSpeed > speed ? 0.3 : 0.05);
    if (!reduceMotion && Math.abs(video.playbackRate - speed) > 0.05) {
      video.playbackRate = speed;
    }
 
    requestAnimationFrame(bgLoop);
  }
  requestAnimationFrame(bgLoop);
 
  /* =================== 2. CABECERA =================== */
  const nav = document.querySelector('.nav');
  const menuBtn = document.querySelector('.menu-btn');
 
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
 
  menuBtn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open);
  });
  // Al pulsar un enlace del menú, se cierra
  document.querySelectorAll('#menu a').forEach(a =>
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    })
  );
 
  /* =================== 3. INDICADOR LATERAL =================== */
  const railLinks = document.querySelectorAll('.rail a');
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      railLinks.forEach(l => l.classList.toggle('active', l.dataset.sec === entry.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section[id]').forEach(s => sectionObserver.observe(s));
 
  /* =================== 4. APARICIÓN AL HACER SCROLL =================== */
  const revealItems = document.querySelectorAll('main section > *');
  revealItems.forEach(el => el.classList.add('reveal'));
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealItems.forEach(el => revealObserver.observe(el));
})();
 