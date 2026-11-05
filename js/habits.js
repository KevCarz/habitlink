const habitsList = document.getElementById('habits-list');
const emptyState = document.getElementById('empty-state');
const habitsError = document.getElementById('habits-error');
const dailySummary = document.getElementById('daily-summary');
const weeklySummary = document.getElementById('weekly-summary');
const modalHabit = document.getElementById('modal-habit');
const habitForm = document.getElementById('habit-form');
const habitMessage = document.getElementById('habit-message');
const habitSubmitBtn = document.getElementById('habit-submit-btn');

let habitRealtimeChannel = null;
let habitMessageTimeout = null;
let comparisonContext = null;
let comparisonPartnerSelectionBound = false;

// Convierte una fecha YYYY-MM-DD sin desplazarla al día anterior por UTC.
function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function addDays(dateString, days) {
    const date = parseLocalDate(dateString);
    date.setDate(date.getDate() + days);
    return getLocalDateString(date);
}

function getHabitStreak(habit, logDates) {
    const uniqueDates = new Set((logDates || []).filter(Boolean));
    if (!uniqueDates.size) return 0;

    const today = getLocalDateString();

    if (habit.frequency === 'weekly') {
        const currentWeek = getWeekStartDate();
        const previousWeek = addDays(currentWeek, -7);
        const hasWeekLog = week => Array.from(uniqueDates).some(date =>
            date >= week && date <= addDays(week, 6)
        );
        let week = hasWeekLog(currentWeek)
            ? currentWeek
            : (hasWeekLog(previousWeek) ? previousWeek : null);
        let streak = 0;

        while (week) {
            const weekEnd = addDays(week, 6);
            const hasLog = Array.from(uniqueDates).some(date =>
                date >= week && date <= weekEnd
            );
            if (!hasLog) break;
            streak++;
            week = addDays(week, -7);
        }
        return streak;
    }

    let day = uniqueDates.has(today) ? today : addDays(today, -1);
    let streak = 0;
    while (uniqueDates.has(day)) {
        streak++;
        day = addDays(day, -1);
    }
    return streak;
}

function showHabitError(message) {
    habitsError.textContent = message;
    habitsError.classList.remove('hidden');
}

function clearHabitError() {
    habitsError.textContent = '';
    habitsError.classList.add('hidden');
}

function showHabitFormMessage(message, isError = false) {
    habitMessage.textContent = message;
    habitMessage.className = `text-center text-sm ${isError ? 'text-red-600 dark:text-red-300' : 'text-[#42695a] dark:text-[#91b8a7]'}`;
    habitMessage.classList.remove('hidden');
    clearTimeout(habitMessageTimeout);
    habitMessageTimeout = setTimeout(() => habitMessage.classList.add('hidden'), 3500);
}

let habitLoadRunning = false;
let habitLoadRequested = false;

