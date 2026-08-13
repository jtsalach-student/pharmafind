import { createClient } from '@supabase/supabase-js';

export type AppRole = 'USER' | 'PHARMACIST' | 'PHARMACY_ADMIN' | 'DRIVER' | 'SYSTEM_ADMIN';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

function debugSupabaseConfig() {
  const missing = [] as string[];

  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');

  console.info('[Supabase] config check', {
    hasUrl: Boolean(supabaseUrl),
    url: supabaseUrl ? `${supabaseUrl.slice(0, 32)}...` : null,
    hasAnonKey: Boolean(supabaseAnonKey),
    origin: typeof window !== 'undefined' ? window.location.origin : 'server'
  });

  if (missing.length > 0) {
    console.error('❌ Supabase configuration missing:', missing.join(', '));
    console.error('Expected Vite env variables in client/.env.local');
    console.error('Example:');
    console.error('  VITE_SUPABASE_URL=https://project.supabase.co');
    console.error('  VITE_SUPABASE_ANON_KEY=your-anon-key');
  } else {
    console.info('✓ Supabase environment loaded successfully.');
  }

  return missing.length === 0;
}

const isConfigured = debugSupabaseConfig();

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export const isSupabaseConfigured = Boolean(supabase);

export function getSupabaseClient() {
  if (!supabase) {
    const missing = [] as string[];
    if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');
    throw new Error(
      'Supabase is not configured. Missing: ' + missing.join(', ') + '. Add the values to client/.env.local.'
    );
  }

  return supabase;
}

export async function ensureUgmcPharmacy() {
  const client = getSupabaseClient();

  const { data: existing, error: selectError } = await client
    .from('Pharmacy')
    .select('id')
    .eq('name', 'UGMC Pharmacy')
    .limit(1)
    .maybeSingle();

  if (selectError && selectError.code !== 'PGRST116') {
    throw selectError;
  }

  if (existing) {
    return existing;
  }

  const { data, error } = await client.from('Pharmacy').insert({
    name: 'UGMC Pharmacy',
    address: 'University of Ghana Medical Centre, Legon, Accra, Ghana',
    phone: '',
    latitude: 5.6323346,
    longitude: -0.185922,
    opensAt: '08:00',
    closesAt: '20:00'
  }).select('id').single();

  if (error) {
    throw error;
  }

  return data;
}
