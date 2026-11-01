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
        await loadYearlyHeatmap();
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
        card.className = `rounded-lg border-l-4 bg-white dark:bg-gray-800 p-5 shadow transition-all hover:shadow-md ${isCompleted ? 'border-green-500' : 'border-indigo-500'}`;
        
        card.innerHTML = `
            <div class="mb-2 flex items-start justify-between gap-2">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 ${isCompleted ? 'line-through text-gray-400' : ''}">${escapeHTML(habit.title)}</h3>
                <span class="shrink-0 rounded-full px-2 py-1 text-xs ${isWeekly ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'}">${isWeekly ? 'Semanal' : 'Diario'}</span>
            </div>
            ${habit.description ? `<p class="mb-3 text-sm text-gray-500 dark:text-gray-400">${escapeHTML(habit.description)}</p>` : ''}
            ${generateHeatmap(habit.id)}
            <div class="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
                    🔥 Racha: <span class="text-orange-500 dark:text-orange-400">${habit.streak_count || 0} días</span>
                </span>
            <div class="flex gap-2">
                  <button type="button" data-action="toggle" data-habit-id="${escapeHTML(habit.id)}" data-frequency="${isWeekly ? 'weekly' : 'daily'}" data-completed="${isCompleted}" class="rounded px-3 py-1.5 text-xs font-medium transition-colors ${isCompleted ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300' : 'bg-green-500 text-white hover:bg-green-600'}">
                  ${isCompleted ? 'Desmarcar' : 'Marcar'}
                </button>
                  <button type="button" data-action="edit" data-habit-id="${escapeHTML(habit.id)}" class="rounded bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50" aria-label="Editar">
        ✏️
                </button>
                <button type="button" data-action="delete" data-habit-id="${escapeHTML(habit.id)}" class="rounded bg-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50" aria-label="Eliminar">
        🗑
                </button>
                </div>
            </div>`;
        habitsList.appendChild(card);
    }

    // Mantener sincronizadas la lista y la actividad anual tras cada cambio.
    await loadYearlyHeatmap();
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
}

habitsList.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    button.disabled = true;
    try {
        if (button.dataset.action === 'toggle') {
            await toggleHabit(button.dataset.habitId, button.dataset.frequency, button.dataset.completed === 'true');
        } else if (button.dataset.action === 'edit') {
            openEditModal(button.dataset.habitId);
        } else if (button.dataset.action === 'delete' && confirm('¿Eliminar este hábito y su progreso?')) {
            const { error } = await supabaseClient
                .from('habits')
                .delete()
                .eq('id', button.dataset.habitId);
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
    // Buscar el hábito en la base de datos
    const { data: habit, error } = await supabaseClient
        .from('habits')
        .select('*')
        .eq('id', habitId)
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
    // Restaurar título original
    document.getElementById('habit-modal-heading').textContent = 'Nuevo hábito';
    document.getElementById('habit-submit-btn').textContent = 'Crear';
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
        showHabitFormMessage(wasEditing ? '¡Hábito actualizado!' : '¡Hábito creado!', false);
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