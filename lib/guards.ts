import { isAdminSession } from '@/lib/auth';

export async function requireAdmin() {
  const isAdmin = await isAdminSession();
  if (!isAdmin) {
    throw new Error('UNAUTHORIZED');
  }
}
