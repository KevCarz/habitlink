// --- SISTEMA DE INSIGNIAS CON TOAST ---

// Copy destacado por logro. Se conserva el contenido de la base de datos como respaldo
// para insignias nuevas o personalizadas que aún no tengan una presentación definida aquí.
const BADGE_PRESENTATION = {
    first_habit: {
        name: 'Primer Paso',
        description: '¡Lo lograste! Creaste tu primer hábito y comenzaste a construir una mejor versión de ti.'
    },
    habit_collector: {
        name: 'Coleccionista de Hábitos',
        description: '¡Gran avance! Alcanzaste 5 hábitos activos y convertiste tu compromiso en una rutina poderosa.'
    },
    streak_3: {
        name: 'Constancia en Acción',
        description: '¡Imparable! Mantienes una racha de 3 días y ya estás creando un hábito sólido.'
    },
    streak_7: {
        name: 'Racha Imparable',
        description: '¡Una semana completa! Cumpliste 7 días seguidos: tu disciplina ya está dando resultados.'
    },
    streak_30: {
        name: 'Leyenda de la Constancia',
        description: '¡Logro extraordinario! Alcanzaste 30 días seguidos y demostraste una disciplina inspiradora.'
    },
    first_partner: {
        name: 'Mejor en Compañía',
        description: '¡Acompañamiento desbloqueado! Formaste tu primera alianza y puedes crecer junto a alguien más.'
    },
    total_50: {
        name: 'Cincuenta Victorias',
        description: '¡Increíble marca! Ya registraste 50 logros y cada uno representa una decisión que cuenta.'
    },
    total_100: {
        name: 'Cien Pasos de Éxito',
        description: '¡Triple dígito alcanzado! Completaste 100 registros y tu constancia habla por sí sola.'
    },
    weekly_100: {
        name: 'Semana Perfecta',
        description: '¡Semana impecable! Cumpliste todos tus hábitos durante esta semana y superaste el reto al 100%.'
    }
};

// Escapa datos obtenidos de Supabase antes de usarlos en HTML para evitar inyección de markup.
function escapeBadgeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getBadgePresentation(badge) {
    return BADGE_PRESENTATION[badge.code] || {
        name: badge.name,
        description: badge.description
    };
}

// 1. Función para mostrar el Toast
function showBadgeToast(badge) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const presentation = getBadgePresentation(badge);
    const safeName = escapeBadgeHTML(presentation.name);
    const safeIcon = escapeBadgeHTML(badge.icon || '🏆');
    const safeDescription = escapeBadgeHTML(presentation.description);

    // Resalta visualmente los números de logros sin insertar texto sin procesar en el HTML.
    const descriptionHTML = safeDescription.replace(
        /(\d+)/g,
        '<span class="text-3xl font-black text-white drop-shadow-lg">$1</span>'
    );

    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.className = `
        pointer-events-auto transform transition-all duration-500 ease-out translate-x-full opacity-0
        bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 text-white p-6 rounded-2xl shadow-2xl 
        border-2 border-yellow-300 flex items-center gap-5 min-w-[380px] max-w-md
    `;

    toast.innerHTML = `
        <div class="text-6xl animate-bounce drop-shadow-lg flex-shrink-0">${safeIcon}</div>
        <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-yellow-100 opacity-80 mb-1">
                🎉 ¡Insignia Desbloqueada!
            </p>
            <h4 class="text-2xl font-black leading-tight mb-2 drop-shadow-md">${safeName}</h4>
            <p class="text-base font-medium text-yellow-50 leading-snug">
                ${descriptionHTML}
            </p>
        </div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 500);
    }, 6000); // Se muestra un segundo más para apreciar mejor el logro.
}

// 2. Cargar insignias (Igual que antes)
async function loadBadges() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data: allBadges } = await supabaseClient.from('badges').select('*').order('created_at', { ascending: true });
    const { data: userBadges } = await supabaseClient.from('user_badges').select('badge_id').eq('user_id', user.id);

    if (!allBadges) return;

    const unlockedIds = new Set((userBadges || []).map(ub => ub.badge_id));
    const container = document.getElementById('badges-container');
    if (!container) return;

    document.getElementById('badges-unlocked-count').textContent = unlockedIds.size;
    document.getElementById('badges-total-count').textContent = allBadges.length;

    container.innerHTML = allBadges.map(badge => {
        const isUnlocked = unlockedIds.has(badge.id);
        const presentation = getBadgePresentation(badge);
        return `
            <div class="relative rounded-lg border-2 p-4 transition-all ${
                isUnlocked 
                    ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-600 shadow-md' 
                    : 'border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 opacity-60 grayscale'
            }">
                <div class="flex items-start gap-3">
                    <div class="text-3xl ${isUnlocked ? 'drop-shadow-md' : ''}">${escapeBadgeHTML(badge.icon || '🏆')}</div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-bold text-sm text-gray-800 dark:text-gray-100">${escapeBadgeHTML(presentation.name)}</h4>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${escapeBadgeHTML(presentation.description)}</p>
                        <p class="text-xs mt-1 ${isUnlocked ? 'text-yellow-700 dark:text-yellow-400 font-semibold' : 'text-gray-400'}">
                            ${isUnlocked ? '✓ Desbloqueada' : '🔒 ' + escapeBadgeHTML(badge.requirement || 'Sigue adelante para desbloquearla')}
                        </p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 3. Verificar y Desbloquear (Lógica mejorada para detectar NUEVAS)
