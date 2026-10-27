const modalPartner = document.getElementById('modal-partner');
const btnFindPartner = document.getElementById('btn-find-partner');
const btnCancelPartner = document.getElementById('btn-cancel-partner');
const searchUsername = document.getElementById('search-username');
const searchResults = document.getElementById('search-results');
const partnerList = document.getElementById('partner-list');
const partnerProgress = document.getElementById('partner-progress');
const partnerHabits = document.getElementById('partner-habits');
const requestsSection = document.getElementById('requests-section');
const requestsList = document.getElementById('requests-list');
const partnerMessage = document.getElementById('partner-message');

let currentUser = null;
let partnerRealtimeChannel = null;
let searchTimeout = null;
let searchSequence = 0;

function showPartnerMessage(message, isError = false) {
    partnerMessage.textContent = message;
    partnerMessage.className = `text-center text-sm ${isError ? 'text-red-600 dark:text-red-300' : 'text-green-600 dark:text-green-300'}`;
    partnerMessage.classList.remove('hidden');
}

function closePartnerModal() {
    modalPartner.classList.add('hidden');
    modalPartner.classList.remove('flex');
}

btnFindPartner.addEventListener('click', () => {
    searchUsername.value = '';
    searchResults.replaceChildren();
    partnerMessage.classList.add('hidden');
    modalPartner.classList.remove('hidden');
    modalPartner.classList.add('flex');
    searchUsername.focus();
});

btnCancelPartner.addEventListener('click', closePartnerModal);
modalPartner.addEventListener('click', event => {
    if (event.target === modalPartner) closePartnerModal();
});

searchUsername.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchUsername.value.trim();
    const requestSequence = ++searchSequence;

    if (query.length < 2) {
        searchResults.replaceChildren();
        partnerMessage.classList.add('hidden');
        return;
    }

    searchTimeout = setTimeout(async () => {
        const { data: users, error } = await supabaseClient
            .from('profiles')
            .select('id, username')
            .ilike('username', `%${query}%`)
            .neq('id', currentUser.id)
            .limit(10);

        if (requestSequence !== searchSequence) return;
        if (error) {
            console.error('Error buscando usuarios:', error);
            searchResults.innerHTML = '<p class="text-sm text-red-600 dark:text-red-300">No se pudo realizar la búsqueda.</p>';
            return;
        }

        if (!users?.length) {
            searchResults.innerHTML = '<p class="text-sm text-gray-400 dark:text-gray-300">No se encontraron usuarios.</p>';
            return;
        }

        searchResults.innerHTML = users.map(user => `
            <div class="flex items-center justify-between gap-3 rounded-md bg-gray-50 p-3 dark:bg-gray-700">
                <span class="font-medium text-gray-700 dark:text-gray-100">${escapeHTML(user.username)}</span>
                <button type="button" data-action="send-request" data-user-id="${escapeHTML(user.id)}" class="shrink-0 rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700">Enviar solicitud</button>
            </div>`).join('');
    }, 250);
});

searchResults.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action="send-request"]');
    if (!button) return;
    button.disabled = true;

    try {
        const partnerId = button.dataset.userId;
        const { data: existing, error: lookupError } = await supabaseClient
            .from('partnerships')
            .select('id, status, user_1, user_2')
            .or(`and(user_1.eq.${currentUser.id},user_2.eq.${partnerId}),and(user_1.eq.${partnerId},user_2.eq.${currentUser.id})`)
            .limit(1)
            .maybeSingle();
        if (lookupError) throw lookupError;

        if (existing) {
            let message = 'Ya existe una solicitud con esta persona.';
            if (existing.status === 'active') message = 'Ya son compañeros.';
            else if (existing.status === 'pending' && existing.user_1 === currentUser.id) message = 'La solicitud ya está enviada.';
            else if (existing.status === 'pending') message = 'Esta persona ya te envió una solicitud.';
            showPartnerMessage(message, true);
            return;
        }

        const { error } = await supabaseClient
            .from('partnerships')
            .insert({ user_1: currentUser.id, user_2: partnerId, status: 'pending' });
        if (error) throw error;

        showPartnerMessage('¡Solicitud enviada!');
        await loadPartners();
    } catch (error) {
        console.error('Error enviando solicitud:', error);
        showPartnerMessage(error.message || 'No se pudo enviar la solicitud.', true);
    } finally {
        button.disabled = false;
    }
});

