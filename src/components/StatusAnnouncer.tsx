/** Visually hidden but announced by screen readers whenever the status text changes. */
export function StatusAnnouncer({ text }: { text: string }) {
  return (
    <div aria-live="polite" className="visually-hidden">
      {text}
    </div>
  );
}