async function renderHabits() {
    if (!supabaseClient) return;
    if (!habitsList || !emptyState || !dailySummary || !weeklySummary) return;

    const { data: userData, error: authError } = await supabaseClient.auth.getUser();
    if (authError) {
        console.error('Error obteniendo el usuario:', authError);
        showHabitError('No se pudo verificar tu sesión.');
        return;
    }
    const user = userData?.user;
    if (!user) {
        habitsList.replaceChildren();
        emptyState.classList.remove('hidden');
        dailySummary.textContent = '0 de 0 hábitos diarios completados hoy';
        weeklySummary.textContent = '0 de 0 hábitos semanales completados';
        return;
    }

    const { data: habits, error } = await supabaseClient
        .from('habits')
        .select('id, title, description, frequency, streak_count, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error cargando hábitos:', error);
        showHabitError('No se pudieron cargar tus hábitos.');
        return;
    }

    clearHabitError();
    habitsList.replaceChildren();
    const uniqueHabits = Array.from(new Map((habits ?? []).map(habit => [habit.id, habit])).values());
    const today = getLocalDateString();
    
    if (!uniqueHabits.length) {
        dailySummary.textContent = '0 de 0 hábitos diarios completados hoy';
        weeklySummary.textContent = '0 de 0 hábitos semanales completados';
        emptyState.classList.remove('hidden');
        await Promise.all([loadYearlyHeatmap(), loadWeeklyCharts()]);
        return;
    }

    const { data: logs, error: logsError } = await supabaseClient
        .from('habit_logs')
        .select('habit_id, log_date')
        .in('habit_id', uniqueHabits.map(habit => habit.id));

    if (logsError) {
        console.error('Error cargando registros:', logsError);
        showHabitError('No se pudo cargar el progreso.');
        return;
    }

    const habitLogs = logs ?? [];
    const logsByHabit = {};
    habitLogs.forEach(log => {
        if (!logsByHabit[log.habit_id]) logsByHabit[log.habit_id] = new Set();
        logsByHabit[log.habit_id].add(log.log_date);
    });

    const streakUpdates = [];
    for (const habit of uniqueHabits) {
        const streak = getHabitStreak(habit, Array.from(logsByHabit[habit.id] || []));
        if ((habit.streak_count || 0) !== streak) {
            streakUpdates.push(
                supabaseClient
                    .from('habits')
                    .update({ streak_count: streak })
                    .eq('id', habit.id)
                    .eq('user_id', user.id)
            );
            habit.streak_count = streak;
        }
    }
    const updateResults = await Promise.all(streakUpdates);
    const updateError = updateResults.find(result => result?.error)?.error;
    if (updateError) {
        console.error('Error actualizando rachas:', updateError);
        showHabitError('No se pudieron guardar todas las rachas.');
    }

    const weekStart = getWeekStartDate();
    const completedToday = new Set(habitLogs.filter(log => log.log_date === today).map(log => log.habit_id));
    const completedThisWeek = new Set(habitLogs
        .filter(log => log.log_date >= weekStart && log.log_date <= today)
        .map(log => log.habit_id));

    const dailyHabits = uniqueHabits.filter(habit => habit.frequency === 'daily');
    const weeklyHabits = uniqueHabits.filter(habit => habit.frequency === 'weekly');
    
    dailySummary.textContent = `${dailyHabits.filter(h => completedToday.has(h.id)).length} de ${dailyHabits.length} hábitos diarios completados hoy`;
    weeklySummary.textContent = `${weeklyHabits.filter(h => completedThisWeek.has(h.id)).length} de ${weeklyHabits.length} hábitos semanales completados esta semana`;
    emptyState.classList.add('hidden');

    const generateHeatmap = (habitId) => {
    let html = '<div class="mt-3 flex gap-1 justify-between" title="Actividad de los últimos 14 días">';
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = getLocalDateString(d);
        const isCompleted = logsByHabit[habitId]?.has(dateStr);
        
        const bgClass = isCompleted 
            ? 'bg-[#668c7b] dark:bg-[#91b8a7] hover:bg-[#42695a] dark:hover:bg-[#b2ccbf]' 
            : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600';
        
        const dayName = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
        
        html += `<div class="h-3 w-3 shrink-0 rounded-sm sm:h-4 sm:w-4 ${bgClass} transition-colors cursor-default" title="${dayName}: ${isCompleted ? 'Completado' : 'Pendiente'}"></div>`;
    }
    html += '</div>';
    return html;
};

            // ✅ MEJORA #2: Ordenar hábitos (pendientes primero, completados al fondo)
    uniqueHabits.sort((a, b) => {
        const isADone = (a.frequency === 'weekly' ? completedThisWeek : completedToday).has(a.id);
        const isBDone = (b.frequency === 'weekly' ? completedThisWeek : completedToday).has(b.id);
        return (isADone ? 1 : 0) - (isBDone ? 1 : 0);
    });

    // Función para generar el heatmap de 14 días
    // ✅ BUCLE DE TARJETAS (con fuego, verde vivo y ordenamiento)
    for (const habit of uniqueHabits) {
        const isWeekly = habit.frequency === 'weekly';
        const isCompleted = (isWeekly ? completedThisWeek : completedToday).has(habit.id);
        
        const card = document.createElement('article');
        card.dataset.habitId = habit.id;
        card.classList.add('min-w-0');
        
        // Tarjeta con estilo dinámico según estado
        if (isCompleted) {
            // Completado: fondo verde sutil, borde verde brillante, animación pop
            card.className = 'hl-card min-w-0 p-4 transition-all animate-pop sm:p-6';
            card.style.borderLeft = '4px solid var(--hl-success)';
            card.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, var(--hl-surface) 100%)';
        } else {
            // Pendiente: borde índigo, fondo normal, hover con elevación
            card.className = 'hl-card min-w-0 p-4 transition-all hover:-translate-y-0.5 sm:p-6';
            card.style.borderLeft = '4px solid var(--hl-primary)';
        }

        card.innerHTML = `
            <div class="mb-3 flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <h3 class="break-words text-lg font-bold leading-tight sm:text-xl ${isCompleted ? 'line-through' : ''}" 
                        style="color: ${isCompleted ? 'var(--hl-success)' : 'var(--hl-text)'};">
                        ${escapeHTML(habit.title)}
                    </h3>
                    ${habit.description ? `<p class="text-sm mt-1" style="color: var(--hl-muted);">${escapeHTML(habit.description)}</p>` : ''}
                </div>
                <span class="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                    isWeekly 
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' 
                        : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                }">
                    ${isWeekly ? 'Semanal' : 'Diario'}
                </span>
            </div>
            
            ${generateHeatmap(habit.id)}
            
            <div class="mt-4 flex flex-col items-stretch justify-between gap-3 pt-4 sm:flex-row sm:items-center" style="border-top: 1px solid var(--hl-line);">
                <!-- ✅ RACHA CON EMOJI 🔥 -->
                <span class="text-sm font-medium flex items-center gap-1" style="color: var(--hl-muted);">
                    <span class="text-lg">🔥</span>
                    <span style="color: var(--hl-accent); font-weight: 700;">${habit.streak_count || 0}</span>
                    <span>${isWeekly ? 'semanas' : 'días'}</span>
                </span>
                
                <div class="flex flex-wrap justify-end gap-2">
                    <!-- ✅ BOTÓN MARCAR: verde vivo con gradiente cuando está pendiente -->
                    <button type="button" data-action="toggle" data-habit-id="${escapeHTML(habit.id)}" data-frequency="${isWeekly ? 'weekly' : 'daily'}" data-completed="${isCompleted}" 
                            class="hl-btn-primary ${isCompleted ? 'hl-btn-secondary' : ''}"
                            style="${isCompleted ? '' : 'background: linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); color: white; border: none;'}">
                        ${isCompleted ? 'Desmarcar' : '✓ Hecho'}
                    </button>
                    <button type="button" data-action="edit" data-habit-id="${escapeHTML(habit.id)}" 
                            class="hl-btn-icon" 
                            style="border-color: var(--hl-line); background: var(--hl-primary-light); color: var(--hl-primary);"
                            aria-label="Editar hábito">
                        ✏️
                    </button>
                    <button type="button" data-action="delete" data-habit-id="${escapeHTML(habit.id)}" 
                            class="hl-btn-icon" 
                            style="border-color: var(--hl-line); background: rgba(239, 68, 68, 0.1); color: var(--hl-danger);"
                            aria-label="Eliminar hábito">
                        🗑
                    </button>
                </div>
            </div>
        `;
    
        habitsList.appendChild(card);
    }

    // Mantener sincronizadas la lista, el mapa anual y las gráficas semanales.
    await Promise.all([loadYearlyHeatmap(), loadWeeklyCharts()]);
}

