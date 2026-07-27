import styles from './page.module.css';

export default function AboutPage() {
  return (
    <main>
      <h1>About RetfenyMozi</h1>
      <p className={styles.body}>
        RetfenyMozi is a small, single-screen local cinema showing a wide range of films —
        from new releases to classics.
      </p>
      <h2>Contact</h2>
      <p className={styles.body}>
        Email: <a href="mailto:info@retfenymozi.example">info@retfenymozi.example</a>
      </p>
    </main>
  );
}
