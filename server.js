const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3457;
const LOCAL_IP = getLocalIP();

let state = {
  asama: 'lobi',
  oyuncular: [],
  tur: 0,
  gece: { katilSecimi: null, dedektifSecimi: null, dedektifSonuc: null },
  gunduz: { oldu: null, oylama: {}, oylamaAcik: false, surguEdilen: null },
  sonuc: null,
  log: []
};

function resetState() {
  state = {
    asama: 'lobi', oyuncular: [], tur: 0,
    gece: { katilSecimi: null, dedektifSecimi: null, dedektifSonuc: null },
    gunduz: { oldu: null, oylama: {}, oylamaAcik: false, surguEdilen: null },
    sonuc: null, log: []
  };
}

function rolleriDagit() {
  const n = state.oyuncular.length;
  let roller = [];
  if (n <= 6)      roller = ['katil', 'dedektif', ...Array(n-2).fill('sivil')];
  else if (n <= 9) roller = ['katil', 'katil', 'dedektif', ...Array(n-3).fill('sivil')];
  else             roller = ['katil', 'katil', 'dedektif', 'dedektif', ...Array(n-4).fill('sivil')];
  for (let i = roller.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [roller[i], roller[j]] = [roller[j], roller[i]];
  }
  state.oyuncular.forEach((o, i) => { o.rol = roller[i]; o.hayatta = true; o.sorgulandimi = false; });
}

function kazananKontrol() {
  const hayattakiler = state.oyuncular.filter(o => o.hayatta);
  const katiller = hayattakiler.filter(o => o.rol === 'katil');
  const siviller = hayattakiler.filter(o => o.rol !== 'katil');
  if (katiller.length === 0) return 'sivil';
  if (katiller.length >= siviller.length) return 'katil';
  return null;
}

function geceyiKontrolEt() {
  const dedektifler = state.oyuncular.filter(o => o.rol === 'dedektif' && o.hayatta);
  const katilHazir = state.gece.katilSecimi !== null;
  const dedektifHazir = dedektifler.length === 0 || state.gece.dedektifSecimi !== null;
  if (katilHazir && dedektifHazir) sabahOl();
}

function sabahOl() {
  const hedef = state.oyuncular.find(o => o.id === state.gece.katilSecimi);
  if (hedef) hedef.hayatta = false;
  state.gunduz.oldu = state.gece.katilSecimi;
  state.gunduz.oylama = {};
  state.gunduz.oylamaAcik = false;
  state.gunduz.surguEdilen = null;
  state.asama = 'gunduz';
  const isim = hedef ? hedef.isim : '?';
  state.log.push(`Tur ${state.tur}: ${isim} bu gece hayatını kaybetti.`);
  const k = kazananKontrol();
  if (k) { state.sonuc = k; state.asama = 'bitti'; state.log.push(k === 'sivil' ? 'Köylüler kazandı!' : 'Katiller kazandı!'); }
}

function oylamayiBitir() {
  const sayim = {};
  Object.values(state.gunduz.oylama).forEach(id => { sayim[id] = (sayim[id]||0)+1; });
  let maxOy = 0, surgu = null;
  for (const [id, oy] of Object.entries(sayim)) {
    if (oy > maxOy) { maxOy = oy; surgu = id; }
  }
  if (surgu) {
    const oyuncu = state.oyuncular.find(o => o.id === surgu);
    if (oyuncu) {
      oyuncu.hayatta = false;
      state.gunduz.surguEdilen = surgu;
      state.log.push(`${oyuncu.isim} sürgün edildi. Rolü: ${oyuncu.rol}.`);
    }
  }
  state.asama = 'gunduz_sonuc';
  const k = kazananKontrol();
  if (k) { state.sonuc = k; state.asama = 'bitti'; state.log.push(k === 'sivil' ? 'Köylüler kazandı!' : 'Katiller kazandı!'); }
}

