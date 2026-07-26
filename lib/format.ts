export function formatShowtime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Budapest',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
