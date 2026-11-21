(function () {
  const input = document.getElementById('imei-input');
  const status = document.getElementById('imei-status');
  const copyBtn = document.getElementById('copy-btn');
  const clearBtn = document.getElementById('clear-btn');
  const year = document.getElementById('year');
  const scanCameraBtn = document.getElementById('scan-camera-btn');
  const scanImageBtn = document.getElementById('scan-image-btn');
  const scanStopBtn = document.getElementById('scan-stop-btn');
  const scanFileInput = document.getElementById('scan-file-input');
  const scanArea = document.getElementById('scan-area');
  const scanVideo = document.getElementById('scan-video');
  const scanCanvas = document.getElementById('scan-canvas');
  const scanStatus = document.getElementById('scan-status');

  if (year) year.textContent = new Date().getFullYear();
  if (!input || !status) return;

  // Known URL patterns that accept IMEI as a query parameter.
  // Only include patterns that are publicly documented/commonly supported.
  const prefillPatterns = {
    'https://www.imei.info/id/': (imei) => 'https://www.imei.info/?imei=' + encodeURIComponent(imei),
    'https://imeicheck.com/id/cek-imei': (imei) => 'https://imeicheck.com/imei-check?imei=' + encodeURIComponent(imei)
  };

  function getImei() {
    return input.value.replace(/\D/g, '');
  }

  function luhnValid(imei) {
    if (!/^\d{15}$/.test(imei)) return false;
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      let digit = parseInt(imei.charAt(i), 10);
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(imei.charAt(14), 10);
  }

  function setStatus(msg, cls) {
    status.textContent = msg;
    status.className = 'status' + (cls ? ' ' + cls : '');
  }

  function updateStatus() {
    const raw = getImei();
    if (raw !== input.value) input.value = raw;

    if (!raw) {
      setStatus('', '');
      return;
    }

    if (raw.length < 15) {
      setStatus(`Panjang: ${raw.length}/15 digit. Lanjutkan memasukkan nomor IMEI.`, 'warn');
      return;
    }

    if (luhnValid(raw)) {
      setStatus('Format IMEI valid (15 digit, lolos pemeriksaan checksum). Pilih layanan di bawah untuk melakukan pengecekan.', 'ok');
    } else {
      setStatus('15 digit terdeteksi, tetapi checksum IMEI tidak sesuai. Periksa kembali nomor Anda.', 'bad');
    }
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }

  function setScanStatus(msg, cls) {
    if (!scanStatus) return;
    scanStatus.textContent = msg;
    scanStatus.className = 'status' + (cls ? ' ' + cls : '');
  }

  function extractImeis(text) {
    if (!text) return [];
    const matches = text.match(/\d{15}/g) || [];
    const seen = new Set();
    const out = [];
    matches.forEach((m) => {
      if (!seen.has(m)) { seen.add(m); out.push(m); }
    });
    return out;
  }

  function applyScannedText(text, source) {
    const imeis = extractImeis(text);
    if (!imeis.length) {
      setScanStatus(`Tidak ditemukan 15 digit IMEI pada ${source}. Coba gambar lebih jelas/dekat.`, 'warn');
      return false;
    }
    const chosen = imeis[0];
    input.value = chosen;
    updateStatus();
    const extra = imeis.length > 1 ? ` (${imeis.length} IMEI terdeteksi, yang pertama dipakai)` : '';
    setScanStatus(`IMEI terdeteksi dari ${source}: ${chosen}${extra}. Anda bisa salin atau pilih layanan cek.`, 'ok');
    copyText(chosen).catch(() => {});
    return true;
  }

  let scanStream = null;
  let scanTimer = null;
  let scanning = false;
  let zxingReader = null;

  function stopScan() {
    scanning = false;
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    if (scanStream) {
      scanStream.getTracks().forEach((t) => t.stop());
      scanStream = null;
    }
    if (scanVideo) scanVideo.srcObject = null;
    if (scanArea) scanArea.hidden = true;
    if (scanStopBtn) scanStopBtn.hidden = true;
    if (scanCameraBtn) scanCameraBtn.disabled = false;
  }

  async function ensureZXing() {
    if (window.ZXing) return window.ZXing;
    if (zxingReader) return window.ZXing;
    setScanStatus('Memuat library pemindai barcode...', 'warn');
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Gagal memuat library barcode'));
      document.head.appendChild(s);
    });
    return window.ZXing;
  }

  async function scanWithBarcodeDetector(source) {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      const wanted = ['code_128','code_39','ean_13','ean_8','itf','codabar','qr_code','data_matrix','upc_a','upc_e'];
      const use = wanted.filter((f) => formats.includes(f));
      if (!use.length) return null;
      const detector = new window.BarcodeDetector({ formats: use });
      const barcodes = await detector.detect(source);
      for (const b of barcodes) {
        const imeis = extractImeis(b.rawValue || '');
        if (imeis.length) return imeis[0];
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  async function scanWithZXing(source) {
    try {
      const ZXing = await ensureZXing();
      if (!ZXing) return null;
      if (!zxingReader) zxingReader = new ZXing.BrowserMultiFormatReader();
      const hints = new Map();
      const fmts = [
        ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.ITF, ZXing.BarcodeFormat.CODABAR,
        ZXing.BarcodeFormat.QR_CODE, ZXing.BarcodeFormat.DATA_MATRIX, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E
      ].filter(Boolean);
      if (fmts.length) hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, fmts);
      zxingReader.hints = hints;
      const result = await zxingReader.decodeFromImageElement(source);
      const text = result && result.getText ? result.getText() : '';
      const imeis = extractImeis(text);
      return imeis[0] || null;
    } catch (_) {
      return null;
    }
  }

  async function scanWithOCR(source) {
    if (!window.Tesseract) {
      setScanStatus('Memuat OCR untuk membaca teks...', 'warn');
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Gagal memuat OCR'));
        document.head.appendChild(s);
      });
    }
    const result = await window.Tesseract.recognize(source, 'eng', {
      tessedit_char_whitelist: '0123456789'
    });
    const text = result && result.data ? result.data.text : '';
    const imeis = extractImeis(text);
    return imeis[0] || null;
  }

  async function detectFromSource(source, label) {
    setScanStatus(`Memindai ${label}...`, 'warn');
    let imei = await scanWithBarcodeDetector(source);
    if (imei) { input.value = imei; updateStatus(); setScanStatus(`IMEI terdeteksi dari barcode: ${imei}`, 'ok'); copyText(imei).catch(()=>{}); return true; }
    imei = await scanWithZXing(source);
    if (imei) { input.value = imei; updateStatus(); setScanStatus(`IMEI terdeteksi dari barcode: ${imei}`, 'ok'); copyText(imei).catch(()=>{}); return true; }
    try {
      imei = await scanWithOCR(source);
      if (imei) { input.value = imei; updateStatus(); setScanStatus(`IMEI terdeteksi dari teks/OCR: ${imei}`, 'ok'); copyText(imei).catch(()=>{}); return true; }
    } catch (e) {
      setScanStatus(`Gagal OCR: ${e.message || e}`, 'bad');
      return false;
    }
    setScanStatus(`Tidak ditemukan IMEI 15 digit pada ${label}. Pastikan barcode/teks jelas dan coba lagi.`, 'bad');
    return false;
  }

  async function startCameraScan() {
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      setScanStatus('Kamera butuh konteks aman (HTTPS atau localhost). Buka halaman lewat server lokal, atau gunakan Upload Gambar.', 'bad');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScanStatus('Browser tidak mendukung akses kamera. Gunakan Upload Gambar.', 'bad');
      return;
    }
    stopScan();
    setScanStatus('Meminta izin kamera...', 'warn');
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (e) {
      try {
        scanStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (err) {
        const name = err && err.name ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setScanStatus('Izin kamera ditolak. Izinkan akses kamera di browser, lalu coba lagi, atau gunakan Upload Gambar.', 'bad');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setScanStatus('Kamera tidak ditemukan. Pastikan perangkat memiliki kamera, atau gunakan Upload Gambar.', 'bad');
        } else if (name === 'NotReadableError') {
          setScanStatus('Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.', 'bad');
        } else {
          setScanStatus(`Gagal mengakses kamera (${name || 'error'}). Coba Upload Gambar.`, 'bad');
        }
        return;
      }
    }
    scanArea.hidden = false;
    scanStopBtn.hidden = false;
    scanCameraBtn.disabled = true;
    scanVideo.srcObject = scanStream;
    try { await scanVideo.play(); } catch (_) {}
    scanning = true;
    setScanStatus('Kamera aktif. Arahkan barcode/teks IMEI ke kotak...', 'warn');

    const tick = async () => {
      if (!scanning) return;
      if (scanVideo.readyState < 2) { scanTimer = setTimeout(tick, 400); return; }
      scanCanvas.width = scanVideo.videoWidth || 1280;
      scanCanvas.height = scanVideo.videoHeight || 720;
      const ctx = scanCanvas.getContext('2d');
      ctx.drawImage(scanVideo, 0, 0, scanCanvas.width, scanCanvas.height);
      let imei = await scanWithBarcodeDetector(scanCanvas);
      if (!imei) imei = await scanWithBarcodeDetector(scanVideo);
      if (!imei) {
        try {
          const ZXing = window.ZXing;
          if (ZXing) {
            if (!zxingReader) await ensureZXing();
            if (zxingReader) {
              try {
                const res = await zxingReader.decodeFromCanvas(scanCanvas);
                const txt = res && res.getText ? res.getText() : '';
                const arr = extractImeis(txt);
                imei = arr[0] || null;
              } catch (_) {}
            }
          }
        } catch (_) {}
      }
      if (imei) {
        input.value = imei;
        updateStatus();
        setScanStatus(`IMEI terdeteksi: ${imei}. Disalin otomatis.`, 'ok');
        copyText(imei).catch(() => {});
        stopScan();
        return;
      }
      scanTimer = setTimeout(tick, 700);
    };
    tick();
  }

  async function scanImageFile(file) {
    if (!file) return;
    setScanStatus(`Membaca gambar: ${file.name} ...`, 'warn');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        await detectFromSource(img, 'gambar');
      } catch (e) {
        setScanStatus(`Gagal memindai gambar: ${e && e.message ? e.message : e}`, 'bad');
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setScanStatus('Gagal membaca file gambar. Pastikan format gambar didukung (JPG/PNG/WebP).', 'bad');
    };
    img.src = url;
  }

  if (scanCameraBtn) {
    scanCameraBtn.addEventListener('click', (e) => { e.preventDefault(); startCameraScan(); });
  }
  if (scanStopBtn) {
    scanStopBtn.addEventListener('click', (e) => { e.preventDefault(); stopScan(); setScanStatus('Pemindaian kamera dihentikan.', 'warn'); });
  }
  if (scanFileInput) {
    scanFileInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) scanImageFile(f);
      e.target.value = '';
    });
  }
  if (scanImageBtn && !document.querySelector('label[for="scan-file-input"]')) {
    scanImageBtn.addEventListener('click', () => scanFileInput && scanFileInput.click());
  }

  async function copyImei() {
    const raw = getImei();
    if (!raw) {
      setStatus('Masukkan IMEI terlebih dahulu untuk disalin.', 'warn');
      input.focus();
      return;
    }
    try {
      await copyText(raw);
      setStatus(`IMEI ${raw} berhasil disalin. Tempelkan di situs layanan yang dipilih.`, 'ok');
    } catch (e) {
      setStatus('Gagal menyalin otomatis. Silakan salin IMEI secara manual.', 'bad');
    }
  }

  input.addEventListener('input', updateStatus);

  if (copyBtn) copyBtn.addEventListener('click', copyImei);

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      input.value = '';
      updateStatus();
      setScanStatus('', '');
      stopScan();
      input.focus();
    });
  }

  // Enhance service buttons: copy IMEI and open service.
  document.querySelectorAll('.service-card .btn[data-service]').forEach((btn) => {
    btn.addEventListener('click', async function (e) {
      const raw = getImei();
      const baseUrl = btn.getAttribute('data-url') || btn.getAttribute('href');
      const prefill = prefillPatterns[baseUrl];
      const targetUrl = (raw && prefill) ? prefill(raw) : baseUrl;

      // If no IMEI, just open normally.
      if (!raw) return;

      e.preventDefault();
      try {
        await copyText(raw);
      } catch (_) { /* ignore copy failure, still open */ }

      if (prefill) {
        setStatus(`IMEI ${raw} disalin dan dibuka di layanan terpilih (dengan parameter IMEI jika didukung).`, 'ok');
      } else {
        setStatus(`IMEI ${raw} disalin. Situs dibuka — tempelkan IMEI (Ctrl+V) di kolom pencarian situs tersebut.`, 'ok');
      }
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    });
  });
})();
