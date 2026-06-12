// Supabase configuration is loaded from a static env config file.
// Fallback to in-repo defaults for local development.
let SUPABASE_URL = '';
let SUPABASE_ANON = '';
let SUPABASE_CLIENT = null;

// Hardcoded fallback values (for development; should use API in production)
const FALLBACK_SUPABASE_URL = 'https://lnyvzwiytskkdbtdapzn.supabase.co';
const FALLBACK_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxueXZ6d2l5dHNra2RidGRhcHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NTI2MzcsImV4cCI6MjA5NjEyODYzN30.K9vHFJ1fWdreXyOE2XYnFYtj9xhbqQg0QwF0TnAhFSE';

async function loadPublicConfig() {
  try {
    const res = await fetch('/api/public-config');
    if (!res.ok) throw new Error('Public config returned ' + res.status);

    const json = await res.json();
    SUPABASE_URL = json.supabaseUrl || FALLBACK_SUPABASE_URL;
    SUPABASE_ANON = json.supabaseAnon || FALLBACK_SUPABASE_ANON;

    window.SEND_OTP_ENDPOINTS = Array.isArray(json.sendOtpEndpoints) && json.sendOtpEndpoints.length
      ? json.sendOtpEndpoints
      : ['/api/send-otp'];
    window.SMS_ENABLED = json.smsEnabled ?? true;
    window.SMS_PROVIDER = json.smsProvider || '2factor';
  } catch (err) {
    console.warn('Public config unavailable, using fallback:', err.message);
    SUPABASE_URL = FALLBACK_SUPABASE_URL;
    SUPABASE_ANON = FALLBACK_SUPABASE_ANON;
    window.SEND_OTP_ENDPOINTS = ['/api/send-otp'];
    window.SMS_ENABLED = true;
    window.SMS_PROVIDER = '2factor';
  }

  // Initialize Supabase client
  if (SUPABASE_URL && SUPABASE_ANON && typeof supabase !== 'undefined') {
    SUPABASE_CLIENT = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    console.log('✅ Supabase client initialized');
  }
  
  return { supabaseUrl: SUPABASE_URL, supabaseAnon: SUPABASE_ANON };
}