async function loadHabits() {
    habitLoadRequested = true;
    if (habitLoadRunning) return;

    habitLoadRunning = true;
    try {
        while (habitLoadRequested) {
            habitLoadRequested = false;
            await renderHabits();
        }
    } finally {
        habitLoadRunning = false;
    }
}

async function loadYearlyHeatmap() {
    if (!supabaseClient) return;

    const { data: userData, error: authError } = await supabaseClient.auth.getUser();
    if (authError) {
        console.error('Error obteniendo el usuario para el heatmap:', authError);
        return;
    }
    const user = userData?.user;
    if (!user) return;

    // Calcular rango de fechas (últimos 365 días)
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 364); // 365 días en total
    const startDateStr = getLocalDateString(startDate);
    const todayStr = getLocalDateString(today);

    // Obtener todos los hábitos del usuario
    const { data: habits, error: habitsError } = await supabaseClient
        .from('habits')
        .select('id')
        .eq('user_id', user.id);

    if (habitsError || !habits?.length) {
        document.getElementById('yearly-heatmap').innerHTML =
            '<p class="text-center text-sm text-gray-400 py-4">Aún no hay actividad</p>';
        document.getElementById('yearly-total').textContent = '0 hábitos completados';
        return;
    }

    // Obtener todos los logs del año
    const { data: logs, error: logsError } = await supabaseClient
        .from('habit_logs')
        .select('log_date')
        .in('habit_id', habits.map(h => h.id))
        .gte('log_date', startDateStr)
        .lte('log_date', todayStr);

    if (logsError) {
        console.error('Error cargando heatmap anual:', logsError);
        return;
    }

    // Contar hábitos completados por día
    const countsByDate = {};
    let totalCompleted = 0;
    (logs ?? []).forEach(log => {
        countsByDate[log.log_date] = (countsByDate[log.log_date] || 0) + 1;
        totalCompleted++;
    });

    // Actualizar contador total
    document.getElementById('yearly-total').textContent = 
        `${totalCompleted} hábitos completados`;

    // Generar el calendario
    const heatmapContainer = document.getElementById('yearly-heatmap');
    heatmapContainer.innerHTML = '';

    // Crear grid: 7 filas (días de la semana) x 53 columnas (semanas)
    const grid = document.createElement('div');
    grid.className = 'grid gap-1';
    grid.style.gridAutoFlow = 'column';

    const cellSize = window.innerWidth < 640 ? 10 : 12;
    const extraVerticalSpace = Math.min(112, Math.max(0, (habits.length - 1) * 5));
    const rowSize = cellSize + Math.round(extraVerticalSpace / 7);
    grid.style.gridTemplateRows = `repeat(7, ${rowSize}px)`;
    grid.style.gridAutoColumns = `${rowSize}px`;
    grid.style.width = 'max-content';

    // Alinear al lunes como primer día
    const firstDayOfWeek = startDate.getDay(); // 0=Dom, 1=Lun...
    const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    // Días vacíos al inicio para alinear con el día de la semana correcto
    for (let i = 0; i < offset; i++) {
        const empty = document.createElement('div');
        empty.style.width = `${rowSize}px`;
        empty.style.height = `${rowSize}px`;
        grid.appendChild(empty);
    }

    // Generar los 365 días
    const current = new Date(startDate);
    while (current <= today) {
        const dateStr = getLocalDateString(current);
        const count = countsByDate[dateStr] || 0;
        
        // Determinar color según cantidad
     let colorClass;
if (count === 0) {
    colorClass = 'bg-gray-300 dark:bg-gray-700'; // Gris claro
} else if (count <= 2) {
    colorClass = 'bg-[#9be9a8] dark:bg-[#0e4429]'; // Verde claro GitHub
} else if (count <= 4) {
    colorClass = 'bg-[#40c463] dark:bg-[#216e39]'; // Verde medio GitHub
} else if (count <= 6) {
    colorClass = 'bg-[#30a14e] dark:bg-[#30a14e]'; // Verde fuerte GitHub
} else {
    colorClass = 'bg-[#216e39] dark:bg-[#39d353]'; // Verde oscuro GitHub (más vivo en dark)
}

        const cell = document.createElement('div');
        cell.className = `rounded-sm ${colorClass} cursor-pointer transition-transform hover:scale-125`;
        cell.style.width = `${rowSize}px`;
        cell.style.height = `${rowSize}px`;
        cell.title = `${dateStr}: ${count} hábito(s) completado(s)`;
        grid.appendChild(cell);

        current.setDate(current.getDate() + 1);
    }

    heatmapContainer.appendChild(grid);

    const scrollContainer = document.getElementById('yearly-heatmap-scroll');
    if (scrollContainer) {
        requestAnimationFrame(() => {
            scrollContainer.scrollLeft = scrollContainer.scrollWidth;
        });
    }
}

