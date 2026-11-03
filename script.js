/* ============================================================
   script.js  —  LOGIKA JAVASCRIPT (dipakai semua halaman)
   Setiap <body> punya atribut data-page="..." sehingga script ini
   tahu fungsi init mana yang harus dijalankan.
   Data diambil dari data.js:
     - dataPengguna      (akun login)
     - dataKatalogBuku   (katalog / stok)
     - dataTracking      (data pengiriman, kunci = nomor DO)
   ============================================================ */
"use strict";

/* ==================== 1. KONSTANTA & FUNGSI BANTU ==================== */
// Tahapan pengiriman untuk progress bar tracking
const TAHAP = ["Diproses", "Dikemas", "Dikirim", "Dalam Perjalanan", "Terkirim"];
// Level tiap status (1 s/d 5) = jumlah tahap yang sudah dicapai
const LEVEL_STATUS = { "Diproses": 1, "Dikemas": 2, "Dikirim": 3, "Dalam Perjalanan": 4, "Terkirim": 5 };
// Ongkos kirim berdasarkan jenis paket (dipakai di checkout)
const ONGKIR = { "Reguler": 15000, "Express": 30000, "Same Day": 50000 };
// Gambar pengganti jika cover buku tidak ditemukan
const COVER_DEFAULT = "img/cover-default.png";

const $  = (sel, induk = document) => induk.querySelector(sel);
const $$ = (sel, induk = document) => Array.from(induk.querySelectorAll(sel));

// Format angka menjadi rupiah, contoh: 180000 -> "Rp 180.000"
const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");

// Ubah teks harga "Rp 180.000" menjadi angka 180000 (buang semua selain digit)
const angka = (teks) => parseInt(String(teks).replace(/\D/g, ""), 10) || 0;

// Mencegah teks dari input pengguna dianggap sebagai tag HTML (keamanan dasar)
const escapeHtml = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "2025-08-25" -> "25 Agustus 2025"
const formatTanggal = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