async function checkAndUnlockBadges() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // A. Obtener las que YA tiene
    const { data: currentBadges } = await supabaseClient
        .from('user_badges')
        .select('badge_id')
        .eq('user_id', user.id);
    
    const currentIds = new Set((currentBadges || []).map(b => b.badge_id));

    // B. Calcular cuáles DEBERÍA tener según sus stats
    const eligibleCodes = [];

    // Stats básicos
    const { count: habitsCount } = await supabaseClient.from('habits').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    if (habitsCount >= 1) eligibleCodes.push('first_habit');
    if (habitsCount >= 5) eligibleCodes.push('habit_collector');

    const { data: habits } = await supabaseClient.from('habits').select('streak_count').eq('user_id', user.id);
    if (habits) {
        const maxStreak = Math.max(...habits.map(h => h.streak_count || 0), 0);
        if (maxStreak >= 3) eligibleCodes.push('streak_3');
        if (maxStreak >= 7) eligibleCodes.push('streak_7');
        if (maxStreak >= 30) eligibleCodes.push('streak_30');
    }

    const { count: partnersCount } = await supabaseClient.from('partnerships').select('*', { count: 'exact', head: true }).eq('status', 'active').or(`user_1.eq.${user.id},user_2.eq.${user.id}`);
    if (partnersCount >= 1) eligibleCodes.push('first_partner');

    const { data: allHabits } = await supabaseClient.from('habits').select('id').eq('user_id', user.id);
    if (allHabits && allHabits.length > 0) {
        const { count: totalLogs } = await supabaseClient.from('habit_logs').select('*', { count: 'exact', head: true }).in('habit_id', allHabits.map(h => h.id));
        if (totalLogs >= 50) eligibleCodes.push('total_50');
        if (totalLogs >= 100) eligibleCodes.push('total_100');
    }

    // Lógica Semana 100%
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - mondayOffset);
    const weekStartStr = getLocalDateString(weekStart);
    const todayStr = getLocalDateString(today);

    if (allHabits && allHabits.length > 0) {
        const { data: weekLogs } = await supabaseClient.from('habit_logs').select('habit_id').in('habit_id', allHabits.map(h => h.id)).gte('log_date', weekStartStr).lte('log_date', todayStr);
        const habitsWithLog = new Set((weekLogs || []).map(l => l.habit_id));
        if (habitsWithLog.size === allHabits.length) eligibleCodes.push('weekly_100');
    }

    // C. Identificar las NUEVAS (Elegibles pero no actuales)
    const { data: allBadgesCatalog } = await supabaseClient.from('badges').select('id, code, icon, name, description');
    const newBadgesToUnlock = [];

    eligibleCodes.forEach(code => {
        const badge = allBadgesCatalog.find(b => b.code === code);
        if (badge && !currentIds.has(badge.id)) {
            newBadgesToUnlock.push(badge);
        }
    });

    // D. Si hay nuevas, insertarlas y mostrar Toast
    if (newBadgesToUnlock.length > 0) {
        for (const badge of newBadgesToUnlock) {
            await supabaseClient.from('user_badges').insert({ user_id: user.id, badge_id: badge.id });
            // ¡Aquí lanzamos la magia!
            showBadgeToast(badge);
        }
        // Recargar la lista visual
        await loadBadges();
    }
}

window.loadBadges = loadBadges;
window.checkAndUnlockBadges = checkAndUnlockBadges;