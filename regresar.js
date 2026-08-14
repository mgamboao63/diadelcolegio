(() => {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.textContent = '← Regresar';
  boton.setAttribute('aria-label', 'Regresar a la página anterior');
  Object.assign(boton.style, {
    position: 'fixed', top: '12px', left: '12px', zIndex: '100000',
    padding: '9px 14px', border: '1px solid rgba(255,255,255,.7)',
    borderRadius: '999px', background: 'rgba(16,43,78,.94)', color: '#fff',
    font: '600 14px system-ui, sans-serif', cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0,0,0,.25)'
  });
  boton.addEventListener('click', () => {
    if (document.referrer && history.length > 1) history.back();
    else location.href = 'index.html';
  });
  document.body.appendChild(boton);
})();
