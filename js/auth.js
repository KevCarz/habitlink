const authForm = document.getElementById('auth-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const usernameField = document.getElementById('username-field');
const usernameInput = document.getElementById('username');
const authMessage = document.getElementById('auth-message');
const submitBtn = document.getElementById('auth-submit-btn');
const passwordInput = document.getElementById('password');
const forgotPasswordRow = document.getElementById('forgot-password-row');
const forgotPasswordBtn = document.getElementById('btn-forgot-password');
const emailField = document.getElementById('email-field');
const emailInput = document.getElementById('email');

let isLoginMode = true;
let isResetPasswordMode = false;

function showAuthMessage(message, isError = false) {
    authMessage.textContent = message;
    authMessage.className = `text-center text-sm ${isError ? 'text-red-600 dark:text-red-300' : 'text-green-600 dark:text-green-300'}`;
    authMessage.classList.remove('hidden');
}

function setAuthMode(loginMode) {
    isLoginMode = loginMode;
    isResetPasswordMode = false;
    tabLogin.classList.remove('hidden');
    tabRegister.classList.remove('hidden');
    emailField.classList.remove('hidden');
    emailInput.required = true;
    tabLogin.setAttribute('aria-selected', String(loginMode));
    tabRegister.setAttribute('aria-selected', String(!loginMode));
    tabLogin.className = loginMode
        ? 'min-h-11 flex-1 border-b-2 border-indigo-600 px-2 text-center text-sm font-medium text-indigo-600'
        : 'min-h-11 flex-1 px-2 text-center text-sm font-medium text-gray-500 hover:text-gray-700';
    tabRegister.className = loginMode
        ? 'min-h-11 flex-1 px-2 text-center text-sm font-medium text-gray-500 hover:text-gray-700'
        : 'min-h-11 flex-1 border-b-2 border-indigo-600 px-2 text-center text-sm font-medium text-indigo-600';
    usernameField.classList.toggle('hidden', loginMode);
    usernameInput.required = !loginMode;
    passwordInput.autocomplete = loginMode ? 'current-password' : 'new-password';
    submitBtn.textContent = loginMode ? 'Entrar' : 'Crear cuenta';
    forgotPasswordRow.classList.toggle('hidden', !loginMode);
    passwordInput.parentElement.classList.toggle('hidden', false);
    authMessage.classList.add('hidden');
}

// Supabase muestra la recuperación como un evento PASSWORD_RECOVERY al abrir el enlace enviado por email.
supabaseClient?.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
        isResetPasswordMode = true;
        isLoginMode = true;
        document.getElementById('view-auth').classList.remove('hidden');
        document.getElementById('view-auth').classList.add('flex');
        document.getElementById('view-dashboard').classList.add('hidden');
        document.getElementById('view-dashboard').classList.remove('flex');
        document.getElementById('view-stats').classList.add('hidden');
        document.getElementById('view-stats').classList.remove('flex');
        tabLogin.classList.add('hidden');
        tabRegister.classList.add('hidden');
        usernameField.classList.add('hidden');
        emailField.classList.add('hidden');
        emailInput.required = false;
        forgotPasswordRow.classList.add('hidden');
        passwordInput.value = '';
        passwordInput.required = true;
        passwordInput.autocomplete = 'new-password';
        passwordInput.parentElement.classList.remove('hidden');
        submitBtn.textContent = 'Guardar nueva contraseña';
        showAuthMessage('Escribe tu nueva contraseña para finalizar la recuperación.');
    }
});

tabLogin.addEventListener('click', () => setAuthMode(true));
tabRegister.addEventListener('click', () => setAuthMode(false));

forgotPasswordBtn.addEventListener('click', async () => {
    if (!supabaseClient) {
        showAuthMessage(window.supabaseInitError?.message || 'La conexión con Supabase no está configurada.', true);
        return;
    }

    const emailInput = document.getElementById('email');
    const email = emailInput.value.trim();
    if (!email) {
        emailInput.focus();
        showAuthMessage('Escribe tu email para enviarte el enlace de recuperación.', true);
        return;
    }

    const originalText = forgotPasswordBtn.textContent;
    forgotPasswordBtn.disabled = true;
    forgotPasswordBtn.textContent = 'Enviando enlace...';

    try {
        const redirectUrl = `${window.location.origin}${window.location.pathname}`;
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl
        });
        if (error) throw error;
        showAuthMessage('Revisa tu email. Te enviamos un enlace para crear una nueva contraseña.');
    } catch (error) {
        console.error('Error solicitando recuperación de contraseña:', error);
        showAuthMessage(error.message || 'No se pudo enviar el enlace de recuperación.', true);
    } finally {
        forgotPasswordBtn.disabled = false;
        forgotPasswordBtn.textContent = originalText;
    }
});

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
        if (isResetPasswordMode) {
            const { error } = await supabaseClient.auth.updateUser({
                password: passwordInput.value
            });
            if (error) throw error;
            showAuthMessage('Contraseña actualizada. Ya puedes iniciar sesión.');
            window.location.hash = '';
            await supabaseClient.auth.signOut();
            setTimeout(() => {
                setAuthMode(true);
                passwordInput.value = '';
            }, 800);
            return;
        }

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
