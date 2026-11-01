let activeUserId = null;
let initializationPromise = null;

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getWeekStartDate(date = new Date()) {
    const monday = new Date(date);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return getLocalDateString(monday);
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function showAppError(message) {
    const errorElement = document.getElementById('app-error');
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
}

function clearAppError() {
    document.getElementById('app-error').classList.add('hidden');
}

function showView(viewId) {
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById(viewId).classList.remove('hidden');
}

async function loadUserProfile(userId) {
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.error('Error cargando el perfil:', error);
        showAppError('No se pudo cargar tu perfil. Comprueba la conexión y los permisos de Supabase.');
        return;
    }

    const greeting = document.getElementById('user-greeting');
    greeting.textContent = profile?.username ? `Hola, ${profile.username}` : 'Hola';
}

async function initializeAuthenticatedSession(session) {
    if (!session?.user) return;
    if (activeUserId === session.user.id) return initializationPromise;

    activeUserId = session.user.id;
    initializationPromise = (async () => {
        clearAppError();
        showView('view-dashboard');
        await loadUserProfile(session.user.id);
        await Promise.all([loadHabits(), initPartners(session.user)]);
        subscribeToRealtime(session.user.id);
        subscribeToPartnerChanges(session.user.id);
    })();

    try {
        await initializationPromise;
    } catch (error) {
        console.error('Error iniciando la sesión:', error);
        showAppError('No se pudo cargar la aplicación. Inténtalo de nuevo.');
    } finally {
        initializationPromise = null;
    }
}

async function handleSignedOut() {
    activeUserId = null;
    initializationPromise = null;
    await unsubscribeHabitRealtime();
    await unsubscribePartnerRealtime();
    resetPartnerSession();
    showView('view-auth');
    document.getElementById('habits-list').replaceChildren();
    document.getElementById('partner-list').innerHTML = '<p class="py-4 text-center text-sm text-gray-400">Sin compañeros aún</p>';
    document.getElementById('partner-progress').classList.add('hidden');
    document.getElementById('requests-section').classList.add('hidden');
    document.getElementById('requests-list').replaceChildren();
    document.getElementById('user-greeting').textContent = '';
}

document.addEventListener('DOMContentLoaded', async () => {
    const themeToggle = document.getElementById('btn-theme-toggle');
    const themeColor = document.querySelector('meta[name="theme-color"]');

    function updateThemeControl(isDark) {
        const thumb = themeToggle.querySelector('[data-theme-thumb]');
        const icon = themeToggle.querySelector('[data-theme-icon]');

        // El pulgar se desplaza y el icono indica visualmente el modo activo.
        thumb.classList.toggle('translate-x-6', isDark);
        icon.textContent = isDark ? '☀️' : '🌙';
        themeToggle.classList.toggle('bg-indigo-500', isDark);
        themeToggle.classList.toggle('bg-gray-300', !isDark);
        themeToggle.setAttribute('aria-label', isDark ? 'Activar modo diurno' : 'Activar modo nocturno');
        themeToggle.setAttribute('aria-checked', String(isDark));
        themeToggle.title = isDark ? 'Activar modo diurno' : 'Activar modo nocturno';
        themeColor?.setAttribute('content', isDark ? '#111827' : '#f9fafb');
    }

    updateThemeControl(document.documentElement.classList.contains('dark'));
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        updateThemeControl(isDark);
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => console.info('Service Worker registrado:', registration.scope))
            .catch(error => console.error('Error registrando el Service Worker:', error));
    }

    if (!supabaseClient) {
        showAppError(window.supabaseInitError?.message || 'Falta configurar la conexión con Supabase en js/config.js.');
        showView('view-auth');
        return;
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        Promise.resolve().then(() => session ? initializeAuthenticatedSession(session) : handleSignedOut());
    });

    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (session) {
            await initializeAuthenticatedSession(session);
        } else {
            showView('view-auth');
        }
    } catch (error) {
        console.error('Error comprobando la sesión:', error);
        showAppError('No se pudo comprobar tu sesión. Recarga la página o vuelve a iniciar sesión.');
        showView('view-auth');
    }

    document.getElementById('btn-logout').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;
        } catch (error) {
            console.error('Error cerrando sesión:', error);
            showAppError(`No se pudo cerrar la sesión: ${error.message}`);
        } finally {
            button.disabled = false;
        }
    });
});