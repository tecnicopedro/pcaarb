'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useAccessToken } from '@/lib/use-access-token';
import { Topbar } from './topbar';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAccessToken();

  useEffect(() => {
    // === null (não !accessToken): undefined é "ainda não sei" (primeira
    // renderização de hidratação, ver use-access-token.ts) — só null é uma
    // leitura de verdade do localStorage confirmando que não tem token.
    if (accessToken === null) {
      router.replace('/login');
    }
  }, [accessToken, router]);

  if (!accessToken) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <Topbar />
      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10"
      >
        {children}
      </motion.main>
    </div>
  );
}
