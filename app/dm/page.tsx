import { redirect } from 'next/navigation';
import { DmApp } from '@/components/DmApp';
import { isAdminSession } from '@/lib/auth';

export default async function DmPage() {
  if (!(await isAdminSession())) {
    redirect('/dm/login');
  }

  return <DmApp />;
}
