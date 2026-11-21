(function () {
  const input = document.getElementById('imei-input');
  const status = document.getElementById('imei-status');
  const copyBtn = document.getElementById('copy-btn');
  const clearBtn = document.getElementById('clear-btn');
  const year = document.getElementById('year');

  if (year) year.textContent = new Date().getFullYear();
  if (!input || !status) return;

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

  function updateStatus() {
    const raw = input.value.replace(/\D/g, '');
    if (raw !== input.value) input.value = raw;

    if (!raw) {
      status.textContent = '';
      status.className = 'status';
      return;
    }

    if (raw.length < 15) {
      status.textContent = `Panjang: ${raw.length}/15 digit. Lanjutkan memasukkan nomor IMEI.`;
      status.className = 'status warn';
      return;
    }

    if (luhnValid(raw)) {
      status.textContent = 'Format IMEI valid (15 digit, lolos pemeriksaan checksum).';
      status.className = 'status ok';
    } else {
      status.textContent = '15 digit terdeteksi, tetapi checksum IMEI tidak sesuai. Periksa kembali nomor Anda.';
      status.className = 'status bad';
    }
  }

  async function copyImei() {
    const raw = input.value.replace(/\D/g, '');
    if (!raw) {
      status.textContent = 'Masukkan IMEI terlebih dahulu untuk disalin.';
      status.className = 'status warn';
      input.focus();
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(raw);
      } else {
        input.select();
        document.execCommand('copy');
        input.setSelectionRange(raw.length, raw.length);
      }
      status.textContent = `IMEI ${raw} berhasil disalin. Tempelkan di situs layanan yang dipilih.`;
      status.className = 'status ok';
    } catch (e) {
      status.textContent = 'Gagal menyalin otomatis. Silakan salin IMEI secara manual.';
      status.className = 'status bad';
    }
  }

  input.addEventListener('input', updateStatus);

  if (copyBtn) copyBtn.addEventListener('click', copyImei);

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      input.value = '';
      updateStatus();
      input.focus();
    });
  }
})();
