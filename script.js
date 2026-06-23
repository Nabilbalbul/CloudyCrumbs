/* ============================================================
   Cloudy Crumbs – script.js
   Interaksi: form → tabel, validasi, notifikasi toast,
   transisi halaman, dan beberapa sentuhan manis lainnya 🌸
   ============================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "ccReservasi";
  const SEED_OVERRIDE_KEY = "ccSeedOverrides";

  /* ------------------------------------------------------------
     0. UTIL
  ------------------------------------------------------------ */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function getReservasi() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveReservasi(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  // Data contoh (CC-001..CC-008) bersifat statis di kode, jadi perubahan
  // (edit/batal/hapus) terhadapnya disimpan terpisah sebagai "override".
  function getSeedOverrides() {
    try {
      const raw = localStorage.getItem(SEED_OVERRIDE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveSeedOverrides(map) {
    localStorage.setItem(SEED_OVERRIDE_KEY, JSON.stringify(map));
  }

  function isSeedId(id) {
    return id < 1000000;
  }

  // Update field-field record manapun (data contoh ataupun data baru),
  // tersimpan permanen di localStorage masing-masing.
  function updateRecord(id, fields) {
    if (isSeedId(id)) {
      const overrides = getSeedOverrides();
      overrides[id] = { ...(overrides[id] || {}), ...fields };
      saveSeedOverrides(overrides);
    } else {
      const semua = getReservasi();
      const idx = semua.findIndex((r) => r.id === id);
      if (idx !== -1) {
        semua[idx] = { ...semua[idx], ...fields };
        saveReservasi(semua);
      }
    }
  }

  // Hapus record manapun secara permanen (data contoh disembunyikan lewat flag,
  // data baru dibuang langsung dari array tersimpan).
  function deleteRecordById(id) {
    if (isSeedId(id)) {
      const overrides = getSeedOverrides();
      overrides[id] = { ...(overrides[id] || {}), deleted: true };
      saveSeedOverrides(overrides);
    } else {
      const semua = getReservasi();
      const idx = semua.findIndex((r) => r.id === id);
      if (idx !== -1) {
        semua.splice(idx, 1);
        saveReservasi(semua);
      }
    }
  }

  function buatKodeBaru(list) {
    const angkaTerbesar = list.reduce((max, r) => {
      const n = parseInt((r.kode || "CC-000").split("-")[1], 10) || 0;
      return Math.max(max, n);
    }, 8); // 8 data contoh sudah ada di tabel statis
    const next = angkaTerbesar + 1;
    return "CC-" + String(next).padStart(3, "0");
  }

  function formatTanggal(iso) {
    if (!iso) return "-";
    const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return `${d} ${bulan[parseInt(m, 10) - 1]} ${y}`;
  }

  function labelArea(area) {
    return { indoor: "Indoor", outdoor: "Outdoor", vip: "VIP", bebas: "Bebas" }[area] || area || "-";
  }

  function badgeStatus(status) {
    const map = {
      menunggu: ["badge-kuning", "Menunggu"],
      konfirmasi: ["badge-hijau", "Terkonfirmasi"],
      batal: ["badge-merah", "Dibatalkan"],
      selesai: ["badge-biru", "Selesai"],
    };
    const [cls, label] = map[status] || ["badge-kuning", "Menunggu"];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  /* ------------------------------------------------------------
     1. TOAST NOTIFIKASI (super cute 🌸)
  ------------------------------------------------------------ */
  function ensureToastWrap() {
    let wrap = $("#ccToastWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "ccToastWrap";
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function showToast(opts) {
    const { title, message, type = "info", emoji, duration = 3600 } = opts;
    const wrap = ensureToastWrap();

    const emojiMap = { success: "🎉", error: "🙁", info: "🌸" };
    const toast = document.createElement("div");
    toast.className = `cc-toast ${type}`;
    toast.innerHTML = `
      <span class="cc-toast-emoji">${emoji || emojiMap[type] || "🌸"}</span>
      <div class="cc-toast-body">
        ${title ? `<div class="cc-toast-title">${title}</div>` : ""}
        <div class="cc-toast-msg">${message}</div>
      </div>
      <button class="cc-toast-close" aria-label="Tutup notifikasi">✕</button>
      <span class="cc-toast-bar" style="animation-duration:${duration}ms;"></span>
    `;

    function closeToast() {
      if (!toast.isConnected) return;
      toast.classList.add("closing");
      setTimeout(() => toast.remove(), 280);
    }

    toast.querySelector(".cc-toast-close").addEventListener("click", closeToast);
    wrap.appendChild(toast);

    const timer = setTimeout(closeToast, duration);
    toast.addEventListener("mouseenter", () => clearTimeout(timer));
  }

  window.ccToast = showToast; // biar bisa dipakai manual kalau perlu

  /* ------------------------------------------------------------
     1a. POPUP NOTIFIKASI (dibuat / dibatalkan / diedit)
  ------------------------------------------------------------ */
  function ensurePopup() {
    let overlay = $("#ccPopup");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "ccPopup";
    overlay.className = "cc-popup-overlay";
    overlay.innerHTML = `
      <div class="cc-popup-card" id="ccPopupCard">
        <span class="cc-popup-ring"></span>
        <div class="cc-popup-emoji" id="ccPopupEmoji">🌸</div>
        <h3 id="ccPopupTitle">Judul</h3>
        <p id="ccPopupMsg">Pesan</p>
        <span class="cc-popup-kode" id="ccPopupKode" style="display:none;"></span>
        <button type="button" class="btn btn-primary" id="ccPopupOk">Asiap! 🌸</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const tutup = () => overlay.classList.remove("show");
    $("#ccPopupOk", overlay).addEventListener("click", tutup);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) tutup(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") tutup(); });

    return overlay;
  }

  function showPopup(opts) {
    const { jenis = "berhasil", emoji = "🎉", title, message, kode, tombol = "Asiap! 🌸", onClose } = opts;
    const overlay = ensurePopup();
    const card = $("#ccPopupCard", overlay);

    card.className = "cc-popup-card " + jenis;
    $("#ccPopupEmoji", overlay).textContent = emoji;
    $("#ccPopupTitle", overlay).textContent = title;
    $("#ccPopupMsg", overlay).innerHTML = message;
    $("#ccPopupOk", overlay).textContent = tombol;

    const kodeEl = $("#ccPopupKode", overlay);
    if (kode) {
      kodeEl.textContent = kode;
      kodeEl.style.display = "inline-block";
    } else {
      kodeEl.style.display = "none";
    }

    overlay.classList.add("show");

    const okBtn = $("#ccPopupOk", overlay);
    const handler = function () {
      overlay.classList.remove("show");
      if (typeof onClose === "function") onClose();
      okBtn.removeEventListener("click", handler);
    };
    okBtn.addEventListener("click", handler);
  }

  window.ccPopup = showPopup;

  /* ------------------------------------------------------------
     1a-2. POPUP KONFIRMASI HAPUS (cute confirm dialog) 🗑️🌸
  ------------------------------------------------------------ */
  function ensureConfirmPopup() {
    let overlay = $("#ccConfirmPopup");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "ccConfirmPopup";
    overlay.className = "cc-popup-overlay";
    overlay.innerHTML = `
      <div class="cc-popup-card cc-confirm-card" id="ccConfirmCard">
        <span class="cc-popup-ring"></span>
        <div class="cc-popup-emoji" id="ccConfirmEmoji">🗑️</div>
        <h3 id="ccConfirmTitle">Yakin mau hapus?</h3>
        <p id="ccConfirmMsg">Tindakan ini tidak dapat dibatalkan.</p>
        <span class="cc-popup-kode" id="ccConfirmKode" style="display:none;"></span>
        <div class="cc-confirm-actions">
          <button type="button" class="btn cc-btn-batalkan" id="ccConfirmCancel">✕ Jangan Dulu</button>
          <button type="button" class="btn cc-btn-hapus" id="ccConfirmOk">🗑️ Hapus!</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const tutup = () => overlay.classList.remove("show");
    $("#ccConfirmCancel", overlay).addEventListener("click", tutup);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) tutup(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") tutup(); });

    return overlay;
  }

  function showConfirmPopup(opts) {
    const {
      title = "Yakin mau hapus? 🗑️",
      message,
      kode,
      emoji = "🗑️",
      okText = "🗑️ Hapus!",
      cancelText = "✕ Jangan Dulu",
      okClass = "cc-btn-hapus",
      onConfirm,
      onCancel,
    } = opts;
    const overlay = ensureConfirmPopup();

    $("#ccConfirmTitle", overlay).textContent = title;
    $("#ccConfirmMsg", overlay).innerHTML = message || "Tindakan ini <strong>tidak dapat dibatalkan</strong>. Data akan hilang selamanya! 💨";
    $("#ccConfirmEmoji", overlay).textContent = emoji;

    const kodeEl = $("#ccConfirmKode", overlay);
    if (kode) {
      kodeEl.textContent = kode;
      kodeEl.style.display = "inline-block";
    } else {
      kodeEl.style.display = "none";
    }

    overlay.classList.add("show");

    // bounce emoji ulang
    const emojiEl = $("#ccConfirmEmoji", overlay);
    emojiEl.style.animation = "none";
    void emojiEl.offsetWidth;
    emojiEl.style.animation = "";

    const okBtn = $("#ccConfirmOk", overlay);
    const cancelBtn = $("#ccConfirmCancel", overlay);

    okBtn.textContent = okText;
    okBtn.className = "btn " + okClass;
    cancelBtn.textContent = cancelText;

    const handleOk = () => {
      overlay.classList.remove("show");
      if (typeof onConfirm === "function") onConfirm();
      okBtn.removeEventListener("click", handleOk);
      cancelBtn.removeEventListener("click", handleCancel);
    };
    const handleCancel = () => {
      overlay.classList.remove("show");
      if (typeof onCancel === "function") onCancel();
      okBtn.removeEventListener("click", handleOk);
      cancelBtn.removeEventListener("click", handleCancel);
    };

    okBtn.addEventListener("click", handleOk);
    cancelBtn.addEventListener("click", handleCancel);
  }

  window.ccConfirmPopup = showConfirmPopup;

  /* ------------------------------------------------------------
     1b. DEKORASI MENGAMBANG (pastry & bunga) 🧁🌸
  ------------------------------------------------------------ */
  const decorSVGs = [
    // cupcake
    `<svg viewBox="0 0 64 64" width="54" height="54"><path d="M14 30h36l-4 26a4 4 0 0 1-4 3.4H22a4 4 0 0 1-4-3.4z" fill="#f48fb1"/><path d="M14 30h36l-1.4 9H15.4z" fill="#e91e8c"/><path d="M32 6c6 0 9 5 9 9 0 3-1.7 5-3.6 6.4C39.7 22.7 42 25.6 42 29H22c0-3.4 2.3-6.3 4.6-7.6C24.7 20 23 18 23 15c0-4 3-9 9-9z" fill="#fff"/><circle cx="32" cy="11" r="2.4" fill="#e91e8c"/></svg>`,
    // bunga / flower
    `<svg viewBox="0 0 64 64" width="46" height="46"><g fill="#f06292"><circle cx="32" cy="16" r="9"/><circle cx="48" cy="32" r="9"/><circle cx="32" cy="48" r="9"/><circle cx="16" cy="32" r="9"/></g><circle cx="32" cy="32" r="8" fill="#fff0f5"/><circle cx="32" cy="32" r="4" fill="#c2185b"/></svg>`,
    // donat
    `<svg viewBox="0 0 64 64" width="50" height="50"><circle cx="32" cy="32" r="26" fill="#f48fb1"/><circle cx="32" cy="32" r="11" fill="#fff0f5"/><path d="M10 26c4-12 16-18 27-15 9 2 16 9 18 18-8-6-15-3-22 0-9 4-17 1-23-3z" fill="#e91e8c" opacity="0.55"/></svg>`,
    // croissant
    `<svg viewBox="0 0 64 64" width="52" height="52"><path d="M6 40c4-18 20-30 38-26 8 2 13 8 14 14-6-4-13-4-19 0-5 3-7 9-13 11-7 3-15 4-20 1z" fill="#f8bbd0"/><path d="M10 38c4-15 18-25 33-22" stroke="#e91e8c" stroke-width="2" fill="none" opacity="0.6"/></svg>`,
    // cangkir teh
    `<svg viewBox="0 0 64 64" width="48" height="48"><path d="M10 26h36l-3 18a8 8 0 0 1-8 7H21a8 8 0 0 1-8-7z" fill="#fff"/><path d="M10 26h36v5H10z" fill="#f06292"/><path d="M46 30c8-2 12 8 4 12" stroke="#e91e8c" stroke-width="3" fill="none"/><path d="M18 10c2 4-2 5 0 9M28 10c2 4-2 5 0 9M38 10c2 4-2 5 0 9" stroke="#f48fb1" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`,
  ];

  function setupDekorasi() {
    if ($(".cc-decor-layer")) return;
    const layer = document.createElement("div");
    layer.className = "cc-decor-layer";

    const posisi = [
      { top: "8%", left: "4%" }, { top: "18%", left: "88%" },
      { top: "62%", left: "2%" }, { top: "75%", left: "90%" },
      { top: "40%", left: "94%" }, { top: "85%", left: "10%" },
      { top: "5%", left: "50%" },
    ];

    posisi.forEach((pos, i) => {
      const wrap = document.createElement("div");
      wrap.className = "cc-decor";
      wrap.style.top = pos.top;
      wrap.style.left = pos.left;
      wrap.style.setProperty("--rot", (i % 2 === 0 ? "-6deg" : "6deg"));
      wrap.style.animationDelay = `${i * 0.6}s, ${i * 0.4}s`;
      wrap.innerHTML = decorSVGs[i % decorSVGs.length];
      layer.appendChild(wrap);
    });

    document.body.appendChild(layer);
  }

  /* ------------------------------------------------------------
     1c. KONFETI 🎉 (saat reservasi berhasil dibuat)
  ------------------------------------------------------------ */
  function tembakKonfeti() {
    const emoji = ["🌸", "🧁", "🍩", "🎉", "✨", "🍰"];
    const jumlah = 18;
    for (let i = 0; i < jumlah; i++) {
      const el = document.createElement("span");
      el.className = "cc-confetti";
      el.textContent = emoji[Math.floor(Math.random() * emoji.length)];
      el.style.left = Math.random() * 100 + "vw";
      el.style.animationDuration = 1.8 + Math.random() * 1.4 + "s";
      el.style.fontSize = 1 + Math.random() * 1.1 + "rem";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3400);
    }
  }
  window.ccKonfeti = tembakKonfeti;

  /* ------------------------------------------------------------
     2. TRANSISI HALAMAN (fade lembut antar halaman)
  ------------------------------------------------------------ */
  function setupPageTransition() {
    // overlay manis saat berpindah halaman
    let overlay = $("#ccPageOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "ccPageOverlay";
      overlay.innerHTML = '<span class="overlay-emoji">🌸</span>';
      document.body.appendChild(overlay);
    }

    const links = $all('a[href$=".html"]');
    links.forEach((link) => {
      // hanya untuk navigasi internal di website ini, bukan link luar/aksi tabel
      if (link.target === "_blank" || link.hasAttribute("download")) return;

      link.addEventListener("click", function (e) {
        const href = link.getAttribute("href");
        if (!href || href.startsWith("#")) return;

        e.preventDefault();
        document.body.classList.add("page-leave");
        overlay.classList.add("show");

        setTimeout(() => {
          window.location.href = href;
        }, 280);
      });
    });
  }

  /* ------------------------------------------------------------
     3. VALIDASI FORM CUTE
  ------------------------------------------------------------ */
  function tampilkanError(input, pesan) {
    const group = input.closest(".form-group");
    if (!group) return;
    group.classList.add("field-error");
    let msgEl = group.querySelector(".field-error-msg");
    if (!msgEl) {
      msgEl = document.createElement("div");
      msgEl.className = "field-error-msg";
      group.appendChild(msgEl);
    }
    msgEl.textContent = pesan;
  }

  function hapusError(input) {
    const group = input.closest(".form-group");
    if (!group) return;
    group.classList.remove("field-error");
  }

  function validasiForm(form) {
    let valid = true;
    let firstInvalid = null;

    $all("input, select, textarea", form).forEach((input) => {
      if (!input.hasAttribute("required") && input.value.trim() === "") {
        hapusError(input);
        return;
      }

      let pesan = "";
      if (input.hasAttribute("required") && input.value.trim() === "") {
        pesan = "Wah, bagian ini belum diisi nih 🌸";
      } else if (input.type === "tel" && input.value.trim() !== "") {
        const bersih = input.value.replace(/[\s-]/g, "");
        if (!/^0[0-9]{9,13}$/.test(bersih)) {
          pesan = "Nomor telepon-nya kayaknya belum pas, coba cek lagi ya";
        }
      } else if (input.type === "email" && input.value.trim() !== "") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
          pesan = "Format emailnya kurang pas nih";
        }
      } else if (input.type === "date" && input.value) {
        const dipilih = new Date(input.value + "T00:00:00");
        const hariIni = new Date();
        hariIni.setHours(0, 0, 0, 0);
        if (dipilih < hariIni) {
          pesan = "Tanggalnya sudah lewat, pilih tanggal hari ini atau setelahnya ya";
        }
      }

      if (pesan) {
        valid = false;
        tampilkanError(input, pesan);
        if (!firstInvalid) firstInvalid = input;
      } else {
        hapusError(input);
      }
    });

    if (firstInvalid) firstInvalid.focus();
    return valid;
  }

  function setupLiveValidation(form) {
    $all("input, select, textarea", form).forEach((input) => {
      input.addEventListener("blur", () => validasiForm(form));
      input.addEventListener("input", () => {
        if (input.closest(".form-group").classList.contains("field-error")) {
          hapusError(input);
        }
      });
    });
  }

  /* ------------------------------------------------------------
     4. HALAMAN: booking.html → simpan reservasi baru
  ------------------------------------------------------------ */
  function setupFormReservasi() {
    const form = $("#formReservasi");
    if (!form) return;

    setupLiveValidation(form);
    // menambahkan meja real time dan tanggal (dementhia)
    const inputTanggal = $("#tanggal", form);
if (inputTanggal) {
  const hariIni = new Date().toISOString().split("T")[0];
  inputTanggal.min = hariIni;
  inputTanggal.addEventListener("change", updateKetersediaan);
  const inputArea = $("#area", form);
  if (inputArea) inputArea.addEventListener("change", updateKetersediaan);
}

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (!validasiForm(form)) {
        showToast({
          type: "error",
          title: "Oops, ada yang kurang!",
          message: "Coba cek lagi bagian yang ditandai merah ya~",
          emoji: "🙈",
        });
        return;
      }

      const list = getReservasi();
      const data = {
        id: Date.now(),
        kode: buatKodeBaru(list),
        nama: $("#nama", form).value.trim(),
        telepon: $("#telepon", form).value.trim(),
        email: $("#email", form).value.trim(),
        tanggal: $("#tanggal", form).value,
        waktu: $("#waktu", form).value,
        tamu: $("#tamu", form).value,
        area: $("#area", form).value,
        acara: $("#acara", form).value,
        catatan: $("#catatan", form).value.trim(),
        status: "menunggu",
      };

      list.push(data);
      saveReservasi(list);

      tembakKonfeti();
      showPopup({
        jenis: "berhasil",
        emoji: "🎉",
        title: "Reservasi Terkirim!",
        message: `Terima kasih, <strong>${data.nama}</strong>! Mejamu sudah kami catat ya 🌸`,
        kode: data.kode,
        tombol: "Lihat Riwayat →",
        onClose: () => {
          document.body.classList.add("page-leave");
          setTimeout(() => { window.location.href = "riwayat.html"; }, 260);
        },
      });

      form.reset();
      $all(".form-group", form).forEach(hapusError);
    });
  }

  /* ------------------------------------------------------------
     5. HALAMAN: riwayat.html → render tabel, filter, hapus
  ------------------------------------------------------------ */
  const seedData = [
    { id: 1, kode: "CC-001", nama: "Andi Wirawan", tanggal: "2025-04-15", waktu: "12:00", tamu: "4", area: "indoor", status: "selesai" },
    { id: 2, kode: "CC-002", nama: "Sari Dewi", tanggal: "2025-04-18", waktu: "19:00", tamu: "2", area: "outdoor", status: "konfirmasi" },
    { id: 3, kode: "CC-003", nama: "Rudi Hartono", tanggal: "2025-04-20", waktu: "10:00", tamu: "6", area: "vip", status: "konfirmasi" },
    { id: 4, kode: "CC-004", nama: "Maya Putri", tanggal: "2025-04-22", waktu: "14:00", tamu: "3", area: "indoor", status: "menunggu" },
    { id: 5, kode: "CC-005", nama: "Budi Santoso", tanggal: "2025-04-10", waktu: "08:00", tamu: "1", area: "indoor", status: "batal" },
    { id: 6, kode: "CC-006", nama: "Lina Marlina", tanggal: "2025-04-25", waktu: "18:00", tamu: "5", area: "outdoor", status: "menunggu" },
    { id: 7, kode: "CC-007", nama: "Hendra Pratama", tanggal: "2025-04-28", waktu: "13:00", tamu: "2", area: "vip", status: "konfirmasi" },
    { id: 8, kode: "CC-008", nama: "Dian Rahayu", tanggal: "2025-04-05", waktu: "16:00", tamu: "4", area: "indoor", status: "selesai" },
  ];

  function semuaData() {
    // gabungkan data contoh (statis) + override (edit/batal/hapus)-nya
    // dengan data baru yang dibuat lewat form reservasi
    const overrides = getSeedOverrides();
    const seedAdjusted = seedData
      .filter((r) => !(overrides[r.id] && overrides[r.id].deleted))
      .map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r));
    return seedAdjusted.concat(getReservasi());
  }

  let baruDibuatId = null;
  // menambahkan pagination dinamis (dementhia)
  let currentPage = 1;
  const ITEMS_PER_PAGE = 5;


