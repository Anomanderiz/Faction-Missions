import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="shell landing-shell">
      <section className="hero-card">
        <p className="eyebrow">Waterdeep Campaign Board</p>
        <h1>The city waits. Choose your side of the screen.</h1>
        <p className="lede">
          Players can browse faction missions, read storylines, and cast votes during live arc ballots. The DM gets the full control panel.
        </p>

        <div className="landing-actions">
          <Link className="button button-primary" href="/player">
            Enter as Player
          </Link>
          <Link className="button button-secondary" href="/dm/login">
            DM Login
          </Link>
        </div>
      </section>
    </main>
  );
}
