import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="shell home-shell">
      <section className="hero-card">
        <span className="eyebrow">LIVE FINANCIAL SIMULATION</span>
        <h1>Smart Student Budget</h1>
        <p>Bisakah kamu bertahan 30 hari sebagai mahasiswa dengan keputusan uangmu sendiri?</p>
        <div className="home-actions">
          <Link className="btn btn-primary" href="/play">Masuk sebagai Mahasiswa</Link>
          <Link className="btn btn-secondary" href="/host">Host Dashboard</Link>
          <Link className="btn btn-ghost" href="/screen">Projector Screen</Link>
        </div>
      </section>
    </main>
  )
}
