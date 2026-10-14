import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Only the project URL and the publishable/anon key are used in the browser.
export const isConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT_REF') && !key.includes('YOUR_PUBLISHABLE'));
export const supabase = isConfigured ? createClient(url, key) : null;
export const BUCKET = 'backups';