// "2025-08-25 14:07:56" -> "25/08/2025 14:07"  (juga menoleransi format salah "2025-08 25 ...")
function formatWaktu(teks) {
  const m = String(teks).match(/(\d{4})-(\d{2})[-\s](\d{2})\s+(\d{2}:\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : String(teks);
}

// Tanggal hari ini (+ tambahHari) dalam format "YYYY-MM-DD"
function isoTanggal(tambahHari = 0) {
  const d = new Date();
  d.setDate(d.getDate() + tambahHari);
  const dua = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}
function waktuSekarang() {
  const d = new Date();
  const dua = (n) => String(n).padStart(2, "0");
  return `${isoTanggal(0)} ${dua(d.getHours())}:${dua(d.getMinutes())}:${dua(d.getSeconds())}`;
}

// Baca/tulis localStorage dalam bentuk JSON
function bacaStorage(kunci, awal) {
  try { const v = JSON.parse(localStorage.getItem(kunci)); return v === null ? awal : v; }
  catch (e) { return awal; }
}
const simpanStorage = (kunci, nilai) => localStorage.setItem(kunci, JSON.stringify(nilai));

const emailValid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Menampilkan / menghapus pesan error di bawah sebuah input (di dalam .form-group)
function setError(el, pesan) {
  const grup = el.closest(".form-group");
  if (!grup) return;
  grup.classList.toggle("error", Boolean(pesan));
  const kotak = $(".pesan-error", grup);
  if (kotak) kotak.textContent = pesan || "";
}
const bersihkanError = (form) => $$(".form-group", form).forEach((g) => { g.classList.remove("error"); });

// Membuat <img> cover buku (dengan gambar cadangan bila file tidak ada)
function buatCover(buku, kelas) {
  const img = document.createElement("img");
  img.src = buku.cover || COVER_DEFAULT;
  img.alt = "Sampul buku " + buku.namaBarang;
  img.className = kelas;
  img.addEventListener("error", () => { img.src = COVER_DEFAULT; }, { once: true });
  return img;
}

/* ==================== 2. MODAL BOX & ALERT BOX ==================== */
const bukaModal  = (id) => { const m = document.getElementById(id); if (m) m.classList.add("tampil"); };
const tutupModal = (id) => { const m = document.getElementById(id); if (m) m.classList.remove("tampil"); };

// Alert box buatan sendiri (dibuat lewat DOM) pengganti alert() bawaan browser
function tampilAlert(pesan, tipe = "info", judul = "") {
  const judulDefault = { sukses: "Berhasil", error: "Terjadi Kesalahan", info: "Informasi" };
  const ikon = { sukses: "✔", error: "✖", info: "ℹ" };
  let overlay = document.getElementById("alertBox");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "alertBox";
    overlay.className = "modal";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<div class="modal-isi modal-kecil">' +
      '<div class="alert-ikon" id="alertIkon"></div>' +
      '<h2 id="alertJudul"></h2><p id="alertPesan"></p>' +
      '<button type="button" class="btn" id="alertOk">OK</button></div>';
    document.body.appendChild(overlay);
    $("#alertOk").addEventListener("click", () => overlay.classList.remove("tampil"));
  }
  $("#alertIkon").className = "alert-ikon " + tipe;
  $("#alertIkon").textContent = ikon[tipe] || ikon.info;
  $("#alertJudul").textContent = judul || judulDefault[tipe] || judulDefault.info;
  $("#alertPesan").textContent = pesan;
  overlay.classList.add("tampil");
  $("#alertOk").focus();
}

// Event delegation: satu listener untuk semua tombol buka/tutup modal
document.addEventListener("click", (e) => {
  const pembuka = e.target.closest("[data-buka]");
  if (pembuka) bukaModal(pembuka.dataset.buka);
  const penutup = e.target.closest("[data-tutup]");
  if (penutup) tutupModal(penutup.dataset.tutup);
  // klik di area gelap (di luar kotak) menutup modal
  if (e.target.classList.contains("modal")) e.target.classList.remove("tampil");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $$(".modal.tampil").forEach((m) => m.classList.remove("tampil"));
});

/* ==================== 3. DATA GABUNGAN (data.js + localStorage) ==================== */
// Akun: dari dataPengguna + akun yang mendaftar lewat modal "Daftar"
const getUsers = () => dataPengguna.concat(bacaStorage("penggunaBaru", []));

// Katalog: dataKatalogBuku + buku tambahan, stok sudah dikurangi pesanan yang dibuat
function getKatalog() {
  const tambahan = bacaStorage("stokBaru", []);
  const terjual = bacaStorage("stokTerjual", {});
  return dataKatalogBuku.concat(tambahan).map((b) =>
    Object.assign({}, b, { stok: Math.max(0, b.stok - (terjual[b.kodeBarang] || 0)) }));
}

// Tracking: dataTracking (objek berkunci nomor DO) + pesanan baru dari checkout
const getSemuaTracking = () => Object.assign({}, bacaStorage("pesananBaru", {}), dataTracking);
const daftarTracking = () =>
  Object.values(getSemuaTracking()).sort((a, b) =>
    b.tanggalKirim.localeCompare(a.tanggalKirim) || b.nomorDO.localeCompare(a.nomorDO));

function getUserLogin() {
  try { return JSON.parse(sessionStorage.getItem("userLogin")); } catch (e) { return null; }
}

// Menentukan status akhir + level progress dari satu data tracking
function statusAkhir(t) {
  const rute = t.perjalanan || [];
  const terakhir = rute.length ? rute[rute.length - 1].keterangan : "";
  let level = LEVEL_STATUS[t.status] || 1;
  if (/^selesai/i.test(terakhir)) level = 5;   // catatan terakhir "Selesai Antar" = sudah diterima
  return { level, label: TAHAP[level - 1], kelas: level >= 5 ? "sukses" : level >= 3 ? "proses" : "baru" };
}

/* ==================== 4. TITIK MASUK (dijalankan saat halaman siap) ==================== */
document.addEventListener("DOMContentLoaded", () => {
  const halaman = document.body.dataset.page;

  // Semua halaman selain login hanya boleh dibuka setelah login
  if (halaman !== "login") {
    const user = getUserLogin();
    if (!user) { window.location.href = "index.html"; return; }
    const nama = $("#namaUser");
    if (nama) nama.textContent = user.nama;
    const btnKeluar = $("#btnLogout");
    if (btnKeluar) btnKeluar.addEventListener("click", () => {
      sessionStorage.removeItem("userLogin");
      window.location.href = "index.html";
    });
  }

  const daftarInit = {
    login: initLogin, dashboard: initDashboard, stok: initStok,
    checkout: initCheckout, tracking: initTracking
  };
  if (daftarInit[halaman]) daftarInit[halaman]();
});

/* ==================== 5. HALAMAN LOGIN (index.html) ==================== */
function initLogin() {
  const form = $("#formLogin");

  // Checkbox "tampilkan password"
  $("#tampilPass").addEventListener("change", (e) => {
    $("#password").type = e.target.checked ? "text" : "password";
  });

  // --- Login ---
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    bersihkanError(form);
    const email = $("#email").value.trim().toLowerCase();
    const pass = $("#password").value;
    let ok = true;

    if (!email) { setError($("#email"), "Email wajib diisi."); ok = false; }
    else if (!emailValid(email)) { setError($("#email"), "Format email tidak valid."); ok = false; }
    if (!pass) { setError($("#password"), "Password wajib diisi."); ok = false; }
    if (!ok) return;

    const user = getUsers().find((u) => u.email.toLowerCase() === email && u.password === pass);
    if (!user) {
      tampilAlert("Email/password yang anda masukkan salah", "error", "Login Gagal");
      return;
    }
    sessionStorage.setItem("userLogin", JSON.stringify({ nama: user.nama, email: user.email, role: user.role }));
    window.location.href = "dashboard.html";
  });

  // --- Modal Lupa Password ---
  const formLupa = $("#formLupa");
  formLupa.addEventListener("submit", (e) => {
    e.preventDefault();
    bersihkanError(formLupa);
    const email = $("#emailLupa").value.trim().toLowerCase();
    if (!emailValid(email)) { setError($("#emailLupa"), "Masukkan email yang valid."); return; }
    if (!getUsers().some((u) => u.email.toLowerCase() === email)) {
      setError($("#emailLupa"), "Email tidak terdaftar."); return;
    }
    tutupModal("modalLupa");
    formLupa.reset();
    tampilAlert("Tautan reset password (simulasi) telah dikirim ke " + email, "sukses", "Email Terkirim");
  });

  // --- Modal Daftar ---
  const formDaftar = $("#formDaftar");
  formDaftar.addEventListener("submit", (e) => {
    e.preventDefault();
    bersihkanError(formDaftar);
    const nama = $("#dNama").value.trim();
    const email = $("#dEmail").value.trim().toLowerCase();
    const pass = $("#dPass").value;
    const pass2 = $("#dPass2").value;
    let ok = true;

    if (nama.length < 3) { setError($("#dNama"), "Nama minimal 3 karakter."); ok = false; }
    if (!emailValid(email)) { setError($("#dEmail"), "Format email tidak valid."); ok = false; }
    else if (getUsers().some((u) => u.email.toLowerCase() === email)) {
      setError($("#dEmail"), "Email sudah terdaftar."); ok = false;
    }
    if (pass.length < 6) { setError($("#dPass"), "Password minimal 6 karakter."); ok = false; }
    if (pass2 !== pass) { setError($("#dPass2"), "Konfirmasi password tidak sama."); ok = false; }
    if (!ok) return;

    const baru = bacaStorage("penggunaBaru", []);
    baru.push({ id: dataPengguna.length + baru.length + 1, nama, email, password: pass, role: "User" });
    simpanStorage("penggunaBaru", baru);
    tutupModal("modalDaftar");
    formDaftar.reset();
    tampilAlert("Akun berhasil dibuat. Silakan login dengan email tersebut.", "sukses", "Pendaftaran Berhasil");
    $("#email").value = email;
  });
}

