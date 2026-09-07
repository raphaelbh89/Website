import type { ReactNode } from 'react';
export const metadata = { title: 'Platform web — Foundation', robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="vi"><body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f5f7fa', color: '#17243b' }}>{children}</body></html>;
}

