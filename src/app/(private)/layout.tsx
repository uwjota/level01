import { redirect } from 'next/navigation';
import { configured, serverClient } from '@/lib/supabase/server';
import { AppProvider } from '@/components/app-provider';
export const dynamic = 'force-dynamic';
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  if (!configured()) redirect('/login');
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') redirect('/auth/mfa');
  return <AppProvider user={{ id: user.id, email: user.email ?? '' }}>{children}</AppProvider>;
}