/* ==================== 6. DASHBOARD (dashboard.html) ==================== */
// Greeting berdasarkan jam lokal komputer
function sapaan() {
  const jam = new Date().getHours();
  if (jam >= 4 && jam < 11) return "Selamat Pagi";
  if (jam >= 11 && jam < 15) return "Selamat Siang";
  if (jam >= 15 && jam < 18) return "Selamat Sore";
  return "Selamat Malam";
}

function initDashboard() {
  const user = getUserLogin();
  $("#greeting").textContent = `${sapaan()}, ${user.nama}!`;
  $("#infoRole").textContent = "Masuk sebagai " + (user.role || "User") + " — " + user.email;

  const tampilJam = () => {
    $("#jamLokal").textContent = new Date().toLocaleString("id-ID", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  };
  tampilJam();
  setInterval(tampilJam, 1000);

  // Rak "Katalog Pilihan": cover buku dibuat lewat DOM dari dataKatalogBuku
  const rak = $("#rakBuku");
  getKatalog().slice(0, 6).forEach((b) => {
    const fig = document.createElement("figure");
    const cap = document.createElement("figcaption");
    cap.textContent = b.namaBarang;
    fig.append(buatCover(b, "cover-besar"), cap);
    rak.appendChild(fig);
  });

  $("#kartuLaporan").addEventListener("click", () => { isiLaporan(); bukaModal("modalLaporan"); });
  $("#kartuHistory").addEventListener("click", () => {
    $("#cariHistory").value = "";
    isiHistory("");
    bukaModal("modalHistory");
  });
  $("#cariHistory").addEventListener("input", (e) => isiHistory(e.target.value));
}

// Laporan Pemesanan = ringkasan angka
function isiLaporan() {
  const data = daftarTracking();
  const omzet = data.reduce((jml, t) => jml + angka(t.total), 0);
  const selesai = data.filter((t) => statusAkhir(t).level >= 5).length;
  const dalamProses = data.length - selesai;

  $("#statLaporan").innerHTML =
    `<div class="stat"><b>${data.length}</b><small>Total Pesanan</small></div>` +
    `<div class="stat"><b>${rupiah(omzet)}</b><small>Total Pembayaran</small></div>` +
    `<div class="stat"><b>${selesai}</b><small>Sudah Diterima</small></div>` +
    `<div class="stat"><b>${dalamProses}</b><small>Dalam Proses</small></div>`;

  // Rekap per ekspedisi
  const rekap = {};
  data.forEach((t) => {
    rekap[t.ekspedisi] = rekap[t.ekspedisi] || { jumlah: 0, total: 0 };
    rekap[t.ekspedisi].jumlah++;
    rekap[t.ekspedisi].total += angka(t.total);
  });
  $("#tbodyLaporan").innerHTML = Object.keys(rekap).map((eks) =>
    `<tr><td>${escapeHtml(eks)}</td><td class="tengah">${rekap[eks].jumlah}</td>` +
    `<td class="kanan">${rupiah(rekap[eks].total)}</td></tr>`).join("");
}

// History Transaksi = daftar detail semua pesanan (bisa dicari)
function isiHistory(kata) {
  const q = kata.trim().toLowerCase();
  const data = daftarTracking().filter((t) => (t.nomorDO + " " + t.nama).toLowerCase().includes(q));
  const tbody = $("#tbodyHistory");
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="kosong">Transaksi tidak ditemukan.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((t) => {
    const st = statusAkhir(t);
    return `<tr><td>${formatTanggal(t.tanggalKirim)}</td><td>${escapeHtml(t.nomorDO)}</td>` +
      `<td>${escapeHtml(t.nama)}</td><td>${escapeHtml(t.ekspedisi)}</td>` +
      `<td class="kanan">${escapeHtml(t.total)}</td>` +
      `<td><span class="badge ${st.kelas}">${st.label}</span></td>` +
      `<td class="tengah"><a href="tracking.html?do=${encodeURIComponent(t.nomorDO)}">Lacak</a></td></tr>`;
  }).join("");
}

/* ==================== 7. STOK / KATALOG (stok.html) ==================== */
function initStok() {
  const tbody = $("#tbodyStok");
  const formStok = $("#formStok");

  // Membuat satu elemen <td> berisi teks
  const buatTd = (teks, kelas) => {
    const td = document.createElement("td");
    td.textContent = teks;
    if (kelas) td.className = kelas;
    return td;
  };

  // Badge status stok
  function buatBadgeStok(stok) {
    const span = document.createElement("span");
    span.className = "badge " + (stok === 0 ? "habis" : stok < 200 ? "proses" : "sukses");
    span.textContent = stok === 0 ? "Habis" : stok < 200 ? "Terbatas" : "Tersedia";
    return span;
  }

  // Membuat satu baris <tr> lengkap dengan DOM (createElement + append)
  function buatBaris(buku) {
    const tr = document.createElement("tr");
    if (buku.baru) tr.classList.add("baris-baru");

    const tdCover = document.createElement("td");
    tdCover.appendChild(buatCover(buku, "cover"));

    const tdStok = buatTd(buku.stok + " ", "tengah");
    tdStok.appendChild(buatBadgeStok(buku.stok));

    const tdAksi = document.createElement("td");
    tdAksi.className = "tengah";
    if (buku.baru) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-kecil btn-bahaya";
      btn.textContent = "Hapus";
      btn.addEventListener("click", () => {
        if (!confirm(`Hapus "${buku.namaBarang}" dari daftar stok?`)) return;
        simpanStorage("stokBaru", bacaStorage("stokBaru", []).filter((b) => b.kodeBarang !== buku.kodeBarang));
        tr.remove();
        perbaruiTabel();
      });
      tdAksi.appendChild(btn);
    } else {
      tdAksi.textContent = "—";
    }

    tr.append(
      buatTd("", "tengah no"), tdCover, buatTd(buku.kodeBarang), buatTd(buku.namaBarang),
      buatTd(buku.jenisBarang), buatTd(buku.edisi, "tengah"), tdStok,
      buatTd(buku.harga, "kanan"), tdAksi
    );
    return tr;
  }

  // Nomor urut ulang + ringkasan angka di atas tabel
  function perbaruiTabel() {
    $$("tr", tbody).forEach((tr, i) => { $(".no", tr).textContent = i + 1; });
    const data = getKatalog();
    $("#sumJudul").textContent = data.length;
    $("#sumStok").textContent = data.reduce((j, b) => j + b.stok, 0).toLocaleString("id-ID");
    $("#sumHabis").textContent = data.filter((b) => b.stok === 0).length;
  }

  // Render awal dari data.js (dataKatalogBuku) + buku tambahan di localStorage
  getKatalog().forEach((buku) => tbody.appendChild(buatBaris(buku)));
  perbaruiTabel();

  // Pencarian (menyembunyikan baris yang tidak cocok)
  $("#cariStok").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$("tr", tbody).forEach((tr) => { tr.hidden = !tr.textContent.toLowerCase().includes(q); });
  });

  // Tambah baris stok baru
  formStok.addEventListener("submit", (e) => {
    e.preventDefault();
    bersihkanError(formStok);
    const kode = $("#kode").value.trim().toUpperCase();
    const nama = $("#nama").value.trim();
    const jenis = $("#jenis").value;
    const edisiVal = $("#edisi").value;
    const stokVal = $("#stok").value;
    const harga = Number($("#harga").value);
    const edisi = Number(edisiVal);
    const stok = Number(stokVal);
    let ok = true;

    if (!/^[A-Z]{4}[0-9]{4}$/.test(kode)) { setError($("#kode"), "Format: 4 huruf + 4 angka, contoh ASIP4301."); ok = false; }
    else if (getKatalog().some((b) => b.kodeBarang === kode)) { setError($("#kode"), "Kode barang sudah dipakai."); ok = false; }
    if (nama.length < 3) { setError($("#nama"), "Nama barang minimal 3 karakter."); ok = false; }
    if (!jenis) { setError($("#jenis"), "Pilih jenis barang."); ok = false; }
    if (edisiVal === "" || !Number.isInteger(edisi) || edisi < 1 || edisi > 20) { setError($("#edisi"), "Edisi 1 sampai 20."); ok = false; }
    if (stokVal === "" || !Number.isInteger(stok) || stok < 0) { setError($("#stok"), "Stok harus bilangan bulat ≥ 0."); ok = false; }
    if (!(harga > 0)) { setError($("#harga"), "Harga harus lebih dari 0."); ok = false; }
    if (!ok) { tampilAlert("Data belum valid. Periksa kolom yang ditandai merah.", "error", "Validasi Gagal"); return; }

    // Objek baru memakai nama properti yang sama dengan data.js
    const bukuBaru = {
      kodeBarang: kode, namaBarang: nama, jenisBarang: jenis, edisi: String(edisi),
      stok, harga: rupiah(harga), cover: COVER_DEFAULT, baru: true
    };
    const simpan = bacaStorage("stokBaru", []);
    simpan.push(bukuBaru);
    simpanStorage("stokBaru", simpan);

    tbody.appendChild(buatBaris(bukuBaru));
    perbaruiTabel();
    formStok.reset();
    tampilAlert(`Buku "${nama}" berhasil ditambahkan ke stok.`, "sukses");
  });
}

