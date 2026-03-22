import { getPublicState } from '@/lib/public-data';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await getPublicState();
    return ok(state);
  } catch (error) {
    return fail('Could not load public state.', 500, error instanceof Error ? error.message : error);
  }
}
