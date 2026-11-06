export const metadata = { robots: { index: false, follow: false } };

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper">{children}</div>;
}