async function loadPartners() {
    if (!currentUser) return;

    const { data: partnerships, error } = await supabaseClient
        .from('partnerships')
        .select('id, user_1, user_2, status')
        .or(`user_1.eq.${currentUser.id},user_2.eq.${currentUser.id}`);

    if (error) {
        console.error('Error cargando compañeros:', error);
        partnerList.innerHTML = '<p class="text-sm text-red-600 dark:text-red-300">No se pudieron cargar los compañeros.</p>';
        return;
    }

    const partnerIds = [...new Set((partnerships || []).map(partnership =>
        partnership.user_1 === currentUser.id ? partnership.user_2 : partnership.user_1
    ))];
    const profilesResult = partnerIds.length
        ? await supabaseClient.from('profiles').select('id, username').in('id', partnerIds)
        : { data: [], error: null };
    if (profilesResult.error) {
        console.error('Error cargando perfiles de compañeros:', profilesResult.error);
        partnerList.innerHTML = '<p class="text-sm text-red-600 dark:text-red-300">No se pudieron cargar los perfiles de compañeros.</p>';
        return;
    }

    const profileById = new Map((profilesResult.data || []).map(profile => [profile.id, profile]));
    const active = (partnerships || []).filter(partnership => partnership.status === 'active');
    const pendingReceived = (partnerships || []).filter(partnership =>
        partnership.status === 'pending' && partnership.user_2 === currentUser.id
    );
    const pendingSent = (partnerships || []).filter(partnership =>
        partnership.status === 'pending' && partnership.user_1 === currentUser.id
    );

    partnerList.innerHTML = active.length
        ? active.map(partnership => {
            const userId = partnership.user_1 === currentUser.id ? partnership.user_2 : partnership.user_1;
            const username = profileById.get(userId)?.username || 'Usuario';
            return `
                <div class="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                    <div class="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-sm font-bold text-white">${escapeHTML(username.charAt(0).toUpperCase())}</div>
                    <div class="flex-1">
                        <p class="font-medium text-gray-800 dark:text-gray-100">${escapeHTML(username)}</p>
                        <p class="text-xs text-green-600">Conectados</p>
                    </div>
                </div>`;
        }).join('')
        : '<p class="py-4 text-center text-sm text-gray-400 dark:text-gray-300">Sin compañeros aún</p>';

    requestsSection.classList.toggle('hidden', pendingReceived.length === 0 && pendingSent.length === 0);
    requestsList.innerHTML = [
        ...pendingReceived.map(partnership => {
            const username = profileById.get(partnership.user_1)?.username || 'Usuario';
            return `
                <div class="flex items-center justify-between gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
                    <div>
                        <p class="font-medium text-gray-800 dark:text-gray-100">${escapeHTML(username)}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-300">Quiere ser tu compañero</p>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" data-action="respond" data-partnership-id="${escapeHTML(partnership.id)}" data-status="active" class="rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600">Aceptar</button>
                        <button type="button" data-action="respond" data-partnership-id="${escapeHTML(partnership.id)}" data-status="rejected" class="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600">Rechazar</button>
                    </div>
                </div>`;
        }),
        ...pendingSent.map(partnership => {
            const username = profileById.get(partnership.user_2)?.username || 'Usuario';
            return `<p class="rounded-md bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-700 dark:text-gray-200">Solicitud enviada a ${escapeHTML(username)}.</p>`;
        })
    ].join('');

    await loadPartnerProgress(active, profileById);
}

requestsList.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action="respond"]');
    if (!button) return;
    button.disabled = true;

    try {
        const { error } = await supabaseClient
            .from('partnerships')
            .update({ status: button.dataset.status })
            .eq('id', button.dataset.partnershipId)
            .eq('user_2', currentUser.id)
            .eq('status', 'pending');
        if (error) throw error;
        await loadPartners();
    } catch (error) {
        console.error('Error respondiendo a la solicitud:', error);
        showAppError(error.message || 'No se pudo responder a la solicitud.');
    } finally {
        button.disabled = false;
    }
});

