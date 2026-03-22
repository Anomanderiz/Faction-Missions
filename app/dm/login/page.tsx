import { redirect } from 'next/navigation';
import { isAdminSession } from '@/lib/auth';
import { DmLoginForm } from '@/components/DmLoginForm';

export default async function DmLoginPage() {
  if (await isAdminSession()) {
    redirect('/dm');
  }

  return <DmLoginForm />;
}
