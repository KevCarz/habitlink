// --- SISTEMA DE NOTIFICACIONES ---

let notificationPermission = 'default';

async function initNotifications() {
    if (!('Notification' in window)) {
        console.log('Este navegador no soporta notificaciones de escritorio.');
        notificationPermission = 'unsupported';
        updateNotificationButton();
        return;
    }
    notificationPermission = Notification.permission;
    updateNotificationButton();
}

function updateNotificationButton() {
    const btn = document.getElementById('btn-enable-notifications');
    if (!btn) return;

    const bellIcon = '<svg class="notification-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10 21h4"/></svg>';
    const mutedIcon = '<svg class="notification-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 18H5.37c.4-.66.63-1.43.63-2.24V11a7 7 0 0 1 11-5.57"/><path d="M8.4 2.4A7 7 0 0 1 19 8v1"/><path d="m3 3 18 18"/></svg>';

    btn.classList.remove('bg-[#edf3ef]', 'text-[#42695a]', 'dark:bg-[#26352f]', 'dark:text-[#91b8a7]', 'bg-[#f4efed]', 'text-[#a34e42]', 'dark:bg-[#4a302c]', 'dark:text-[#efb6ac]');

    if (notificationPermission === 'granted') {
        btn.innerHTML = bellIcon;
        btn.setAttribute('aria-label', 'Notificaciones activadas');
        btn.title = 'Notificaciones activadas';
        btn.dataset.state = 'granted';
        btn.disabled = true;
    } else if (notificationPermission === 'denied') {
        btn.innerHTML = mutedIcon;
        btn.setAttribute('aria-label', 'Notificaciones bloqueadas');
        btn.title = 'Notificaciones bloqueadas';
        btn.dataset.state = 'denied';
        btn.disabled = true;
    } else if (notificationPermission === 'unsupported') {
        btn.innerHTML = mutedIcon;
        btn.setAttribute('aria-label', 'Notificaciones no compatibles');
        btn.title = 'Este navegador no admite notificaciones';
        btn.dataset.state = 'unsupported';
        btn.disabled = true;
    } else {
        btn.innerHTML = bellIcon;
        btn.setAttribute('aria-label', 'Activar notificaciones');
        btn.title = 'Activar notificaciones';
        btn.dataset.state = 'default';
        btn.disabled = false;
    }
}

async function requestNotificationPermission() {
    if (!('Notification' in window) || notificationPermission === 'denied') return;
    
    const permission = await Notification.requestPermission();
    notificationPermission = permission;
    updateNotificationButton();

    if (permission === 'granted') {
        sendNotification('¡Notificaciones activadas! 🎉', 'Te avisaremos cuando tu compañero complete un hábito.');
    }
}

function sendNotification(title, body) {
    if (notificationPermission !== 'granted') return;

    // Usar el icono de la app (puedes cambiar la URL por tu icono local si quieres)
    const iconUrl = 'https://cdn-icons-png.flaticon.com/512/2921/2921222.png'; 

    const notification = new Notification(title, {
        body: body,
        icon: iconUrl,
        badge: iconUrl,
        tag: 'habitlink-notification', // Evita spam de notificaciones
        requireInteraction: false
    });

    // Cerrar automáticamente después de 5 segundos
    setTimeout(() => notification.close(), 5000);
}

window.initNotifications = initNotifications;
window.sendNotification = sendNotification;