async function loadPartnerProgress(activePartnerships, profileById) {
    if (!activePartnerships.length) {
        partnerProgress.classList.add('hidden');
        partnerHabits.replaceChildren();
        return;
    }

    const partnerIds = activePartnerships.map(partnership =>
        partnership.user_1 === currentUser.id ? partnership.user_2 : partnership.user_1
    );
    const { data: habits, error } = await supabaseClient
        .from('habits')
        .select('id, user_id, title, frequency')
        .in('user_id', partnerIds)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error cargando hábitos de compañeros:', error);
        partnerProgress.classList.remove('hidden');
        partnerHabits.innerHTML = '<p class="text-sm text-red-600 dark:text-red-300">No se pudo cargar el progreso de los compañeros.</p>';
        return;
    }

    const today = getLocalDateString();
    const weekStart = getWeekStartDate();
    const habitIds = (habits || []).map(habit => habit.id);
    let logs = [];
    if (habitIds.length) {
        const result = await supabaseClient
            .from('habit_logs')
            .select('habit_id, log_date')
            .in('habit_id', habitIds)
            .gte('log_date', weekStart)
            .lte('log_date', today);
        if (result.error) {
            console.error('Error cargando registros de compañeros:', result.error);
            partnerProgress.classList.remove('hidden');
            partnerHabits.innerHTML = '<p class="text-sm text-red-600 dark:text-red-300">No se pudo cargar el progreso de esta semana.</p>';
            return;
        }
        logs = result.data || [];
    }

    const completedToday = new Set(logs.filter(log => log.log_date === today).map(log => log.habit_id));
    const completedThisWeek = new Set(logs.map(log => log.habit_id));
    partnerProgress.classList.remove('hidden');
    partnerHabits.innerHTML = partnerIds.map(userId => {
        const username = profileById.get(userId)?.username || 'Usuario';
        const userHabits = (habits || []).filter(habit => habit.user_id === userId);
        const dailyHabits = userHabits.filter(habit => habit.frequency === 'daily');
        const weeklyHabits = userHabits.filter(habit => habit.frequency === 'weekly');
        const completedDaily = dailyHabits.filter(habit => completedToday.has(habit.id)).length;
        const completedWeekly = weeklyHabits.filter(habit => completedThisWeek.has(habit.id)).length;
        const dailyPercentage = dailyHabits.length ? Math.round(completedDaily / dailyHabits.length * 100) : 0;
        const weeklyPercentage = weeklyHabits.length ? Math.round(completedWeekly / weeklyHabits.length * 100) : 0;

        return `
            <article class="rounded-md border border-gray-200 p-3 dark:border-gray-600">
                <h3 class="mb-3 font-semibold text-gray-800 dark:text-gray-100">${escapeHTML(username)}</h3>
                <div class="space-y-3">
                    <div>
                        <div class="mb-1 flex justify-between text-xs">
                            <span class="text-gray-600 dark:text-gray-300">Hoy: ${completedDaily}/${dailyHabits.length} diarios</span>
                            <span class="font-semibold text-indigo-600">${dailyPercentage}%</span>
                        </div>
                        <div class="h-2 w-full rounded bg-gray-200 dark:bg-gray-700"><div class="h-2 rounded bg-indigo-600" style="width: ${dailyPercentage}%"></div></div>
                    </div>
                    <div>
                        <div class="mb-1 flex justify-between text-xs">
                            <span class="text-gray-600 dark:text-gray-300">Esta semana: ${completedWeekly}/${weeklyHabits.length} semanales</span>
                            <span class="font-semibold text-purple-600">${weeklyPercentage}%</span>
                        </div>
                        <div class="h-2 w-full rounded bg-gray-200 dark:bg-gray-700"><div class="h-2 rounded bg-purple-600" style="width: ${weeklyPercentage}%"></div></div>
                    </div>
                    ${userHabits.length ? `<ul class="space-y-1 border-t border-gray-100 pt-2 dark:border-gray-700">${userHabits.map(habit => {
                        const completed = (habit.frequency === 'weekly' ? completedThisWeek : completedToday).has(habit.id);
                        return `<li class="flex items-center gap-2 text-xs ${completed ? 'text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-gray-300'}"><span>${completed ? '✓' : '○'}</span><span>${escapeHTML(habit.title)} <span class="text-gray-400 dark:text-gray-500">(${habit.frequency === 'weekly' ? 'semanal' : 'diario'})</span></span></li>`;
                    }).join('')}</ul>` : '<p class="text-xs text-gray-400 dark:text-gray-300">Aún no tiene hábitos.</p>'}
                </div>
            </article>`;
    }).join('');
}

async function initPartners(user) {
    currentUser = user;
    await loadPartners();
}

async function subscribeToPartnerChanges(userId) {
    await unsubscribePartnerRealtime();
    partnerRealtimeChannel = supabaseClient
        .channel(`partners-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'partnerships' }, loadPartners)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'habits' }, loadPartners)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_logs' }, loadPartners)
        .subscribe(status => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('No se pudo conectar a las actualizaciones en tiempo real de compañeros:', status);
            }
        });
}

async function unsubscribePartnerRealtime() {
    if (partnerRealtimeChannel) {
        await supabaseClient.removeChannel(partnerRealtimeChannel);
        partnerRealtimeChannel = null;
    }
}

function resetPartnerSession() {
    currentUser = null;
}

window.initPartners = initPartners;
window.subscribeToPartnerChanges = subscribeToPartnerChanges;
window.unsubscribePartnerRealtime = unsubscribePartnerRealtime;
window.resetPartnerSession = resetPartnerSession;