function getContentType(ext) {
  return { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[ext] || 'text/plain';
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const getBody = () => new Promise(resolve => {
    let b = '';
    req.on('data', d => b += d);
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch(e) { resolve({}); } });
  });

  const json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(data));
  };

  // ── API ──

  if (pathname === '/api/state' && req.method === 'GET') {
    return json(state);
  }

  if (pathname === '/api/oyuncu' && req.method === 'GET') {
    const id = url.searchParams.get('id');
    const oyuncu = state.oyuncular.find(o => o.id === id);
    if (!oyuncu) return json({ hata: 'Oyuncu bulunamadı' });

    const hayattakiler = state.oyuncular
      .filter(o => o.hayatta && o.id !== id)
      .map(o => ({ id: o.id, isim: o.isim }));

    const tumOyuncular = state.oyuncular.map(o => ({
      id: o.id, isim: o.isim, hayatta: o.hayatta,
      rol: state.asama === 'bitti' ? o.rol : undefined
    }));

    return json({
      asama: state.asama,
      tur: state.tur,
      benimRolum: oyuncu.rol,
      benimId: id,
      isim: oyuncu.isim,
      hayatta: oyuncu.hayatta,
      hayattakiler,
      tumOyuncular,
      gece: {
        katilYapti: state.gece.katilSecimi !== null,
        dedektifYapti: state.gece.dedektifSecimi !== null,
        sonuc: oyuncu.rol === 'dedektif' ? state.gece.dedektifSonuc : null,
        sorguladigi: oyuncu.rol === 'dedektif' ? (() => {
          const s = state.oyuncular.find(o => o.id === state.gece.dedektifSecimi);
          return s ? s.isim : null;
        })() : null
      },
      gunduz: {
        oldu: (() => { const o = state.oyuncular.find(o => o.id === state.gunduz.oldu); return o ? o.isim : null; })(),
        oylamaAcik: state.gunduz.oylamaAcik,
        benimOyum: state.gunduz.oylama[id] || null,
        surguEdilen: (() => { const o = state.oyuncular.find(o => o.id === state.gunduz.surguEdilen); return o ? { isim: o.isim, rol: o.rol } : null; })()
      },
      sonuc: state.sonuc,
      log: state.log
    });
  }

  if (pathname === '/api/oyuncu-ekle' && req.method === 'POST') {
    getBody().then(body => {
      if (state.asama !== 'lobi') return json({ hata: 'Oyun başladı' });
      if (state.oyuncular.length >= 12) return json({ hata: 'Maksimum 12 kişi' });
      const isim = (body.isim || '').trim();
      if (!isim) return json({ hata: 'İsim boş' });
      if (state.oyuncular.find(o => o.isim.toLowerCase() === isim.toLowerCase())) return json({ hata: 'Bu isim alınmış' });
      const id = Math.random().toString(36).slice(2, 8);
      state.oyuncular.push({ id, isim, rol: null, hayatta: true, sorgulandimi: false });
      json({ ok: true, id, isim });
    });
    return;
  }

  if (pathname === '/api/oyuncu-sil' && req.method === 'POST') {
    getBody().then(body => {
      if (state.asama !== 'lobi') return json({ hata: 'Oyun başladı' });
      state.oyuncular = state.oyuncular.filter(o => o.id !== body.id);
      json({ ok: true });
    });
    return;
  }

  if (pathname === '/api/baslat' && req.method === 'POST') {
    if (state.oyuncular.length < 4) return json({ hata: 'En az 4 kişi gerekli' });
    rolleriDagit();
    state.asama = 'rol_dagitim';
    state.log.push('Oyun başladı.');
    return json({ ok: true });
  }

  if (pathname === '/api/geceye-gec' && req.method === 'POST') {
    state.asama = 'gece';
    state.tur++;
    state.gece = { katilSecimi: null, dedektifSecimi: null, dedektifSonuc: null };
    state.log.push(`Tur ${state.tur}: Gece başladı.`);
    return json({ ok: true });
  }

  if (pathname === '/api/katil-sec' && req.method === 'POST') {
    getBody().then(body => {
      if (state.asama !== 'gece') return json({ hata: 'Gece değil' });
      const katil = state.oyuncular.find(o => o.id === body.katilId && o.rol === 'katil' && o.hayatta);
      const hedef = state.oyuncular.find(o => o.id === body.hedefId && o.hayatta);
      if (!katil || !hedef) return json({ hata: 'Geçersiz seçim' });
      state.gece.katilSecimi = body.hedefId;
      geceyiKontrolEt();
      json({ ok: true });
    });
    return;
  }

  if (pathname === '/api/dedektif-sorgu' && req.method === 'POST') {
    getBody().then(body => {
      if (state.asama !== 'gece') return json({ hata: 'Gece değil' });
      const dedektif = state.oyuncular.find(o => o.id === body.dedektifId && o.rol === 'dedektif' && o.hayatta);
      const hedef = state.oyuncular.find(o => o.id === body.hedefId && o.hayatta);
      if (!dedektif || !hedef) return json({ hata: 'Geçersiz seçim' });
      state.gece.dedektifSecimi = body.hedefId;
      state.gece.dedektifSonuc = hedef.rol === 'katil' ? 'katil' : 'masum';
      hedef.sorgulandimi = true;
      geceyiKontrolEt();
      json({ ok: true });
    });
    return;
  }

  if (pathname === '/api/sabah-onayla' && req.method === 'POST') {
    sabahOl();
    return json({ ok: true });
  }

  if (pathname === '/api/oylama-ac' && req.method === 'POST') {
    state.gunduz.oylamaAcik = true;
    state.asama = 'oylama';
    return json({ ok: true });
  }

  if (pathname === '/api/oy-ver' && req.method === 'POST') {
    getBody().then(body => {
      if (state.asama !== 'oylama') return json({ hata: 'Oylama değil' });
      const voter = state.oyuncular.find(o => o.id === body.oyVerenId && o.hayatta);
      if (!voter) return json({ hata: 'Geçersiz' });
      if (!state.gunduz.oylama[body.oyVerenId]) {
        state.gunduz.oylama[body.oyVerenId] = body.hedefId;
      }
      const hayattakiler = state.oyuncular.filter(o => o.hayatta);
      const oyVerenler = Object.keys(state.gunduz.oylama);
      if (oyVerenler.length >= hayattakiler.length) oylamayiBitir();
      json({ ok: true });
    });
    return;
  }

  if (pathname === '/api/sonraki-gece' && req.method === 'POST') {
    state.asama = 'gece';
    state.tur++;
    state.gece = { katilSecimi: null, dedektifSecimi: null, dedektifSonuc: null };
    state.gunduz = { oldu: null, oylama: {}, oylamaAcik: false, surguEdilen: null };
    state.log.push(`Tur ${state.tur}: Gece başladı.`);
    return json({ ok: true });
  }

  if (pathname === '/api/yeni-oyun' && req.method === 'POST') {
    resetState();
    return json({ ok: true });
  }

  // Aynı oyuncularla yeni tur
  if (pathname === '/api/yeni-tur' && req.method === 'POST') {
    const mevcutOyuncular = state.oyuncular.map(o => ({ id: o.id, isim: o.isim }));
    resetState();
    state.oyuncular = mevcutOyuncular.map(o => ({ ...o, rol: null, hayatta: true, sorgulandimi: false }));
    return json({ ok: true });
  }

  // Dosya sun
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.setHeader('Content-Type', getContentType(path.extname(filePath)));
    res.writeHead(200);
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🎭 KİM YAPTI? - Sunucu Başlatıldı!\n');
  console.log(`📱 Tablet için: http://${LOCAL_IP}:${PORT}/`);
  console.log(`📱 Telefon için: http://${LOCAL_IP}:${PORT}/telefon.html`);
  console.log('\nQR kod tablet ekranında gösterilecek.\n');
});
