import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';
import { MfaChallenge } from '@/components/mfa-challenge';
export default async function Mfa({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');
  const params = await searchParams;
  return <MfaChallenge next={params.next === '/auth/reset' ? '/auth/reset' : '/'} />;
}
