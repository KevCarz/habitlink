// --- SISTEMA DE INSIGNIAS ---

async function loadBadges() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // 1. Obtener todas las insignias del catálogo
    const { data: allBadges, error: badgesError } = await supabaseClient
        .from('badges')
        .select('*')
        .order('created_at', { ascending: true });

    if (badgesError) {
        console.error('Error cargando insignias:', badgesError);
        return;
    }

    // 2. Obtener insignias desbloqueadas por el usuario
    const { data: userBadges, error: userBadgesError } = await supabaseClient
        .from('user_badges')
        .select('badge_id, unlocked_at')
        .eq('user_id', user.id);

    if (userBadgesError) {
        console.error('Error cargando insignias del usuario:', userBadgesError);
        return;
    }

    const unlockedIds = new Set((userBadges || []).map(ub => ub.badge_id));

    // 3. Renderizar
    const container = document.getElementById('badges-container');
    if (!container) return;

    const unlockedCount = unlockedIds.size;
    const totalCount = allBadges.length;
    
    document.getElementById('badges-unlocked-count').textContent = unlockedCount;
    document.getElementById('badges-total-count').textContent = totalCount;

    const progress = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;
    const progressBar = document.getElementById('badges-progress-bar');
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
        progressBar.parentElement?.setAttribute('aria-label', `${unlockedCount} de ${totalCount} insignias desbloqueadas`);
        progressBar.parentElement?.setAttribute('aria-valuenow', String(progress));
    }

    container.innerHTML = allBadges.map(badge => {
        const isUnlocked = unlockedIds.has(badge.id);
        return `
            <article class="relative overflow-hidden rounded-xl border p-3.5 transition-all sm:p-4 ${
                isUnlocked
                    ? 'border-amber-300 bg-gradient-to-br from-white to-amber-50 shadow-sm dark:border-amber-700 dark:from-gray-800 dark:to-amber-950/30'
                    : 'border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/60'
            }">
                <div class="flex items-start gap-3">
                    <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl shadow-sm ring-1 ring-gray-100 dark:bg-gray-700 dark:ring-gray-600 ${isUnlocked ? '' : 'grayscale opacity-50'}" aria-hidden="true">${badge.icon}</div>
                    <div class="min-w-0 flex-1">
                        <h4 class="truncate text-sm font-bold text-gray-800 dark:text-gray-100">${badge.name}</h4>
                        <p class="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">${badge.description}</p>
                        <p class="mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${isUnlocked ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}">
                            ${isUnlocked ? '✓ Desbloqueada' : '🔒 ' + badge.requirement}
                        </p>
                    </div>
                </div>
                ${isUnlocked ? '<div class="absolute right-3 top-3 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.15)]" aria-hidden="true"></div>' : ''}
            </article>
        `;
    }).join('');
}

async function checkAndUnlockBadges() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const badgesToUnlock = [];

    // --- VERIFICACIÓN 1: Primer hábito ---
    const { count: habitsCount } = await supabaseClient
        .from('habits')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

    if (habitsCount >= 1) badgesToUnlock.push('first_habit');
    if (habitsCount >= 5) badgesToUnlock.push('habit_collector');

    // --- VERIFICACIÓN 2: Rachas ---
    const { data: habits } = await supabaseClient
        .from('habits')
        .select('streak_count')
        .eq('user_id', user.id);

    if (habits) {
        const maxStreak = Math.max(...habits.map(h => h.streak_count || 0), 0);
        if (maxStreak >= 3) badgesToUnlock.push('streak_3');
        if (maxStreak >= 7) badgesToUnlock.push('streak_7');
        if (maxStreak >= 30) badgesToUnlock.push('streak_30');
    }

    // --- VERIFICACIÓN 3: Primer compañero ---
    const { count: partnersCount } = await supabaseClient
        .from('partnerships')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .or(`user_1.eq.${user.id},user_2.eq.${user.id}`);

    if (partnersCount >= 1) badgesToUnlock.push('first_partner');

    // --- VERIFICACIÓN 4: Total de hábitos completados ---
    const { data: allHabits } = await supabaseClient
        .from('habits')
        .select('id')
        .eq('user_id', user.id);

    if (allHabits && allHabits.length > 0) {
        const { count: totalLogs } = await supabaseClient
            .from('habit_logs')
            .select('*', { count: 'exact', head: true })
            .in('habit_id', allHabits.map(h => h.id));

        if (totalLogs >= 50) badgesToUnlock.push('total_50');
        if (totalLogs >= 100) badgesToUnlock.push('total_100');
    }

    // --- VERIFICACIÓN 5: Semana al 100% ---
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - mondayOffset);
    const weekStartStr = getLocalDateString(weekStart);
    const todayStr = getLocalDateString(today);

    if (allHabits && allHabits.length > 0) {
        const { data: weekLogs } = await supabaseClient
            .from('habit_logs')
            .select('habit_id, log_date')
            .in('habit_id', allHabits.map(h => h.id))
            .gte('log_date', weekStartStr)
            .lte('log_date', todayStr);

        // Verificar si cada hábito tiene al menos 1 log esta semana
        const habitsWithLogThisWeek = new Set((weekLogs || []).map(l => l.habit_id));
        if (habitsWithLogThisWeek.size === allHabits.length && allHabits.length > 0) {
            badgesToUnlock.push('weekly_100');
        }
    }

    // --- DESBLOQUEAR ---
    if (badgesToUnlock.length === 0) return;

    // Obtener IDs de las insignias a desbloquear
    const { data: badgesData } = await supabaseClient
        .from('badges')
        .select('id, code')
        .in('code', badgesToUnlock);

    if (!badgesData || badgesData.length === 0) return;

    // Insertar solo las que no tenga (usando el constraint unique)
    for (const badge of badgesData) {
        const { error } = await supabaseClient
            .from('user_badges')
            .insert({ user_id: user.id, badge_id: badge.id })
            .maybeSingle(); // Ignora error de duplicado silenciosamente
        
        if (error && error.code !== '23505') {
            console.error('Error desbloqueando insignia:', error);
        }
    }

    // Recargar para mostrar las nuevas
    await loadBadges();
}

window.loadBadges = loadBadges;
window.checkAndUnlockBadges = checkAndUnlockBadges;