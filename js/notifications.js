// --- SISTEMA DE NOTIFICACIONES ---

let notificationPermission = 'default';

async function initNotifications() {
    const btn = document.getElementById('btn-enable-notifications');
    const dot = document.getElementById('notif-status-dot');

    if (!('Notification' in window)) {
        notificationPermission = 'unsupported';
        updateNotificationButton();
        if (dot) dot.className = 'absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500';
        return;
    }
    notificationPermission = Notification.permission;
    updateNotificationButton();

    if (btn && !btn.dataset.boundNotification) {
        btn.dataset.boundNotification = 'true';
        btn.addEventListener('click', requestNotificationPermission);
    }
}

function updateNotificationButton() {
    const btn = document.getElementById('btn-enable-notifications');
    if (!btn) return;
    const dot = document.getElementById('notif-status-dot');
    btn.classList.add('notification-button');
    btn.removeAttribute('disabled');

    if (notificationPermission === 'granted') {
        btn.setAttribute('aria-label', 'Notificaciones activadas');
        btn.title = 'Notificaciones activadas';
        btn.dataset.state = 'granted';
        btn.style.color = 'var(--hl-success)';
        if (dot) dot.className = 'absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500 animate-pulse';
    } else if (notificationPermission === 'denied') {
        btn.setAttribute('aria-label', 'Notificaciones bloqueadas');
        btn.title = 'Notificaciones bloqueadas';
        btn.dataset.state = 'denied';
        btn.style.color = 'var(--hl-danger)';
        if (dot) dot.className = 'absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500';
    } else if (notificationPermission === 'unsupported') {
        btn.setAttribute('aria-label', 'Notificaciones no compatibles');
        btn.title = 'Este navegador no admite notificaciones';
        btn.dataset.state = 'unsupported';
        btn.style.color = 'var(--hl-muted)';
        if (dot) dot.className = 'absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500';
    } else {
        btn.setAttribute('aria-label', 'Activar notificaciones');
        btn.title = 'Activar notificaciones';
        btn.dataset.state = 'default';
        btn.style.color = 'var(--hl-muted)';
        if (dot) dot.className = 'absolute -top-1 -right-1 h-3 w-3 rounded-full bg-gray-400';
    }
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        notificationPermission = 'unsupported';
        updateNotificationButton();
        return;
    }

    if (notificationPermission === 'granted') {
        sendNotification('HabitLink', 'Las notificaciones están funcionando correctamente.');
        return;
    }

    if (notificationPermission === 'denied') {
        const container = document.getElementById('toast-container');
        if (container) {
            showNotificationToast('Las notificaciones están bloqueadas. Actívalas desde los ajustes del navegador.');
        }
        return;
    }

    const permission = await Notification.requestPermission();
    notificationPermission = permission;
    updateNotificationButton();

    if (permission === 'granted') {
        sendNotification('¡Notificaciones activadas! 🎉', 'Te avisaremos sobre tus hábitos y compañeros.');
    }
}

async function sendNotification(title, body) {
    if (notificationPermission !== 'granted') return;
    const iconUrl = './image/icon-192.png';
    const options = { body, icon: iconUrl, badge: iconUrl, tag: 'habitlink-notification', requireInteraction: false };

    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification(title, options);
            return;
        } catch (error) {
            console.warn('No se pudo mostrar la notificación mediante Service Worker:', error);
        }
    }

    const notification = new Notification(title, options);
    setTimeout(() => notification.close(), 5000);
}

function showNotificationToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto rounded-xl border border-[#efb6ac] bg-[#fff5f3] px-4 py-3 text-sm text-[#a34e42] shadow-lg dark:bg-[#3a2825] dark:text-[#efb6ac]';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

window.initNotifications = initNotifications;
window.sendNotification = sendNotification;
window.requestNotificationPermission = requestNotificationPermission;