import { notFound } from 'next/navigation';
import { Tasks } from '@/components/tasks';
import { Finance } from '@/components/finance';
import { Goals } from '@/components/goals';
import { Vault } from '@/components/vault';
import dynamic from 'next/dynamic';
import { Settings } from '@/components/settings';
const Studies = dynamic(() => import('@/components/studies').then((m) => m.Studies));
export default async function Module({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  switch (module) {
    case 'tarefas':
      return <Tasks />;
    case 'calendario':
      return <Tasks calendar />;
    case 'financeiro':
      return <Finance />;
    case 'metas':
      return <Goals />;
    case 'estudos':
      return <Studies />;
    case 'cofre':
      return <Vault />;
    case 'configuracoes':
      return <Settings />;
    default:
      notFound();
  }
}
