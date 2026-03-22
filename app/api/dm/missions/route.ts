import { z } from 'zod';
import { requireAdmin } from '@/lib/guards';
import { fail, ok } from '@/lib/http';
import { getAdminSupabase } from '@/lib/supabase/admin';

const createSchema = z.object({
  faction: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  reward: z.string().trim().max(200).default(''),
  location: z.string().trim().max(200).default(''),
  hook: z.string().trim().max(3000).default(''),
  status: z.enum(['Available', 'Accepted', 'Completed', 'Failed']).default('Available'),
  assigned_to: z.string().trim().max(120).default(''),
  notes: z.string().trim().max(3000).default('')
});

const updateSchema = createSchema.partial().extend({
  id: z.string().uuid(),
  is_archived: z.boolean().optional()
});

const deleteSchema = z.object({
  id: z.string().uuid(),
  hardDelete: z.boolean().optional().default(false)
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = createSchema.parse(await request.json());
    const admin = getAdminSupabase();

    const { data, error } = await admin
      .from('faction_missions')
      .insert({
        ...body,
        assigned_to: body.assigned_to || null,
        notes: body.notes || null,
        is_archived: false
      })
      .select('*')
      .single();

    if (error) return fail(error.message, 400);
    return ok(data);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid mission payload.', 400, error.flatten());
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') return fail('Not authorised.', 401);
    return fail('Could not create mission.', 500, message);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = updateSchema.parse(await request.json());
    const admin = getAdminSupabase();
    const { id, ...updates } = body;

    const payload = {
      ...updates,
      assigned_to: updates.assigned_to === '' ? null : updates.assigned_to,
      notes: updates.notes === '' ? null : updates.notes
    };

    const { data, error } = await admin
      .from('faction_missions')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return fail(error.message, 400);
    return ok(data);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid mission update payload.', 400, error.flatten());
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') return fail('Not authorised.', 401);
    return fail('Could not update mission.', 500, message);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const body = deleteSchema.parse(await request.json());
    const admin = getAdminSupabase();

    if (body.hardDelete) {
      const { error } = await admin.from('faction_missions').delete().eq('id', body.id);
      if (error) return fail(error.message, 400);
      return ok({ success: true, hardDelete: true });
    }

    const { data, error } = await admin
      .from('faction_missions')
      .update({ is_archived: true })
      .eq('id', body.id)
      .select('*')
      .single();

    if (error) return fail(error.message, 400);
    return ok(data);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid mission delete payload.', 400, error.flatten());
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') return fail('Not authorised.', 401);
    return fail('Could not delete mission.', 500, message);
  }
}
