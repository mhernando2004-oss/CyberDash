(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fondo en vídeo: al bajar se acerca y va más rápido
  const video = document.getElementById('bg');
  const MAX_ZOOM = 0.6;    // escala 1.6 al final de la página
  const MAX_SPEED = 4;

  let zoom = 1, speed = 1, lastY = window.scrollY;

  if (reduceMotion) {
    video.pause();
  } else {
    video.play().catch(() => {}); // por si el navegador bloquea el autoplay
  }

  function bgLoop() {
    const y = window.scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

    const targetZoom = 1 + (y / maxScroll) * MAX_ZOOM;
    zoom += (targetZoom - zoom) * 0.08;
    video.style.transform = `scale(${zoom.toFixed(4)})`;

    // se oscurece al bajar para que se lea el texto
    const dim = Math.min(1, y / (window.innerHeight * 0.9));
    video.style.opacity = (1 - dim * 0.45).toFixed(3);

    // velocidad según lo rápido que se hace scroll
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

  // Cabecera
  const nav = document.querySelector('.nav');
  const menuBtn = document.querySelector('.menu-btn');

  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  menuBtn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open);
  });
  // cerrar el menú al pulsar un enlace
  document.querySelectorAll('#menu a').forEach(a =>
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    })
  );

  // Indicador lateral
  const railLinks = document.querySelectorAll('.rail a');
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      railLinks.forEach(l => l.classList.toggle('active', l.dataset.sec === entry.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section[id]').forEach(s => sectionObserver.observe(s));

  // Aparición al hacer scroll
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
