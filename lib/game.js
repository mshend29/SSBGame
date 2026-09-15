export function rupiah(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0)
}

export function moneyPersonality(player) {
  if (!player) return { title: 'THE EXPLORER', text: 'Selesaikan simulasi untuk melihat gaya uangmu.' }
  if (player.balance < 0) return { title: 'THE YOLO STUDENT', text: 'Pengalamanmu banyak, tetapi dompetmu meminta pertolongan.' }
  if (player.finance >= 75 && player.social < 45) return { title: 'THE SUPER SAVER', text: 'Keuanganmu aman. Ingat, uang juga bisa dipakai untuk pengalaman yang bernilai.' }
  if (player.social >= 70 && player.finance < 55) return { title: 'THE SOCIAL SPENDER', text: 'Kamu jago menjaga relasi. Sekarang jaga saldo dengan disiplin yang sama.' }
  if (player.finance >= 68 && player.wellbeing >= 60) return { title: 'THE BALANCED PLANNER', text: 'Kamu cukup seimbang antara keamanan, kebutuhan, dan kualitas hidup.' }
  return { title: 'THE ADAPTIVE STUDENT', text: 'Kamu fleksibel dan cepat menyesuaikan diri. Perkuat kebiasaan yang paling konsisten.' }
}

export function smartScore(player) {
  if (!player) return 0
  return Math.round(player.finance * .4 + player.academic * .25 + player.social * .2 + player.wellbeing * .15)
}
