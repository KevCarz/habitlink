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

// Convierte una fecha YYYY-MM-DD sin desplazarla al día anterior por UTC.
function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
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
    habitMessage.className = `text-center text-sm ${isError ? 'text-red-600 dark:text-red-300' : 'text-green-600 dark:text-green-300'}`;
    habitMessage.classList.remove('hidden');
    clearTimeout(habitMessageTimeout);
    habitMessageTimeout = setTimeout(() => habitMessage.classList.add('hidden'), 3500);
}

async function loadHabits() {
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
    const today = getLocalDateString();
    
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    const startDate = getLocalDateString(fourteenDaysAgo);

    if (!habits?.length) {
        dailySummary.textContent = '0 de 0 hábitos diarios completados hoy';
        weeklySummary.textContent = '0 de 0 hábitos semanales completados';
        emptyState.classList.remove('hidden');
        await Promise.all([loadYearlyHeatmap(), loadWeeklyCharts()]);
        return;
    }

    const { data: logs, error: logsError } = await supabaseClient
        .from('habit_logs')
        .select('habit_id, log_date')
        .in('habit_id', habits.map(habit => habit.id))
        .gte('log_date', startDate)
        .lte('log_date', today);

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

    const weekStart = getWeekStartDate();
    const completedToday = new Set(habitLogs.filter(log => log.log_date === today).map(log => log.habit_id));
    const completedThisWeek = new Set(habitLogs
        .filter(log => log.log_date >= weekStart && log.log_date <= today)
        .map(log => log.habit_id));

    const dailyHabits = habits.filter(habit => habit.frequency === 'daily');
    const weeklyHabits = habits.filter(habit => habit.frequency === 'weekly');
    
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
                ? 'bg-green-500 dark:bg-green-600 hover:bg-green-600 dark:hover:bg-green-500' 
                : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600';
            
            const dayName = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
            
            html += `<div class="w-4 h-4 rounded-sm ${bgClass} transition-colors cursor-default" title="${dayName}: ${isCompleted ? 'Completado' : 'Pendiente'}"></div>`;
        }
        html += '</div>';
        return html;
    };

    for (const habit of habits) {
        const isWeekly = habit.frequency === 'weekly';
        const isCompleted = (isWeekly ? completedThisWeek : completedToday).has(habit.id);
        
        const card = document.createElement('article');
        // Tarjeta más cálida y táctil: conserva el estado del hábito sin usar bordes técnicos pesados.
        card.className = `hl-card hl-card-subtle p-5 transition-all hover:-translate-y-0.5 ${isCompleted ? 'ring-1 ring-green-500/30' : ''}`;
        
        card.innerHTML = `
            <div class="mb-2 flex items-start justify-between gap-2">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 ${isCompleted ? 'line-through text-gray-400' : ''}">${escapeHTML(habit.title)}</h3>
                <span class="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${isWeekly ? 'bg-[#eee9f5] text-[#705d8a] dark:bg-[#3a3247] dark:text-[#d9ccec]' : 'bg-[#e9f0ec] text-[#42695a] dark:bg-[#314238] dark:text-[#b9d0c4]'}">${isWeekly ? 'Cada semana' : 'Cada día'}</span>
            </div>
            ${habit.description ? `<p class="mb-3 text-sm text-gray-500 dark:text-gray-400">${escapeHTML(habit.description)}</p>` : ''}
            ${generateHeatmap(habit.id)}
            <div class="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
                    🔥 Racha: <span class="text-orange-500 dark:text-orange-400">${habit.streak_count || 0} días</span>
                </span>
            <div class="flex gap-2">
                  <button type="button" data-action="toggle" data-habit-id="${escapeHTML(habit.id)}" data-frequency="${isWeekly ? 'weekly' : 'daily'}" data-completed="${isCompleted}" class="min-h-11 rounded-xl px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[#42695a] ${isCompleted ? 'border border-[#dde4e0] bg-[#f4f6f5] text-[#69736f] dark:bg-[#171c1a] dark:text-[#abb6b0]' : 'bg-[#42695a] text-white shadow-sm hover:bg-[#355747]'}">
                  ${isCompleted ? 'Desmarcar' : '✓ Hecho'}
                </button>
                  <button type="button" data-action="edit" data-habit-id="${escapeHTML(habit.id)}" class="flex min-h-11 w-11 items-center justify-center rounded-xl bg-[#edf1ef] text-base text-[#42695a] hover:bg-[#dde6e1] dark:bg-[#2d3832] dark:text-[#b9d0c4]" aria-label="Editar hábito">
        ✏️
                </button>
                <button type="button" data-action="delete" data-habit-id="${escapeHTML(habit.id)}" class="flex min-h-11 w-11 items-center justify-center rounded-xl bg-[#f8ecea] text-base text-[#a34e42] hover:bg-[#f2ddd9] dark:bg-[#4a302d] dark:text-[#efb6ac]" aria-label="Eliminar hábito">
        🗑
                </button>
                </div>
            </div>`;
        habitsList.appendChild(card);
    }

    // Mantener sincronizadas la lista, el mapa anual y las gráficas semanales.
    await Promise.all([loadYearlyHeatmap(), loadWeeklyCharts()]);
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
    grid.style.gridTemplateRows = 'repeat(7, 12px)';
    grid.style.gridAutoFlow = 'column';
    grid.style.gridAutoColumns = '12px';

    // Alinear al lunes como primer día
    const firstDayOfWeek = startDate.getDay(); // 0=Dom, 1=Lun...
    const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    // Días vacíos al inicio para alinear con el día de la semana correcto
    for (let i = 0; i < offset; i++) {
        const empty = document.createElement('div');
        empty.className = 'h-3 w-3';
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
            colorClass = 'bg-gray-200 dark:bg-gray-700';
        } else if (count <= 2) {
            colorClass = 'bg-green-200 dark:bg-green-900';
        } else if (count <= 4) {
            colorClass = 'bg-green-400 dark:bg-green-700';
        } else if (count <= 6) {
            colorClass = 'bg-green-600 dark:bg-green-500';
        } else {
            colorClass = 'bg-green-800 dark:bg-green-300';
        }

        const cell = document.createElement('div');
        cell.className = `h-3 w-3 rounded-sm ${colorClass} cursor-pointer transition-transform hover:scale-125`;
        cell.title = `${dateStr}: ${count} hábito(s) completado(s)`;
        grid.appendChild(cell);

        current.setDate(current.getDate() + 1);
    }

    heatmapContainer.appendChild(grid);
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
    const totalPerDay = dailyHabits.length;

    // Contar solo hábitos diarios en las barras; los semanales cuentan una vez por semana.
    (myLogs ?? []).forEach(log => {
        const logDate = parseLocalDate(log.log_date);
        let dayIndex = logDate.getDay() - 1;
        if (dayIndex < 0) dayIndex = 6;

        if (dailyHabitIds.has(log.habit_id)) daysCompleted[dayIndex]++;
        if (weeklyHabitIds.has(log.habit_id)) completedWeeklyIds.add(log.habit_id);
    });

    const elapsedDays = Math.min(7, Math.round((parseLocalDate(getLocalDateString()) - weekStart) / 86400000) + 1);
    const totalPossible = (totalPerDay * elapsedDays) + weeklyHabits.length;
    const totalCompleted = daysCompleted.reduce((a, b) => a + b, 0) + completedWeeklyIds.size;
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
                <span class="w-20 text-xs font-medium ${isToday ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-600 dark:text-gray-400'}">${day}</span>
                <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full ${pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-indigo-500' : 'bg-gray-400'} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
                <span class="w-10 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">${pct}%</span>
            </div>
        `;
    }).join('');

    // Cargar comparativa con compañero
    await loadPartnerComparison(user.id, weekStartStr, weekEndStr, weeklyPct);
}

async function loadPartnerComparison(userId, weekStartStr, weekEndStr, myWeeklyPct) {
    // Buscar compañero activo
    const { data: partnership } = await supabaseClient
        .from('partnerships')
        .select('user_1, user_2')
        .eq('status', 'active')
        .or(`user_1.eq.${userId},user_2.eq.${userId}`)
        .limit(1)
        .maybeSingle();

    const comparisonDiv = document.getElementById('partner-comparison');
    if (!comparisonDiv) return;
    
    if (!partnership) {
        comparisonDiv.classList.add('hidden');
        return;
    }

    const partnerId = partnership.user_1 === userId ? partnership.user_2 : partnership.user_1;

    // Obtener nombre del compañero
    const { data: partner } = await supabaseClient
        .from('profiles')
        .select('username')
        .eq('id', partnerId)
        .single();

    // Obtener hábitos del compañero
    const { data: partnerHabits } = await supabaseClient
        .from('habits')
        .select('id, frequency')
        .eq('user_id', partnerId);

    if (!partnerHabits?.length) {
        document.getElementById('partner-label').textContent = partner?.username || 'Compañero';
        document.getElementById('partner-weekly-pct').textContent = '0%';
        document.getElementById('comparison-message').textContent = 'Tu compañero aún no tiene hábitos';
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

    const dailyPartnerHabits = partnerHabits.filter(habit => habit.frequency === 'daily').length;
    const weeklyPartnerHabits = partnerHabits.filter(habit => habit.frequency === 'weekly');
    const weeklyPartnerIds = new Set(weeklyPartnerHabits.map(habit => habit.id));
    const dailyPartnerIds = new Set(partnerHabits.filter(habit => habit.frequency === 'daily').map(habit => habit.id));
    const completedPartnerWeeklyIds = new Set();
    let partnerDailyTotal = 0;

    (partnerLogs ?? []).forEach(log => {
        if (dailyPartnerIds.has(log.habit_id)) partnerDailyTotal++;
        if (weeklyPartnerIds.has(log.habit_id)) completedPartnerWeeklyIds.add(log.habit_id);
    });

    const elapsedDays = Math.min(7, Math.round((parseLocalDate(getLocalDateString()) - parseLocalDate(weekStartStr)) / 86400000) + 1);
    const partnerPossible = (dailyPartnerHabits * elapsedDays) + weeklyPartnerIds.size;
    const partnerTotal = partnerDailyTotal + completedPartnerWeeklyIds.size;
    const partnerPct = partnerPossible > 0 ? Math.min(100, Math.round((partnerTotal / partnerPossible) * 100)) : 0;

    // Actualizar UI
    document.getElementById('partner-label').textContent = partner?.username || 'Compañero';
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