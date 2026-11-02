// --- SISTEMA DE INSIGNIAS CON TOAST ---

// 1. Función para mostrar el Toast
function showBadgeToast(badge) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Crear el elemento del toast
    const toast = document.createElement('div');
    // Clases para animación de entrada (slide-in) y estilo dorado
    toast.className = `
        pointer-events-auto transform transition-all duration-500 ease-out translate-x-full opacity-0
        bg-gradient-to-r from-yellow-400 to-orange-500 text-white p-4 rounded-lg shadow-xl 
        border border-yellow-300 flex items-center gap-4 min-w-[300px] max-w-sm
    `;

    toast.innerHTML = `
        <div class="text-4xl animate-bounce">${badge.icon}</div>
        <div class="flex-1">
            <p class="text-xs font-bold uppercase tracking-wider text-yellow-100">¡Insignia Desbloqueada!</p>
            <h4 class="text-lg font-bold leading-tight">${badge.name}</h4>
            <p class="text-xs text-yellow-50 mt-1">${badge.description}</p>
        </div>
    `;

    container.appendChild(toast);

    // Forzar reflow para que la animación CSS funcione
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    });

    // Eliminar después de 4 segundos con animación de salida
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 500); // Esperar a que termine la transición
    }, 4000);
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
        return `
            <div class="relative rounded-lg border-2 p-4 transition-all ${
                isUnlocked 
                    ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-600 shadow-md' 
                    : 'border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 opacity-60 grayscale'
            }">
                <div class="flex items-start gap-3">
                    <div class="text-3xl ${isUnlocked ? 'drop-shadow-md' : ''}">${badge.icon}</div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-bold text-sm text-gray-800 dark:text-gray-100 truncate">${badge.name}</h4>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${badge.description}</p>
                        <p class="text-xs mt-1 ${isUnlocked ? 'text-yellow-700 dark:text-yellow-400 font-semibold' : 'text-gray-400'}">
                            ${isUnlocked ? '✓ Desbloqueada' : '🔒 ' + badge.requirement}
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