async function loadWeeklyCharts() {
    if (!supabaseClient) return;

    const { data: userData, error: authError } = await supabaseClient.auth.getUser();
    if (authError) {
        console.error('Error obteniendo el usuario para las gráficas:', authError);
        return;
    }
    const user = userData?.user;
    if (!user) return;

    // Calcular inicio y fin de la semana actual (lunes a domingo)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Dom, 1=Lun...
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const weekStartStr = getLocalDateString(weekStart);
    const weekEndStr = getLocalDateString(weekEnd);

    // Obtener hábitos del usuario
    const { data: myHabits, error: habitsError } = await supabaseClient
        .from('habits')
        .select('id, frequency')
        .eq('user_id', user.id);

    if (habitsError || !myHabits?.length) {
        document.getElementById('weekly-bars').innerHTML =
            '<p class="text-center text-sm text-gray-400 py-4">Aún no hay hábitos</p>';
        document.getElementById('weekly-percentage').textContent = '0%';
        document.getElementById('my-weekly-pct').textContent = '0%';
        document.getElementById('partner-comparison').classList.add('hidden');
        return;
    }

    // Obtener logs de esta semana
    const { data: myLogs, error: logsError } = await supabaseClient
        .from('habit_logs')
        .select('habit_id, log_date')
        .in('habit_id', myHabits.map(h => h.id))
        .gte('log_date', weekStartStr)
        .lte('log_date', weekEndStr);

    if (logsError) {
        console.error('Error cargando gráficas semanales:', logsError);
        return;
    }

    // Calcular cumplimiento por día
    const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const daysCompleted = [0, 0, 0, 0, 0, 0, 0];
    const dailyHabits = myHabits.filter(habit => habit.frequency === 'daily');
    const weeklyHabits = myHabits.filter(habit => habit.frequency === 'weekly');
    const dailyHabitIds = new Set(dailyHabits.map(habit => habit.id));
    const weeklyHabitIds = new Set(weeklyHabits.map(habit => habit.id));
    const completedWeeklyIds = new Set();
    const completedDailyOccurrences = new Set();
    const totalPerDay = dailyHabits.length;

    // Contar solo hábitos diarios en las barras; los semanales cuentan una vez por semana.
    (myLogs ?? []).forEach(log => {
        const logDate = parseLocalDate(log.log_date);
        let dayIndex = logDate.getDay() - 1;
        if (dayIndex < 0) dayIndex = 6;

        if (dailyHabitIds.has(log.habit_id)) {
            const occurrenceKey = `${log.habit_id}:${log.log_date}`;
            if (!completedDailyOccurrences.has(occurrenceKey)) {
                completedDailyOccurrences.add(occurrenceKey);
                daysCompleted[dayIndex]++;
            }
        }
        if (weeklyHabitIds.has(log.habit_id)) completedWeeklyIds.add(log.habit_id);
    });

    const elapsedDays = Math.min(7, Math.round((parseLocalDate(getLocalDateString()) - weekStart) / 86400000) + 1);
    const totalPossible = (totalPerDay * elapsedDays) + weeklyHabits.length;
    const totalCompleted = completedDailyOccurrences.size + completedWeeklyIds.size;
    const weeklyPct = totalPossible > 0 ? Math.min(100, Math.round((totalCompleted / totalPossible) * 100)) : 0;
    document.getElementById('weekly-percentage').textContent = `${weeklyPct}%`;
    document.getElementById('my-weekly-pct').textContent = `${weeklyPct}%`;

    // Renderizar barras por día
    const barsContainer = document.getElementById('weekly-bars');
    barsContainer.innerHTML = daysOfWeek.map((day, index) => {
        const completed = daysCompleted[index];
        const pct = totalPerDay > 0 ? Math.round((completed / totalPerDay) * 100) : 0;
        const isToday = index === (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
        
        return `
            <div class="flex items-center gap-3">
                <span class="w-20 text-xs font-medium ${isToday ? 'text-[#42695a] dark:text-[#91b8a7] font-bold' : 'text-gray-600 dark:text-gray-400'}">${day}</span>
                <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full ${pct === 100 ? 'bg-[#668c7b]' : pct >= 50 ? 'bg-[#42695a]' : 'bg-[#9aa49f]'} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
                <span class="w-10 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">${pct}%</span>
            </div>
        `;
    }).join('');

    // Cargar comparativa con compañero
    comparisonContext = { userId: user.id, weekStartStr, weekEndStr, myWeeklyPct: weeklyPct };
    await loadPartnerComparison(comparisonContext.userId, weekStartStr, weekEndStr, weeklyPct);
}

async function loadPartnerComparison(userId, weekStartStr, weekEndStr, myWeeklyPct) {
    const comparisonDiv = document.getElementById('partner-comparison');
    const selector = document.getElementById('partner-selector');
    if (!comparisonDiv || !selector) return;

    if (!comparisonPartnerSelectionBound) {
        selector.addEventListener('change', () => {
            if (!comparisonContext) return;
            loadPartnerComparison(
                comparisonContext.userId,
                comparisonContext.weekStartStr,
                comparisonContext.weekEndStr,
                comparisonContext.myWeeklyPct
            );
        });
        comparisonPartnerSelectionBound = true;
    }

    const { data: partnerships, error: partnershipsError } = await supabaseClient
        .from('partnerships')
        .select('user_1, user_2')
        .eq('status', 'active')
        .or(`user_1.eq.${userId},user_2.eq.${userId}`);

    if (partnershipsError) {
        console.error('Error cargando compañeros para la comparativa:', partnershipsError);
        comparisonDiv.classList.add('hidden');
        return;
    }

    const partnerIds = [...new Set((partnerships || []).map(partnership =>
        partnership.user_1 === userId ? partnership.user_2 : partnership.user_1
    ))];

    if (!partnerIds.length) {
        selector.replaceChildren(new Option('Sin compañeros activos', ''));
        comparisonDiv.classList.add('hidden');
        return;
    }

    const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('id, username')
        .in('id', partnerIds);
    const profileById = new Map((profiles || []).map(profile => [profile.id, profile]));

    const currentSelection = selector.value;
    selector.innerHTML = '';
    partnerIds.forEach(partnerId => {
        const username = profileById.get(partnerId)?.username || 'Usuario';
        selector.add(new Option(username, partnerId));
    });
    if (partnerIds.includes(currentSelection)) selector.value = currentSelection;

    const partnerId = selector.value || partnerIds[0];
    selector.value = partnerId;
    const partnerName = profileById.get(partnerId)?.username || 'Compañero';

    // Obtener hábitos del compañero
    const { data: partnerHabits } = await supabaseClient
        .from('habits')
        .select('id, frequency')
        .eq('user_id', partnerId);

    if (!partnerHabits?.length) {
        document.getElementById('partner-label').textContent = partnerName;
        document.getElementById('partner-weekly-pct').textContent = '0%';
        document.getElementById('comparison-message').textContent = `${partnerName} aún no tiene hábitos`;
        comparisonDiv.classList.remove('hidden');
        return;
    }

    // Obtener logs del compañero esta semana
    const { data: partnerLogs } = await supabaseClient
        .from('habit_logs')
        .select('habit_id, log_date')
        .in('habit_id', partnerHabits.map(h => h.id))
        .gte('log_date', weekStartStr)
        .lte('log_date', weekEndStr);

    const dailyPartnerHabits = partnerHabits.filter(habit => habit.frequency === 'daily');
    const weeklyPartnerHabits = partnerHabits.filter(habit => habit.frequency === 'weekly');
    const weeklyPartnerIds = new Set(weeklyPartnerHabits.map(habit => habit.id));
    const dailyPartnerIds = new Set(partnerHabits.filter(habit => habit.frequency === 'daily').map(habit => habit.id));
    const completedPartnerWeeklyIds = new Set();
    let partnerDailyTotal = 0;
    const completedDailyPartnerOccurrences = new Set();

    (partnerLogs ?? []).forEach(log => {
        if (dailyPartnerIds.has(log.habit_id)) {
            completedDailyPartnerOccurrences.add(`${log.habit_id}:${log.log_date}`);
        }
        if (weeklyPartnerIds.has(log.habit_id)) completedPartnerWeeklyIds.add(log.habit_id);
    });
    partnerDailyTotal = completedDailyPartnerOccurrences.size;

    const elapsedDays = Math.min(7, Math.round((parseLocalDate(getLocalDateString()) - parseLocalDate(weekStartStr)) / 86400000) + 1);
    const partnerPossible = (dailyPartnerHabits.length * elapsedDays) + weeklyPartnerIds.size;
    const partnerTotal = partnerDailyTotal + completedPartnerWeeklyIds.size;
    const partnerPct = partnerPossible > 0 ? Math.min(100, Math.round((partnerTotal / partnerPossible) * 100)) : 0;

    // Actualizar UI
    document.getElementById('partner-label').textContent = partnerName;
    document.getElementById('partner-weekly-pct').textContent = `${partnerPct}%`;
    
    // Mensaje comparativo
    const diff = myWeeklyPct - partnerPct;
    let message = '';
    if (diff > 0) {
        message = `🔥 ¡Vas ${diff}% adelante esta semana!`;
    } else if (diff < 0) {
        message = `💪 Tu compañero va ${Math.abs(diff)}% adelante. ¡A recuperar!`;
    } else {
        message = `🤝 ¡Empate perfecto esta semana!`;
    }
    document.getElementById('comparison-message').textContent = message;

    comparisonDiv.classList.remove('hidden');
}

async function toggleHabit(habitId, frequency, isCompleted) {
    try {
        const today = getLocalDateString();

        if (isCompleted) {
            let query = supabaseClient.from('habit_logs').delete().eq('habit_id', habitId);
            if (frequency === 'weekly') {
                query = query.gte('log_date', getWeekStartDate()).lte('log_date', today);
            } else {
                query = query.eq('log_date', today);
            }
            const { error } = await query;
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('habit_logs')
                .insert({ habit_id: habitId, log_date: today });
            if (error?.code === '23505') {
                await loadHabits();
                return;
            }
            if (error) throw error;
        }

        await loadHabits();
    } catch (error) {
        console.error('Error actualizando el progreso:', error);
        showHabitError(`No se pudo actualizar: ${error.message}`);
    }
    // Verificar insignias después de actualizar
    if (typeof checkAndUnlockBadges === 'function') {
    checkAndUnlockBadges();
}
}

habitsList.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    button.disabled = true;
     const originalButtonText = button.textContent.trim();
     if (button.dataset.action === 'toggle') {
         button.textContent = 'Guardando...';
     }
     try {
        if (button.dataset.action === 'toggle') {
            await toggleHabit(button.dataset.habitId, button.dataset.frequency, button.dataset.completed === 'true');
        } else if (button.dataset.action === 'edit') {
            await openEditModal(button.dataset.habitId);
        } else if (button.dataset.action === 'delete' && confirm('¿Eliminar este hábito y su progreso?')) {
            const { data: userData, error: authError } = await supabaseClient.auth.getUser();
            if (authError) throw authError;
            const user = userData?.user;
            if (!user) throw new Error('Inicia sesión');

            const { error } = await supabaseClient
                .from('habits')
                .delete()
                .eq('id', button.dataset.habitId)
                .eq('user_id', user.id);
            if (error) throw error;
            await loadHabits();
        }
    } catch (error) {
        console.error('Error gestionando el hábito:', error);
        showHabitError('No se pudo completar la acción.');
    } finally {
        button.disabled = false;
        if (button.dataset.action === 'toggle') {
            button.textContent = originalButtonText;
        }
    }
});

