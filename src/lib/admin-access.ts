import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// The database checks auth.uid() against the immutable GitHub provider ID.
// Client metadata, email addresses and browser flags never grant this role.
export async function getAdminAccess(
  client: SupabaseClient,
): Promise<'admin' | 'member' | 'unavailable'> {
  try {
    const { data, error } = await client.rpc('jobfit_is_admin');
    if (error || typeof data !== 'boolean') return 'unavailable';
    return data ? 'admin' : 'member';
  } catch {
    return 'unavailable';
  }
}
