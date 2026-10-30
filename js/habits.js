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

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

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
    
    // Calcular fecha de hace 14 días para el heatmap
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    const startDate = getLocalDateString(fourteenDaysAgo);

    if (!habits?.length) {
        dailySummary.textContent = '0 de 0 hábitos diarios completados hoy';
        weeklySummary.textContent = '0 de 0 hábitos semanales completados';
        emptyState.classList.remove('hidden');
        return;
    }

    // Obtener logs de los últimos 14 días
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

    // Agrupar logs por hábito para el heatmap
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

    // Generar el HTML de los últimos 14 días para el heatmap
    const generateHeatmap = (habitId) => {
        let html = '<div class="mt-3 flex gap-1 justify-between" title="Actividad de los últimos 14 días">';
        for (let i = 13; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = getLocalDateString(d);
            const isCompleted = logsByHabit[habitId]?.has(dateStr);
            
            // Clases Tailwind: gris claro para vacío, verde para completado (con soporte dark mode)
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
            
            <!-- HEATMAP DE 14 DÍAS -->
            ${generateHeatmap(habit.id)}
            
            <div class="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
                    🔥 Racha: <span class="text-orange-500 dark:text-orange-400">${habit.streak_count || 0} días</span>
                </span>
                <div class="flex gap-2">
                    <button type="button" data-action="toggle" data-habit-id="${escapeHTML(habit.id)}" data-frequency="${isWeekly ? 'weekly' : 'daily'}" data-completed="${isCompleted}" class="rounded px-3 py-1.5 text-xs font-medium transition-colors ${isCompleted ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300' : 'bg-green-500 text-white hover:bg-green-600'}">
                        ${isCompleted ? 'Desmarcar' : 'Marcar'}
                    </button>
                    <button type="button" data-action="delete" data-habit-id="${escapeHTML(habit.id)}" class="rounded bg-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50" aria-label="Eliminar">
                        🗑
                    </button>
                </div>
            </div>`;
        habitsList.appendChild(card);
    }
}
async function toggleHabit(habitId, frequency, isCompleted) {
    try {
        const today = getLocalDateString();

        if (isCompleted) {
            // DESMARCAR: Borrar el log
            let query = supabaseClient
                .from('habit_logs')
                .delete()
                .eq('habit_id', habitId);

            if (frequency === 'weekly') {
                query = query.gte('log_date', getWeekStartDate()).lte('log_date', today);
            } else {
                query = query.eq('log_date', today);
            }

            const { error } = await query;
            if (error) {
                console.error('Error al desmarcar hábito:', error);
                throw error;
            }
        } else {
            // MARCAR: Verificar si ya existe
            const { data: existingLog, error: checkError } = await supabaseClient
                .from('habit_logs')
                .select('id')
                .eq('habit_id', habitId)
                .eq('log_date', today)
                .maybeSingle();

            if (checkError) {
                console.error('Error verificando log:', checkError);
                throw checkError;
            }

            if (!existingLog) {
                // Solo insertar si no existe
                const { error: insertError } = await supabaseClient
                    .from('habit_logs')
                    .insert({ habit_id: habitId, log_date: today });

                if (insertError?.code === '23505') {
                    await loadHabits();
                    return;
                }
                if (insertError) {
                    console.error('Error insertando log:', insertError);
                    throw insertError;
                }
            }
        }

        await loadHabits();
    } catch (error) {
        console.error('Error actualizando el progreso:', error);
        showHabitError(`No se pudo actualizar el hábito: ${error.message || 'Error desconocido'}`);
    }
}

habitsList.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    button.disabled = true;
    try {
        if (button.dataset.action === 'toggle') {
            await toggleHabit(button.dataset.habitId, button.dataset.frequency, button.dataset.completed === 'true');
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
        showHabitError('No se pudo completar la acción. Comprueba los permisos de Supabase e inténtalo de nuevo.');
    } finally {
        button.disabled = false;
    }
});

habitForm.addEventListener('submit', async event => {
    event.preventDefault();
    const title = document.getElementById('habit-title').value.trim();
    const description = document.getElementById('habit-description').value.trim();
    const frequency = document.getElementById('habit-frequency').value;

    if (!title) return;

    habitSubmitBtn.disabled = true;
    showHabitFormMessage('Creando hábito...');
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error('Inicia sesión para crear un hábito.');

        const { error } = await supabaseClient
            .from('habits')
            .insert({ user_id: user.id, title, description, frequency, streak_count: 0 });
        if (error) throw error;

        habitForm.reset();
        modalHabit.classList.add('hidden');
        await loadHabits();
    } catch (error) {
        console.error('Error creando el hábito:', error);
        showHabitFormMessage(error.message || 'No se pudo crear el hábito.', true);
    } finally {
        habitSubmitBtn.disabled = false;
    }
});

document.getElementById('btn-add-habit').addEventListener('click', () => {
    habitForm.reset();
    habitMessage.classList.add('hidden');
    modalHabit.classList.remove('hidden');
    modalHabit.classList.add('flex');
    document.getElementById('habit-title').focus();
});

function closeHabitModal() {
    modalHabit.classList.add('hidden');
    modalHabit.classList.remove('flex');
}

document.getElementById('btn-cancel-habit').addEventListener('click', closeHabitModal);
modalHabit.addEventListener('click', event => {
    if (event.target === modalHabit) closeHabitModal();
});

async function subscribeToRealtime(userId) {
    await unsubscribeHabitRealtime();
    habitRealtimeChannel = supabaseClient
        .channel(`habits-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${userId}` }, loadHabits)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_logs' }, loadHabits)
        .subscribe(status => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('No se pudo conectar a las actualizaciones en tiempo real de hábitos:', status);
            }
        });
}

async function unsubscribeHabitRealtime() {
    if (habitRealtimeChannel) {
        await supabaseClient.removeChannel(habitRealtimeChannel);
        habitRealtimeChannel = null;
    }
}

window.subscribeToRealtime = subscribeToRealtime;
window.unsubscribeHabitRealtime = unsubscribeHabitRealtime;
