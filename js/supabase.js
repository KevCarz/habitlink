let supabaseClient = null;

try {
    if (!window.supabase) {
        throw new Error('No se pudo cargar Supabase. Comprueba la conexión a internet.');
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === '******') {
        throw new Error('Configura la URL y la clave anon/public de tu proyecto en js/config.js. No uses la clave service_role en el navegador.');
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (error) {
    window.supabaseInitError = error;
    console.error('Error inicializando Supabase:', error);
}