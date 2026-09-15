# `/play` Redesign Roadmap — Student Life Simulator

Dokumen ini adalah sumber urutan kerja redesign halaman mahasiswa (`/play`).

Tujuannya: mengubah pengalaman dari **dashboard/form** menjadi **student life simulator** tanpa mengubah mekanik game, data Supabase, atau aturan scoring yang sudah stabil.

## Aturan kerja

1. Kerjakan **satu item aktif saja**.
2. Jangan mengubah state berikutnya sebelum item aktif selesai.
3. Setiap item harus lolos build sebelum ditandai selesai.
4. Jangan mengubah schema/database kecuali memang dibutuhkan oleh UX yang sedang dikerjakan.
5. Pertahankan mobile-first dan aksesibilitas dasar.
6. Logic game yang sudah stabil tidak diubah hanya demi visual.
7. Setelah satu item selesai, update checklist dan catatan implementasi di file ini.

---

## Target visual

Bahasa visual utama:

- **Student Life Simulator**
- dark campus / fintech game UI
- HUD yang jelas
- scene sebagai fokus utama
- pilihan sebagai action, bukan card biasa
- feedback visual setelah keputusan
- tetap dewasa dan cocok untuk mahasiswa baru

Prinsip hierarchy:

**Scene → HUD → Action → Feedback**

bukan:

**Card → Card → Card → Button**

---

# Urutan Implementasi

## 1. Join Screen — ACTIVE

Tujuan: halaman pertama harus terasa seperti **start screen sebuah game**, bukan form login.

### Scope

- [ ] Hero/start screen baru
- [ ] Session status kecil dan jelas
- [ ] Form identitas dibuat seperti player registration panel
- [ ] CTA utama `JOIN GAME`
- [ ] Visual cue 30-day challenge
- [ ] Mobile layout tetap nyaman
- [ ] Error/session invalid tetap terbaca jelas
- [ ] Tidak mengubah logic join, NIM uniqueness, faculty, atau session lookup

### Acceptance criteria

- User langsung memahami bahwa ini sebuah game/simulasi.
- Session code tetap dapat diisi dari QR/query parameter.
- Tombol join tetap disabled jika session belum valid.
- Nama, NIM, fakultas, dan session code tetap bekerja sama seperti sebelumnya.
- Tidak ada horizontal overflow di mobile.
- `npm run build` lulus.

---

## 2. Lobby / Waiting Room — QUEUED

Tujuan: setelah join, mahasiswa merasa sudah masuk ke sebuah lobby game.

- [ ] Player identity
- [ ] session code
- [ ] connected state
- [ ] waiting animation/pulse
- [ ] instruksi singkat
- [ ] tidak terasa seperti halaman kosong

---

## 3. Budget Setup — QUEUED

Tujuan: budgeting terasa seperti **mengalokasikan dompet bulanan**, bukan mengisi tabel.

- [ ] starting balance sebagai fokus utama
- [ ] kategori menjadi budget slots/envelopes
- [ ] remaining money meter
- [ ] selected allocation terasa tactile
- [ ] lock budget sebagai keputusan besar
- [ ] over-budget warning jelas

---

## 4. Game HUD — QUEUED

Tujuan: status pemain selalu terbaca seperti game HUD.

- [ ] balance
- [ ] Smart Score
- [ ] round/day progress
- [ ] Finance meter
- [ ] Academic meter
- [ ] Social meter
- [ ] Wellbeing meter
- [ ] responsive mobile HUD

---

## 5. Event Scene + Action Choices — QUEUED

Tujuan: ronde menjadi pusat pengalaman bermain.

- [ ] scene/event area lebih dominan
- [ ] event kicker + narrative hierarchy
- [ ] pilihan berupa action buttons
- [ ] money impact jelas
- [ ] projected balance jelas
- [ ] score trade-off jelas
- [ ] selected/locked state kuat

---

## 6. Waiting Reveal + Consequence — QUEUED

Tujuan: memberi ritme game setelah mahasiswa memilih.

- [ ] locked state
- [ ] waiting host state
- [ ] consequence presentation
- [ ] money delta feedback
- [ ] score delta feedback
- [ ] edukasi tetap mudah dibaca

---

## 7. Final Report — QUEUED

Tujuan: penutup terasa seperti hasil akhir game yang layak di-screenshot.

- [ ] ending balance
- [ ] Smart Score
- [ ] 4 final stats
- [ ] money personality
- [ ] insight ringkas
- [ ] visual hierarchy kuat

---

## 8. Polish — QUEUED

Dikerjakan paling akhir setelah seluruh state utama selesai.

- [ ] micro-interactions
- [ ] transitions
- [ ] reduced-motion consideration
- [ ] spacing audit mobile
- [ ] tap target audit
- [ ] contrast/readability audit
- [ ] final production smoke test

---

# Yang Tidak Dikerjakan Dulu

Agar scope tidak melebar, hal berikut **ditunda** sampai semua item di atas selesai:

- ilustrasi kompleks per event
- sound effects
- avatar system
- achievement/badge system
- confetti
- custom animation library
- perubahan scoring
- perubahan database game
- redesign `/host`
- redesign `/screen`

---

# Progress Log

### 2026-09-15

- Roadmap dibuat.
- Fokus pertama ditetapkan: **Join Screen**.
- Baseline: logic game production sudah berjalan; perubahan berikutnya visual-only kecuali ada bug yang ditemukan saat implementasi.