/* ==================== 8. CHECKOUT / PEMESANAN (checkout.html) ==================== */
function initCheckout() {
  let keranjang = [];
  try { keranjang = JSON.parse(sessionStorage.getItem("keranjang")) || []; } catch (e) { keranjang = []; }
  const simpanKeranjang = () => sessionStorage.setItem("keranjang", JSON.stringify(keranjang));

  const pilih = $("#pilihBuku");
  const tbody = $("#tbodyKeranjang");
  const stokBuku = (kode) => (getKatalog().find((b) => b.kodeBarang === kode) || { stok: 0 }).stok;

  // Isi dropdown buku (hanya yang stoknya > 0)
  function isiPilihan() {
    pilih.innerHTML = '<option value="">-- Pilih buku --</option>';
    getKatalog().filter((b) => b.stok > 0).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.kodeBarang;
      opt.textContent = `${b.namaBarang} (${b.kodeBarang}) — ${b.harga} — stok ${b.stok}`;
      pilih.appendChild(opt);
    });
  }
  isiPilihan();

  const user = getUserLogin();
  $("#nama").value = user.nama;
  $("#emailPemesan").value = user.email;

  // ---- Render tabel keranjang ----
  function renderKeranjang() {
    tbody.innerHTML = "";
    if (keranjang.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="kosong">Keranjang masih kosong. Tambahkan buku di atas.</td></tr>';
    }
    keranjang.forEach((item, idx) => {
      const tr = document.createElement("tr");

      const tdNama = document.createElement("td");
      tdNama.textContent = `${item.nama} (${item.kode})`;

      const tdHarga = document.createElement("td");
      tdHarga.className = "kanan";
      tdHarga.textContent = rupiah(item.harga);

      // Jumlah dapat DIUBAH langsung di tabel
      const tdQty = document.createElement("td");
      tdQty.className = "tengah";
      const inputQty = document.createElement("input");
      inputQty.type = "number"; inputQty.min = 1; inputQty.max = stokBuku(item.kode);
      inputQty.value = item.qty;
      inputQty.className = "input-qty";
      inputQty.setAttribute("aria-label", "Jumlah " + item.nama);
      inputQty.addEventListener("change", () => {
        const maks = stokBuku(item.kode);
        const q = parseInt(inputQty.value, 10);
        if (!Number.isInteger(q) || q < 1) {
          tampilAlert("Jumlah minimal 1.", "error"); inputQty.value = item.qty; return;
        }
        if (q > maks) {
          tampilAlert(`Stok "${item.nama}" hanya ${maks}.`, "error", "Stok Tidak Cukup");
          inputQty.value = item.qty; return;
        }
        item.qty = q;
        simpanKeranjang();
        renderKeranjang();
      });
      tdQty.appendChild(inputQty);

      const tdSub = document.createElement("td");
      tdSub.className = "kanan";
      tdSub.textContent = rupiah(item.harga * item.qty);

      const tdAksi = document.createElement("td");
      tdAksi.className = "tengah";
      const btnHapus = document.createElement("button");
      btnHapus.type = "button";
      btnHapus.className = "btn btn-kecil btn-bahaya";
      btnHapus.textContent = "Hapus";
      btnHapus.addEventListener("click", () => {
        keranjang.splice(idx, 1);
        simpanKeranjang();
        renderKeranjang();
      });
      tdAksi.appendChild(btnHapus);

      tr.append(tdNama, tdHarga, tdQty, tdSub, tdAksi);
      tbody.appendChild(tr);
    });
    hitungRingkasan();
  }

  // ---- Hitung subtotal, ongkir, total ----
  function hitungRingkasan() {
    const subtotal = keranjang.reduce((j, i) => j + i.harga * i.qty, 0);
    const paket = $("#jenisPaket").value;
    const ongkir = keranjang.length && paket ? ONGKIR[paket] : 0;
    $("#rSubtotal").textContent = rupiah(subtotal);
    $("#rOngkir").textContent = rupiah(ongkir);
    $("#rTotal").textContent = rupiah(subtotal + ongkir);
    return { subtotal, ongkir, total: subtotal + ongkir };
  }
  $("#jenisPaket").addEventListener("change", hitungRingkasan);

  // ---- Tambah buku ke keranjang ----
  const formTambah = $("#formTambah");
  formTambah.addEventListener("submit", (e) => {
    e.preventDefault();
    bersihkanError(formTambah);
    const kode = pilih.value;
    const qty = parseInt($("#qtyBaru").value, 10);
    let ok = true;
    if (!kode) { setError(pilih, "Pilih buku terlebih dahulu."); ok = false; }
    if (!Number.isInteger(qty) || qty < 1) { setError($("#qtyBaru"), "Min. 1."); ok = false; }
    if (!ok) return;

    const buku = getKatalog().find((b) => b.kodeBarang === kode);
    const ada = keranjang.find((i) => i.kode === kode);
    const totalQty = (ada ? ada.qty : 0) + qty;
    if (totalQty > buku.stok) {
      tampilAlert(`Stok "${buku.namaBarang}" hanya ${buku.stok}.`, "error", "Stok Tidak Cukup");
      return;
    }
    if (ada) ada.qty = totalQty;
    else keranjang.push({ kode: buku.kodeBarang, nama: buku.namaBarang, harga: angka(buku.harga), qty });
    simpanKeranjang();
    renderKeranjang();
    formTambah.reset();
    $("#qtyBaru").value = 1;
  });

  // ---- Kirim pesanan (validasi lengkap) ----
  const formPesan = $("#formPesan");
  formPesan.addEventListener("submit", (e) => {
    e.preventDefault();
    bersihkanError(formPesan);
    let ok = true;
    const cek = (kondisi, el, pesan) => { if (!kondisi) { setError(el, pesan); ok = false; } };

    const nama = $("#nama").value.trim();
    const email = $("#emailPemesan").value.trim();
    const telp = $("#telepon").value.trim();
    const alamat = $("#alamat").value.trim();
    const kota = $("#kota").value.trim();
    const pos = $("#kodepos").value.trim();
    const eks = $("#ekspedisi").value;
    const paket = $("#jenisPaket").value;
    const metode = $("input[name='metode']:checked");

    if (keranjang.length === 0) {
      tampilAlert("Keranjang masih kosong. Tambahkan minimal satu buku.", "error", "Pesanan Kosong");
      ok = false;
    }
    cek(nama.length >= 3, $("#nama"), "Nama minimal 3 karakter.");
    cek(emailValid(email), $("#emailPemesan"), "Format email tidak valid.");
    cek(/^(\+62|62|0)8[0-9]{8,12}$/.test(telp), $("#telepon"), "Nomor HP tidak valid (contoh 081234567890).");
    cek(alamat.length >= 10, $("#alamat"), "Alamat minimal 10 karakter.");
    cek(kota.length >= 3, $("#kota"), "Kota wajib diisi.");
    cek(/^[0-9]{5}$/.test(pos), $("#kodepos"), "Kode pos harus 5 digit angka.");
    cek(Boolean(eks), $("#ekspedisi"), "Pilih ekspedisi.");
    cek(Boolean(paket), $("#jenisPaket"), "Pilih jenis paket.");
    cek(Boolean(metode), $("#grupMetode"), "Pilih metode pembayaran.");
    cek($("#setuju").checked, $("#setuju"), "Anda harus menyetujui syarat pemesanan.");

    if (!ok) {
      if (keranjang.length) tampilAlert("Data belum lengkap/valid. Periksa kolom yang ditandai merah.", "error", "Validasi Gagal");
      return;
    }

    // Nomor DO 8 digit unik (tahun + 4 angka acak), sama formatnya dengan data.js
    const semua = getSemuaTracking();
    let noDO;
    do { noDO = String(new Date().getFullYear()) + (Math.floor(Math.random() * 9000) + 1000); }
    while (semua[noDO]);

    const hit = hitungRingkasan();
    // Objek pesanan baru memakai struktur yang sama dengan dataTracking
    const pesananBaru = {
      nomorDO: noDO, nama, status: "Diproses", ekspedisi: eks,
      tanggalKirim: isoTanggal(0), paket, total: rupiah(hit.total),
      pembayaran: metode.value, email, telepon: telp, alamat: `${alamat}, ${kota} ${pos}`,
      items: keranjang.map((i) => ({ kode: i.kode, nama: i.nama, harga: i.harga, qty: i.qty })),
      ongkir: hit.ongkir,
      perjalanan: [{ waktu: waktuSekarang(), keterangan: "Pesanan diterima dan sedang diproses oleh toko" }]
    };
    const simpan = bacaStorage("pesananBaru", {});
    simpan[noDO] = pesananBaru;
    simpanStorage("pesananBaru", simpan);

    // Kurangi stok buku sesuai jumlah yang dipesan
    const terjual = bacaStorage("stokTerjual", {});
    keranjang.forEach((i) => { terjual[i.kode] = (terjual[i.kode] || 0) + i.qty; });
    simpanStorage("stokTerjual", terjual);

    // Kosongkan keranjang & form, tampilkan modal sukses
    keranjang = [];
    simpanKeranjang();
    formPesan.reset();
    $("#nama").value = user.nama;
    $("#emailPemesan").value = user.email;
    isiPilihan();
    renderKeranjang();
    $("#noDOBaru").textContent = noDO;
    $("#linkTracking").href = "tracking.html?do=" + encodeURIComponent(noDO);
    bukaModal("modalSukses");
  });

  renderKeranjang();
}

