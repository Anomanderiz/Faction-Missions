import { z } from 'zod';
import { isPasswordValid, setAdminSession } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

const schema = z.object({
  password: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    if (!isPasswordValid(body.password)) {
      return fail('Incorrect password.', 401);
    }

    await setAdminSession();
    return ok({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail('Invalid login payload.', 400, error.flatten());
    }

    return fail('Could not log in.', 500, error instanceof Error ? error.message : error);
  }
}
