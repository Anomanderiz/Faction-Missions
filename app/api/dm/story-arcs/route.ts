import { z } from 'zod';
import { requireAdmin } from '@/lib/guards';
import { fail, ok } from '@/lib/http';
import { getAdminSupabase } from '@/lib/supabase/admin';

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(['MSQ', 'SQ', 'MSQ/SQ']),
  blurb: z.string().trim().min(1).max(3000),
  is_visible: z.boolean().default(true)
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
      .from('story_arcs')
      .insert({ ...body, is_archived: false })
      .select('*')
      .single();

    if (error) return fail(error.message, 400);
    return ok(data);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid story arc payload.', 400, error.flatten());
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') return fail('Not authorised.', 401);
    return fail('Could not create story arc.', 500, message);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = updateSchema.parse(await request.json());
    const admin = getAdminSupabase();
    const { id, ...updates } = body;

    const { data, error } = await admin
      .from('story_arcs')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return fail(error.message, 400);
    return ok(data);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid story arc update payload.', 400, error.flatten());
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') return fail('Not authorised.', 401);
    return fail('Could not update story arc.', 500, message);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const body = deleteSchema.parse(await request.json());
    const admin = getAdminSupabase();

    if (body.hardDelete) {
      const { error } = await admin.from('story_arcs').delete().eq('id', body.id);
      if (error) return fail(error.message, 400);
      return ok({ success: true, hardDelete: true });
    }

    const { data, error } = await admin
      .from('story_arcs')
      .update({ is_archived: true, is_visible: false })
      .eq('id', body.id)
      .select('*')
      .single();

    if (error) return fail(error.message, 400);
    return ok(data);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid story arc delete payload.', 400, error.flatten());
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') return fail('Not authorised.', 401);
    return fail('Could not delete story arc.', 500, message);
  }
}
