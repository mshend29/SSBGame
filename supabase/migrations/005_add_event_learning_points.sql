alter table public.game_events
add column if not exists learning_point text not null default '';

update public.game_events e
set learning_point = v.learning_point
from (
  values
    (1, 'Relasi sosial itu penting, tetapi tetap perlu batas pengeluaran. Tujuannya bukan menghindari nongkrong, melainkan memilih cara bersosialisasi yang sesuai kemampuan.'),
    (2, 'Diskon bukan penghematan kalau barangnya tidak benar-benar dibutuhkan. Jeda sebelum membeli membantu memisahkan kebutuhan dari impuls.'),
    (3, 'Pengeluaran akademik sebaiknya dilihat sebagai investasi, tetapi efisiensi tetap penting. Hasil baik tidak selalu membutuhkan biaya paling besar.'),
    (4, 'Dana darurat memberi ruang saat hal tak terduga terjadi. Menghemat dengan mengorbankan kesehatan dapat menimbulkan biaya yang lebih besar kemudian.'),
    (5, 'Pendapatan tambahan bisa memperkuat kondisi keuangan, tetapi waktu dan energi juga punya nilai. Pilih peluang yang seimbang dengan kapasitasmu.'),
    (6, 'Kemudahan cicilan dapat menyamarkan total biaya. Sebelum memakai paylater, lihat kebutuhan, total pembayaran, dan dampaknya pada anggaran bulan-bulan berikutnya.')
) as v(event_order, learning_point)
where e.event_order = v.event_order
  and e.session_id = (select id from public.game_sessions where code = 'SSB2026');
