import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default function BookingSuccessPage() {
  return (
    <main>
      <h1>Thanks for your booking!</h1>
      <p className={styles.message}>
        Check your email for your confirmation — it can take a minute to arrive. Your confirmation includes a link to
        cancel your booking if your plans change.
      </p>
    </main>
  );
}