document.getElementById('btn-add-habit').addEventListener('click', () => {
    editingHabitId = null;
    habitForm.reset();
    habitMessage.classList.add('hidden');
    document.getElementById('habit-modal-heading').textContent = 'Nuevo hábito';
    habitSubmitBtn.textContent = 'Crear';
    modalHabit.classList.remove('hidden');
    modalHabit.classList.add('flex');
    document.getElementById('habit-title').focus();
});

document.getElementById('btn-cancel-habit').addEventListener('click', closeHabitModal);
modalHabit.addEventListener('click', event => {
    if (event.target === modalHabit) closeHabitModal();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modalHabit.classList.contains('hidden')) {
        closeHabitModal();
    }
});

// Variable para saber si estamos editando o creando
let editingHabitId = null;

async function openEditModal(habitId) {
    // Limitar la carga al propietario del hábito, además de confiar en las políticas RLS.
    const { data: userData, error: authError } = await supabaseClient.auth.getUser();
    if (authError) throw authError;
    const user = userData?.user;
    if (!user) throw new Error('Inicia sesión');

    const { data: habit, error } = await supabaseClient
        .from('habits')
        .select('*')
        .eq('id', habitId)
        .eq('user_id', user.id)
        .single();

    if (error) {
        console.error('Error cargando hábito:', error);
        showHabitError('No se pudo cargar el hábito para editarlo.');
        return;
    }

    // Precargar el formulario
    document.getElementById('habit-title').value = habit.title;
    document.getElementById('habit-description').value = habit.description || '';
    document.getElementById('habit-frequency').value = habit.frequency;

    // Cambiar el título y botón del modal
    document.getElementById('habit-modal-heading').textContent = 'Editar hábito';
    document.getElementById('habit-submit-btn').textContent = 'Guardar cambios';

    editingHabitId = habitId;
    modalHabit.classList.remove('hidden');
    modalHabit.classList.add('flex');
    document.getElementById('habit-title').focus();
}

