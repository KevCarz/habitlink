// --- SISTEMA DE NOTIFICACIONES ---

let notificationPermission = 'default';

async function initNotifications() {
    if (!('Notification' in window)) {
        console.log('Este navegador no soporta notificaciones de escritorio.');
        return;
    }
    notificationPermission = Notification.permission;
    updateNotificationButton();
}

function updateNotificationButton() {
    const btn = document.getElementById('btn-enable-notifications');
    if (!btn) return;

    if (notificationPermission === 'granted') {
        btn.textContent = '🔔 Notificaciones Activas';
        btn.classList.add('bg-green-100', 'text-green-700', 'dark:bg-green-900/30', 'dark:text-green-400');
        btn.disabled = true;
    } else if (notificationPermission === 'denied') {
        btn.textContent = '🔕 Bloqueadas';
        btn.classList.add('bg-red-100', 'text-red-700', 'dark:bg-red-900/30', 'dark:text-red-400');
        btn.disabled = true;
    } else {
        btn.textContent = '🔔 Activar Notificaciones';
        btn.classList.remove('bg-green-100', 'text-green-700', 'dark:bg-green-900/30', 'dark:text-green-400', 'bg-red-100', 'text-red-700', 'dark:bg-red-900/30', 'dark:text-red-400');
        btn.disabled = false;
    }
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    
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