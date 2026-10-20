export function FormMessage({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>;
  if (ok) return <p role="status" className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{ok}</p>;
  return null;
}