// menambahkan fungsi pagination dinamis (dementhia)
function renderPagination(totalPages) {
  const nav = document.querySelector(".pagination");
  if (!nav) return;

  nav.innerHTML = "";

  if (totalPages <= 1) return;

  // Tombol Prev
  const prev = document.createElement("a");
  prev.href = "#";
  prev.textContent = "‹";
  prev.className = currentPage === 1 ? "disabled" : "";
  prev.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentPage > 1) { currentPage--; renderTabelRiwayat(ambilFilter()); }
  });
  nav.appendChild(prev);

  // Tombol Angka
  for (let i = 1; i <= totalPages; i++) {
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = i;
    if (i === currentPage) a.className = "aktif";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      currentPage = i;
      renderTabelRiwayat(ambilFilter());
    });
    nav.appendChild(a);
  }

  // Tombol Next
  const next = document.createElement("a");
  next.href = "#";
  next.textContent = "›";
  next.className = currentPage === totalPages ? "disabled" : "";
  next.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentPage < totalPages) { currentPage++; renderTabelRiwayat(ambilFilter()); }
  });
  nav.appendChild(next);
}

// menambahkan meja real time dan tanggal (dementhia)

function updateKetersediaan() {
  const inputTanggal = $("#tanggal");
  if (!inputTanggal) return;

  const tanggalDipilih = inputTanggal.value;
  const tabelBody = document.querySelector(".ketersediaan table tbody");
  if (!tabelBody) return;

  const kapasitas = { indoor: 40, outdoor: 20, vip: 10 };

  const slots = [
    { label:"08.00 – 10.00", jam:["08:00","09:00"] },
    { label:"10.00 – 12.00", jam:["10:00","11:00"] },
    { label:"12.00 – 14.00", jam:["12:00","13:00"] },
    { label:"14.00 – 16.00", jam:["14:00","15:00"] },
    { label:"16.00 – 18.00", jam:["16:00","17:00"] },
    { label:"18.00 – 20.00", jam:["18:00","19:00"] },
  ];

  const semua = semuaData().filter(r =>
    r.tanggal === tanggalDipilih &&
    r.status !== "batal"
  );

  function hitungTamu(slot, area) {
    return semua
      .filter(r => slot.jam.includes(r.waktu) && r.area === area)
      .reduce((total, r) => total + (parseInt(r.tamu) || 1), 0);
  }

  function badgeKetersediaan(terpakai, maks) {
    const sisa = maks - terpakai;
    const persen = sisa / maks;
    if (sisa <= 0)      return `<span class="badge badge-penuh">Penuh</span>`;
    if (persen <= 0.5)  return `<span class="badge badge-terbatas">Terbatas (${sisa} kursi)</span>`;
    return `<span class="badge badge-tersedia">Tersedia (${sisa} kursi)</span>`;
  }

  const hariIni = new Date().toISOString().split("T")[0];

  tabelBody.innerHTML = slots.map(slot => {
    if (!tanggalDipilih || tanggalDipilih < hariIni) {
      return `
        <tr>
          <td>${slot.label}</td>
          <td colspan="3" style="text-align:center; color:var(--text-soft); font-size:0.85rem;">
            — Pilih tanggal yang valid —
          </td>
        </tr>`;
    }

    const indoorTerpakai  = hitungTamu(slot, "indoor");
    const outdoorTerpakai = hitungTamu(slot, "outdoor");
    const vipTerpakai     = hitungTamu(slot, "vip");

    return `
      <tr>
        <td>${slot.label}</td>
        <td>${badgeKetersediaan(indoorTerpakai, kapasitas.indoor)}</td>
        <td>${badgeKetersediaan(outdoorTerpakai, kapasitas.outdoor)}</td>
        <td>${badgeKetersediaan(vipTerpakai, kapasitas.vip)}</td>
      </tr>`;
  }).join("");
}

  function renderTabelRiwayat(filter) {
    const tbody = $("#tbodyRiwayat");
    if (!tbody) return;

    let data = semuaData();

    if (filter) {
      if (filter.nama) {
        const q = filter.nama.toLowerCase();
        data = data.filter((r) => r.nama.toLowerCase().includes(q));
      }
      if (filter.tanggal) {
        data = data.filter((r) => r.tanggal === filter.tanggal);
      }
      if (filter.status) {
        data = data.filter((r) => r.status === filter.status);
      }
      if (filter.area) {
        data = data.filter((r) => r.area === filter.area);
      }
    }

    // urutkan: terbaru dulu (berdasarkan id)
    data = data.slice().sort((a, b) => b.id - a.id);
    // menambahkan pagination dinamis (dementhia)
    // Hitung total halaman
    const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = 1;

    // Potong data sesuai halaman aktif
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    data = data.slice(start, start + ITEMS_PER_PAGE);

    tbody.innerHTML = "";

    if (data.length === 0) {
      tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="9">🌸 Belum ada reservasi yang cocok. Coba ubah filter atau buat reservasi baru ya~</td>
        </tr>`;
    } else {
      data.forEach((r, idx) => {
        const tr = document.createElement("tr");
        if (r.id === baruDibuatId) tr.classList.add("row-new");

        let aksi = `<a href="#" class="btn btn-outline btn-sm" data-aksi="detail">Detail</a>`;
        aksi += `<button type="button" class="btn-edit" data-aksi="edit" data-id="${r.id}">Edit</button>`;
        if (r.status !== "batal") {
          aksi += `<a href="#" class="btn btn-danger" data-aksi="batal" data-id="${r.id}">Batal</a>`;
        }
        aksi += `<button type="button" class="btn-hapus" data-aksi="hapus" data-id="${r.id}">Hapus</button>`;

        tr.innerHTML = `
          <td>${idx + 1}</td>
          <td><strong>${r.kode}</strong></td>
          <td>${r.nama}</td>
          <td>${formatTanggal(r.tanggal)}</td>
          <td>${(r.waktu || "-").replace(":", ".")}</td>
          <td>${r.tamu} orang</td>
          <td>${labelArea(r.area)}</td>
          <td>${badgeStatus(r.status)}</td>
          <td><div class="aksi-group">${aksi}</div></td>
        `;
        tbody.appendChild(tr);
      });
    }

    baruDibuatId = null;

    const info = $("#infoHasil");
    if (info) info.textContent = `(${data.length} hasil)`;

    renderPagination(totalPages);

    perbaruiStatistik();
  }

  function perbaruiStatistik() {
    const data = semuaData();
    const total = data.length;
    const konfirmasi = data.filter((r) => r.status === "konfirmasi" || r.status === "selesai").length;
    const menunggu = data.filter((r) => r.status === "menunggu").length;
    const batal = data.filter((r) => r.status === "batal").length;

    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set("#statTotal", total);
    set("#statKonfirmasi", konfirmasi);
    set("#statMenunggu", menunggu);
    set("#statDibatalkan", batal);
  }

  function ambilFilter() {
    return {
      nama: ($("#cari-nama") || {}).value || "",
      tanggal: ($("#filter-tanggal") || {}).value || "",
      status: ($("#filter-status") || {}).value || "",
      area: ($("#filter-area") || {}).value || "",
    };
  }

  /* -------- Modal Edit Reservasi -------- */
  function ensureModalEdit() {
    let overlay = $("#ccModalEdit");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "ccModalEdit";
    overlay.className = "cc-modal-overlay";
    overlay.innerHTML = `
      <div class="cc-modal" role="dialog" aria-modal="true" aria-labelledby="ccModalTitle">
        <div class="cc-modal-header">
          <h2 id="ccModalTitle">✏️ Edit Reservasi</h2>
          <button type="button" class="cc-modal-close" id="ccModalCloseBtn" aria-label="Tutup">✕</button>
        </div>
        <form id="ccFormEdit" novalidate>
          <input type="hidden" id="edit-id" />
          <div class="form-group">
            <label for="edit-nama">Nama Lengkap *</label>
            <input type="text" id="edit-nama" required />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="edit-telepon">No. Telepon *</label>
              <input type="tel" id="edit-telepon" required />
            </div>
            <div class="form-group">
              <label for="edit-email">Alamat Email</label>
              <input type="email" id="edit-email" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="edit-tanggal">Tanggal Kunjungan *</label>
              <input type="date" id="edit-tanggal" required />
            </div>
            <div class="form-group">
              <label for="edit-waktu">Jam Kunjungan *</label>
              <select id="edit-waktu" required>
                <option value="">-- Pilih Jam --</option>
                ${["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"]
        .map((j) => `<option value="${j}">${j.replace(":", ".")} WIB</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="edit-tamu">Jumlah Tamu *</label>
              <select id="edit-tamu" required>
                <option value="">-- Pilih --</option>
                <option value="1">1 Orang</option><option value="2">2 Orang</option>
                <option value="3">3 Orang</option><option value="4">4 Orang</option>
                <option value="5">5 Orang</option><option value="6">6 Orang</option>
                <option value="7">7 – 10 Orang</option><option value="10">Lebih dari 10 Orang</option>
              </select>
            </div>
            <div class="form-group">
              <label for="edit-area">Area Tempat Duduk *</label>
              <select id="edit-area" required>
                <option value="">-- Pilih Area --</option>
                <option value="indoor">Indoor (AC)</option>
                <option value="outdoor">Outdoor (Taman)</option>
                <option value="vip">Ruang VIP</option>
                <option value="bebas">Tidak Ada Preferensi</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="edit-status">Status Reservasi *</label>
            <select id="edit-status" required>
              <option value="menunggu">Menunggu</option>
              <option value="konfirmasi">Terkonfirmasi</option>
              <option value="selesai">Selesai</option>
              <option value="batal">Dibatalkan</option>
            </select>
          </div>
          <div class="form-group">
            <label for="edit-catatan">Catatan</label>
            <textarea id="edit-catatan"></textarea>
          </div>
          <div class="cc-modal-actions">
            <button type="button" class="btn btn-outline" id="ccModalCancelBtn">Batal</button>
            <button type="submit" class="btn btn-primary">💾 Simpan Perubahan</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const tutup = () => overlay.classList.remove("show");
    $("#ccModalCloseBtn", overlay).addEventListener("click", tutup);
    $("#ccModalCancelBtn", overlay).addEventListener("click", tutup);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) tutup(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") tutup(); });

    $("#ccFormEdit", overlay).addEventListener("submit", function (e) {
      e.preventDefault();
      const form = e.target;
      if (!validasiForm(form)) {
        showToast({ type: "error", title: "Belum lengkap", message: "Cek lagi bagian yang ditandai merah ya~", emoji: "🙈" });
        return;
      }

      const id = Number($("#edit-id", form).value);
      const kode = $("#edit-id", form).dataset.kode || "";
      const fields = {
        nama: $("#edit-nama", form).value.trim(),
        telepon: $("#edit-telepon", form).value.trim(),
        email: $("#edit-email", form).value.trim(),
        tanggal: $("#edit-tanggal", form).value,
        waktu: $("#edit-waktu", form).value,
        tamu: $("#edit-tamu", form).value,
        area: $("#edit-area", form).value,
        status: $("#edit-status", form).value,
        catatan: $("#edit-catatan", form).value.trim(),
      };

      updateRecord(id, fields);
      tutup();
      renderTabelRiwayat(ambilFilter());

      showToast({
        type: "success",
        title: "Reservasi diperbarui ✏️",
        message: `Perubahan data ${kode} (${fields.nama}) berhasil disimpan.`,
        emoji: "💾",
      });
    });

    return overlay;
  }

  function bukaModalEdit(data) {
    const overlay = ensureModalEdit();
    $("#edit-id", overlay).value = data.id;
    $("#edit-id", overlay).dataset.kode = data.kode || "";
    $("#edit-nama", overlay).value = data.nama || "";
    $("#edit-telepon", overlay).value = data.telepon || "";
    $("#edit-email", overlay).value = data.email || "";
    $("#edit-tanggal", overlay).value = data.tanggal || "";
    $("#edit-waktu", overlay).value = data.waktu || "";
    $("#edit-tamu", overlay).value = data.tamu || "";
    $("#edit-area", overlay).value = data.area || "";
    $("#edit-status", overlay).value = data.status || "menunggu";
    $("#edit-catatan", overlay).value = data.catatan || "";

    $all(".form-group", overlay).forEach(hapusError);
    overlay.classList.add("show");
    setTimeout(() => $("#edit-nama", overlay).focus(), 200);
  }

  function setupHalamanRiwayat() {
    const tbody = $("#tbodyRiwayat");
    if (!tbody) return;

    // tandai data yang baru saja dibuat dari halaman booking (untuk efek highlight)
    const list = getReservasi();
    if (list.length) baruDibuatId = list[list.length - 1].id;

    renderTabelRiwayat();

    const form = $("#formFilter");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        renderTabelRiwayat(ambilFilter());
        showToast({ type: "info", message: "Filter diterapkan 🔍", duration: 1800 });
      });
    }

    const btnReset = $("#btnResetFilter");
    if (btnReset) {
      btnReset.addEventListener("click", function () {
        if (form) form.reset();
        renderTabelRiwayat();
        showToast({ type: "info", message: "Filter dikosongkan kembali 🌸", duration: 1800 });
      });
    }

    // event delegation untuk tombol Batal & Detail
    tbody.addEventListener("click", function (e) {
      const target = e.target.closest("[data-aksi]");
      if (!target) return;
      e.preventDefault();

      if (target.dataset.aksi === "detail") {
        showToast({
          type: "info",
          title: "Detail Reservasi",
          message: "Fitur detail lengkap akan segera tersedia. Untuk sekarang, info dapat dilihat langsung di tabel ya 🌸",
        });
        return;
      }

      if (target.dataset.aksi === "batal") {
        const id = Number(target.dataset.id);
        const semua = semuaData();
        const data = semua.find((r) => r.id === id);
        if (!data) return;

        showConfirmPopup({
          title: "Batalkan Reservasi? 📅",
          message: `Batalkan reservasi <strong>${data.kode}</strong> milik <strong>${data.nama}</strong>?<br><br>Meja yang sudah dipesan akan dilepas dan status berubah jadi <em>Dibatalkan</em>.`,
          kode: data.kode,
          emoji: "😢",
          okText: "📅 Ya, Batalkan",
          cancelText: "✕ Jangan Dulu",
          okClass: "cc-btn-batal-konfirmasi",
          onConfirm: () => {
            updateRecord(id, { status: "batal" });
            renderTabelRiwayat(ambilFilter());

            showPopup({
              jenis: "batal",
              emoji: "😢",
              title: "Reservasi Dibatalkan",
              message: `Reservasi <strong>${data.kode}</strong> milik ${data.nama} berhasil dibatalkan. Semoga lain kali bisa mampir lagi ya~`,
              tombol: "Oke, Mengerti",
            });
          },
        });
        return;
      }

      if (target.dataset.aksi === "edit") {
        const id = Number(target.dataset.id);
        const data = semuaData().find((r) => r.id === id);
        if (!data) return;
        bukaModalEdit(data);
        return;
      }

      if (target.dataset.aksi === "hapus") {
        const id = Number(target.dataset.id);
        const data = semuaData().find((r) => r.id === id);
        if (!data) return;

        showConfirmPopup({
          title: "Hapus Reservasi? 🗑️",
          message: `Yakin ingin menghapus reservasi <strong>${data.kode}</strong> milik <strong>${data.nama}</strong>?<br><br>Data akan hilang <em>selamanya</em> dan tidak bisa dikembalikan lagi! 💨`,
          kode: data.kode,
          onConfirm: () => {
            deleteRecordById(id);
            renderTabelRiwayat(ambilFilter());

            showToast({
              type: "info",
              title: "Reservasi dihapus 🗑️",
              message: `Data ${data.kode} (${data.nama}) telah dihapus permanen dari riwayat.`,
              emoji: "🗑️",
            });
          },
        });
      }
    });
  }

  /* ------------------------------------------------------------
     6. HALAMAN: beranda.html → status buka/tutup live
  ------------------------------------------------------------ */
  function setupStatusBuka() {
    const el = $("#statusBukaSekarang");
    if (!el) return;

    const sekarang = new Date();
    const hari = sekarang.getDay(); // 0 = Minggu
    const jam = sekarang.getHours() + sekarang.getMinutes() / 60;

    let buka, tutup;
    if (hari === 0) { buka = 9; tutup = 20; }
    else if (hari === 5) { buka = 8; tutup = 22; }
    else if (hari === 6) { buka = 9; tutup = 22; }
    else { buka = 8; tutup = 21; }

    const sedangBuka = jam >= buka && jam < tutup;

    if (sedangBuka) {
      el.textContent = `🟢 Kafe sedang BUKA sekarang — tutup pukul ${tutup}.00 WIB`;
    } else {
      const formatJam = (j) => String(j).padStart(2, "0") + ".00 WIB";
      el.textContent = jam < buka
        ? `🔴 Kafe belum buka — buka pukul ${formatJam(buka)} hari ini`
        : `🔴 Kafe sudah tutup hari ini — buka lagi besok pukul ${formatJam(buka)}`;
    }
  }

  /* ------------------------------------------------------------
     7. INIT
  ------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded", function () {
    setupDekorasi();
    setupPageTransition();
    setupFormReservasi();
    setupHalamanRiwayat();
    setupStatusBuka();
    // menambahkan setup hamburger (dementhia)
    setupHamburger();
    // menambahkan fitur meja real time dan tanggal (dementhia)
    updateKetersediaan();

    // sapaan kecil saat halaman dibuka (sekali per sesi biar tidak mengganggu)
    if (!sessionStorage.getItem("ccSudahSapa")) {
      setTimeout(() => {
        showToast({
          type: "info",
          title: "Hai, selamat datang! 👋",
          message: "Yuk jelajahi menu dan reservasi meja favoritmu di Cloudy Crumbs 🌸",
          duration: 4200,
        });
      }, 500);
      sessionStorage.setItem("ccSudahSapa", "1");
    }
  });

  /* ── Hamburger Menu ─ (dementhia) */
  function setupHamburger() {
    const btn = document.getElementById("hamburgerBtn");
    const ul = document.querySelector("nav ul");
    if (!btn || !ul) return;

    btn.addEventListener("click", () => {
      btn.classList.toggle("open");
      ul.classList.toggle("open");
    });

    // Tutup menu saat salah satu link diklik
    ul.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        btn.classList.remove("open");
        ul.classList.remove("open");
      });
    });
  }

})();