function closeHabitModal() {
    modalHabit.classList.add('hidden');
    modalHabit.classList.remove('flex');
    editingHabitId = null;
    habitMessage.classList.add('hidden');
    // Restaurar título original y devolver el foco al elemento de creación.
    document.getElementById('habit-modal-heading').textContent = 'Nuevo hábito';
    document.getElementById('habit-submit-btn').textContent = 'Crear';
    document.getElementById('btn-add-habit').focus();
}

// Modificar el handler del formulario para manejar edición
habitForm.addEventListener('submit', async event => {
    event.preventDefault();
    const title = document.getElementById('habit-title').value.trim();
    const description = document.getElementById('habit-description').value.trim();
    const frequency = document.getElementById('habit-frequency').value;

    if (!title) {
        showHabitFormMessage('Escribe un título para el hábito.', true);
        document.getElementById('habit-title').focus();
        return;
    }

    if (!['daily', 'weekly'].includes(frequency)) {
        showHabitFormMessage('Selecciona una frecuencia válida.', true);
        return;
    }

    const wasEditing = editingHabitId !== null;
    habitSubmitBtn.disabled = true;
    showHabitFormMessage(wasEditing ? 'Actualizando...' : 'Creando hábito...');
    
    try {
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('Inicia sesión');

        let error;
        
        if (wasEditing) {
            const result = await supabaseClient
                .from('habits')
                .update({ title, description, frequency })
                .eq('id', editingHabitId)
                .eq('user_id', user.id);
            error = result.error;
        } else {
            const result = await supabaseClient
                .from('habits')
                .insert({ user_id: user.id, title, description, frequency, streak_count: 0 });
            error = result.error;
        }

        if (error) throw error;

        habitForm.reset();
        closeHabitModal();
        await loadHabits();
    } catch (error) {
        console.error('Error:', error);
        showHabitFormMessage(error.message || 'No se pudo guardar el hábito.', true);
    } finally {
        habitSubmitBtn.disabled = false;
    }
});

async function subscribeToRealtime(userId) {
    await unsubscribeHabitRealtime();
    habitRealtimeChannel = supabaseClient
        .channel(`habits-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${userId}` }, () => {
            // loadHabits refresca también el mapa anual y las gráficas semanales.
            loadHabits();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_logs' }, () => {
            loadHabits();
        })
        .subscribe();
}

async function unsubscribeHabitRealtime() {
    if (habitRealtimeChannel) {
        await supabaseClient.removeChannel(habitRealtimeChannel);
        habitRealtimeChannel = null;
    }
}

window.subscribeToRealtime = subscribeToRealtime;
window.unsubscribeHabitRealtime = unsubscribeHabitRealtime;
window.loadYearlyHeatmap = loadYearlyHeatmap;
window.loadWeeklyCharts = loadWeeklyCharts;

let yearlyHeatmapResizeTimeout = null;
window.addEventListener('resize', () => {
    clearTimeout(yearlyHeatmapResizeTimeout);
    yearlyHeatmapResizeTimeout = setTimeout(() => {
        if (document.getElementById('view-dashboard')?.classList.contains('flex')) {
            loadYearlyHeatmap();
        }
    }, 200);
});