/* ==================== 9. TRACKING (tracking.html) ==================== */
function initTracking() {
  const form = $("#formTracking");
  const input = $("#noDO");
  const hasil = $("#hasilTracking");

  // Tombol contoh nomor DO (diambil dari kunci objek dataTracking)
  const chipWrap = $("#daftarChip");
  Object.keys(dataTracking).forEach((no) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = no;
    b.addEventListener("click", () => { input.value = no; cari(); });
    chipWrap.appendChild(b);
  });

  function cari() {
    bersihkanError(form);
    const no = input.value.trim();
    if (!no) {
      setError(input, "Nomor Delivery Order wajib diisi.");
      hasil.innerHTML = "";
      return;
    }
    const t = getSemuaTracking()[no];          // cari berdasarkan kunci objek
    if (!t) {
      hasil.innerHTML = "";
      tampilAlert(`Nomor Delivery Order "${no}" tidak ditemukan.`, "error", "Data Tidak Ditemukan");
      return;
    }
    tampilHasil(t);
  }

  function tampilHasil(t) {
    const st = statusAkhir(t);
    const persen = Math.round((st.level / TAHAP.length) * 100);

    // Daftar tahap (selesai / aktif / belum)
    const langkah = TAHAP.map((nama, i) => {
      const kelas = i + 1 < st.level ? "selesai" : i + 1 === st.level ? "aktif" : "";
      const isi = i + 1 < st.level || st.level === TAHAP.length ? "✔" : i + 1;
      return `<li class="${kelas}"><span class="no-tahap">${isi}</span>${escapeHtml(nama)}</li>`;
    }).join("");

    // Riwayat perjalanan paket: yang terbaru di paling atas
    const rute = (t.perjalanan || []).slice().reverse().map((r, i) =>
      `<li class="${i === 0 ? "terbaru" : ""}"><time>${escapeHtml(formatWaktu(r.waktu))}</time>` +
      `<span>${escapeHtml(r.keterangan)}</span></li>`).join("");

    // Rincian buku (hanya ada pada pesanan yang dibuat lewat checkout)
    let rincian = "";
    if (t.items && t.items.length) {
      const baris = t.items.map((i) =>
        `<tr><td>${escapeHtml(i.nama)}</td><td class="tengah">${i.qty}</td>` +
        `<td class="kanan">${rupiah(i.harga)}</td><td class="kanan">${rupiah(i.harga * i.qty)}</td></tr>`).join("");
      rincian = `<h3>Rincian Buku</h3><div class="tabel-wrap"><table>
        <thead><tr><th>Judul</th><th class="tengah">Jumlah</th><th class="kanan">Harga</th><th class="kanan">Subtotal</th></tr></thead>
        <tbody>${baris}<tr><td colspan="3" class="kanan">Ongkos kirim</td><td class="kanan">${rupiah(t.ongkir || 0)}</td></tr></tbody>
        </table></div>`;
    }

    hasil.innerHTML =
      `<article class="kartu hasil-kartu" aria-live="polite">
        <div class="hasil-judul"><h2>Hasil Pelacakan — ${escapeHtml(t.nomorDO)}</h2>
          <span class="badge ${st.kelas}">${st.label}</span></div>
        <dl class="detail-grid">
          <div><dt>Nama Pemesan</dt><dd>${escapeHtml(t.nama)}</dd></div>
          <div><dt>Ekspedisi</dt><dd>${escapeHtml(t.ekspedisi)}</dd></div>
          <div><dt>Tanggal Kirim</dt><dd>${formatTanggal(t.tanggalKirim)}</dd></div>
          <div><dt>Jenis Paket</dt><dd>${escapeHtml(t.paket)}</dd></div>
          <div><dt>Total Pembayaran</dt><dd>${escapeHtml(t.total)}</dd></div>
          <div><dt>Status</dt><dd>${st.label}</dd></div>
        </dl>
        <h3>Status Pengiriman</h3>
        <div class="progress" role="progressbar" aria-valuenow="${persen}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-isi ${st.kelas}" id="barProgress"></div>
        </div>
        <p class="progress-teks">${persen}% — ${st.label}</p>
        <ol class="tahap">${langkah}</ol>
        <h3>Riwayat Perjalanan</h3>
        <ol class="timeline">${rute}</ol>
        ${rincian}
      </article>`;

    // Animasi progress bar: lebar diubah setelah elemen tampil
    setTimeout(() => { $("#barProgress").style.width = persen + "%"; }, 60);
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); cari(); });

  // Jika dibuka dari checkout/history: tracking.html?do=20230012
  const dariUrl = new URLSearchParams(window.location.search).get("do");
  if (dariUrl) { input.value = dariUrl; cari(); }
}
