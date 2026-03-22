import { getAdminState } from '@/lib/admin-data';
import { requireAdmin } from '@/lib/guards';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    const state = await getAdminState();
    return ok(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') {
      return fail('Not authorised.', 401);
    }

    return fail('Could not load admin state.', 500, message);
  }
}
