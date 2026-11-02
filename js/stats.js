async function loadStats() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const resetStats = () => {
        document.getElementById('stat-total').textContent = '0';
        document.getElementById('stat-longest-streak').textContent = '0 días';
        document.getElementById('stat-best-day').textContent = '-';
        document.getElementById('stat-best-habit').textContent = '-';
        document.getElementById('monthly-chart').replaceChildren();
        document.getElementById('monthly-labels').replaceChildren();
    };

    const parseLocalDate = (value) => {
        const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
        return new Date(year, month - 1, day);
    };

    resetStats();

    // Obtener hábitos y registros pertenecientes al usuario actual.
    const { data: habits, error: habitsError } = await supabaseClient.from('habits').select('*').eq('user_id', user.id);
    if (habitsError) {
        console.error('No se pudieron cargar las estadísticas de hábitos:', habitsError);
        return;
    }
    if (!habits || habits.length === 0) return;

    const habitIds = habits.map(h => h.id);
    const { data: logs, error: logsError } = await supabaseClient
        .from('habit_logs')
        .select('habit_id, log_date')
        .in('habit_id', habitIds);

    if (logsError) {
        console.error('No se pudieron cargar los registros de hábitos:', logsError);
        return;
    }
    if (!logs) return;

    // --- CÁLCULO 1: Total Completados ---
    document.getElementById('stat-total').textContent = logs.length;

    // --- CÁLCULO 2: Racha Más Larga (Global) ---
    let maxStreak = 0;
    habits.forEach(habit => {
        const habitLogs = [...new Set(logs.filter(l => l.habit_id === habit.id).map(l => l.log_date))].sort();
        let currentStreak = 1;
        for (let i = 1; i < habitLogs.length; i++) {
            const prev = parseLocalDate(habitLogs[i-1]);
            const curr = parseLocalDate(habitLogs[i]);
            const diffTime = Math.abs(curr - prev);
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                currentStreak++;
                if (currentStreak > maxStreak) maxStreak = currentStreak;
            } else {
                currentStreak = 1;
            }
        }
        // Si solo tiene 1 log, la racha es 1
        if (habitLogs.length === 1 && maxStreak === 0) maxStreak = 1;
    });
    document.getElementById('stat-longest-streak').textContent = `${maxStreak} días`;

    // --- CÁLCULO 3: Mejor Día de la Semana ---
    const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Dom, Lun, Mar...
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    logs.forEach(log => {
        const day = parseLocalDate(log.log_date).getDay();
        dayCounts[day]++;
    });
    const bestDayIndex = dayCounts.indexOf(Math.max(...dayCounts));
    document.getElementById('stat-best-day').textContent = dayCounts[bestDayIndex] > 0 ? dayNames[bestDayIndex] : '-';

    // --- CÁLCULO 4: Hábito Top (Más completado) ---
    const habitCounts = {};
    logs.forEach(log => { habitCounts[log.habit_id] = (habitCounts[log.habit_id] || 0) + 1; });
    let topHabitId = null;
    let maxCount = 0;
    for (const [id, count] of Object.entries(habitCounts)) {
        if (count > maxCount) { maxCount = count; topHabitId = id; }
    }
    const topHabit = habits.find(h => h.id === topHabitId);
    document.getElementById('stat-best-habit').textContent = topHabit ? topHabit.title : '-';

    // --- CÁLCULO 5: Gráfico Mensual (Últimos 6 meses) ---
    const months = {};
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const today = new Date();
    
    // Inicializar últimos 6 meses en 0
    for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        months[key] = { count: 0, label: monthNames[d.getMonth()] };
    }

    logs.forEach(log => {
        const d = parseLocalDate(log.log_date);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (months[key] !== undefined) months[key].count++;
    });

    const maxMonthCount = Math.max(...Object.values(months).map(m => m.count), 1);
    const chartContainer = document.getElementById('monthly-chart');
    const labelsContainer = document.getElementById('monthly-labels');
    
    chartContainer.innerHTML = '';
    labelsContainer.innerHTML = '';

    Object.values(months).forEach(m => {
        const heightPct = (m.count / maxMonthCount) * 100;
        // Barras con fondo suave y color verde: comunican progreso sin parecer una herramienta técnica.
        chartContainer.innerHTML += `
            <div class="flex-1 flex flex-col justify-end items-center group relative">
                <div class="w-full rounded-t-lg bg-[#42695a] hover:bg-[#355747] transition-colors" style="height: ${heightPct}%"></div>
                <span class="absolute -top-6 text-xs font-bold text-gray-600 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">${m.count}</span>
            </div>`;
        labelsContainer.innerHTML += `<div class="flex-1 text-center">${m.label}</div>`;
    });
}

window.loadStats = loadStats;