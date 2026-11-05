import { AuthForm } from '@/components/auth-form';
import { configured } from '@/lib/supabase/server';
export default function Login() {
  return <AuthForm configured={configured()} />;
}

export const dynamic = 'force-dynamic';
