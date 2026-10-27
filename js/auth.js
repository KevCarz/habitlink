const authForm = document.getElementById('auth-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const usernameField = document.getElementById('username-field');
const usernameInput = document.getElementById('username');
const authMessage = document.getElementById('auth-message');
const submitBtn = document.getElementById('auth-submit-btn');
const passwordInput = document.getElementById('password');

let isLoginMode = true;

function showAuthMessage(message, isError = false) {
    authMessage.textContent = message;
    authMessage.className = `text-center text-sm ${isError ? 'text-red-600 dark:text-red-300' : 'text-green-600 dark:text-green-300'}`;
    authMessage.classList.remove('hidden');
}

function setAuthMode(loginMode) {
    isLoginMode = loginMode;
    tabLogin.setAttribute('aria-selected', String(loginMode));
    tabRegister.setAttribute('aria-selected', String(!loginMode));
    tabLogin.className = loginMode
        ? 'flex-1 border-b-2 border-indigo-600 py-2 text-center font-medium text-indigo-600'
        : 'flex-1 py-2 text-center font-medium text-gray-500 hover:text-gray-700';
    tabRegister.className = loginMode
        ? 'flex-1 py-2 text-center font-medium text-gray-500 hover:text-gray-700'
        : 'flex-1 border-b-2 border-indigo-600 py-2 text-center font-medium text-indigo-600';
    usernameField.classList.toggle('hidden', loginMode);
    usernameInput.required = !loginMode;
    passwordInput.autocomplete = loginMode ? 'current-password' : 'new-password';
    submitBtn.textContent = loginMode ? 'Entrar' : 'Crear cuenta';
    authMessage.classList.add('hidden');
}

tabLogin.addEventListener('click', () => setAuthMode(true));
tabRegister.addEventListener('click', () => setAuthMode(false));

authForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!supabaseClient) {
        showAuthMessage(window.supabaseInitError?.message || 'La conexión con Supabase no está configurada.', true);
        return;
    }

    const email = document.getElementById('email').value.trim();
    const password = passwordInput.value;
    const username = usernameInput.value.trim();
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando...';
    showAuthMessage('Procesando...');

    try {
        if (isLoginMode) {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            showAuthMessage('¡Bienvenido de nuevo!');
        } else {
            const { error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { data: { username } }
            });
            if (error) throw error;
            showAuthMessage('Cuenta creada. Revisa tu email para confirmarla si se requiere.');
        }
    } catch (error) {
        console.error('Error de autenticación:', error);
        showAuthMessage(error.message || 'No se pudo completar la autenticación.', true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});
