/* Independent Summarizer for SillyTavern
 * Uses a Connection Manager profile for summaries, completely separate from the active RP model.
 */
import {
    saveSettingsDebounced,
    eventSource,
    event_types,
    setExtensionPrompt,
    extension_prompt_types,
    extension_prompt_roles,
} from '../../../../script.js';

import {
    extension_settings,
    getContext,
} from '../../../extensions.js';

import { ConnectionManagerRequestService } from '../../shared.js';

export const MODULE_NAME = 'independent_summarizer';
const PROMPT_ID = 'independent_summarizer_memory';

const defaultPrompt = `You are maintaining compact long-term memory for an ongoing fictional roleplay.

Create an accurate continuity summary of the material provided below. Preserve facts that could matter later: major events, character goals and relationships, injuries or physical conditions, locations, possessions, promises, secrets, threats, unresolved conflicts, emotional changes, and important knowledge asymmetries.

Do not continue the roleplay. Do not address the user. Do not censor, moralize, euphemize, or replace fictional events. If disturbing or violent events occurred, summarize them neutrally and accurately rather than softening them.

Prefer concrete facts over prose commentary. Preserve character names. Keep chronology understandable. If an older summary is supplied, update it with the newer events and remove obsolete or contradicted details.

Target roughly {{words}} words. Output only the updated summary.`;

const defaults = {
    profileId: '',
    targetWords: 350,
    maxTokens: 900,
    maxMessages: 40,
    autoEvery: 0,
    inject: true,
    injectionDepth: 4,
    prompt: defaultPrompt,
    template: `[Story memory:\n{{summary}}]`,
};

function settings() {
    extension_settings[MODULE_NAME] ||= structuredClone(defaults);
    for (const [k, v] of Object.entries(defaults)) {
        if (extension_settings[MODULE_NAME][k] === undefined) {
            extension_settings[MODULE_NAME][k] = structuredClone(v);
        }
    }
    return extension_settings[MODULE_NAME];
}

function escapeHtml(value = '') {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

function getProfiles() {
    try {
        return ConnectionManagerRequestService.getSupportedProfiles() || [];
    } catch {
        return [];
    }
}

function latestStoredSummary() {
    const chat = getContext().chat || [];
    for (let i = chat.length - 1; i >= 0; i--) {
        const value = chat[i]?.extra?.[MODULE_NAME];
        if (value?.text) {
            return { ...value, messageIndex: i };
        }
    }
    return { text: '', coveredUntil: -1, messageIndex: -1 };
}

function setSummaryPrompt(summary) {
    const s = settings();
    if (!s.inject || !summary) {
        setExtensionPrompt(PROMPT_ID, '', extension_prompt_types.IN_CHAT, Number(s.injectionDepth) || 4, false, extension_prompt_roles.SYSTEM);
        return;
    }
    const rendered = String(s.template || '{{summary}}').replaceAll('{{summary}}', summary);
    setExtensionPrompt(PROMPT_ID, rendered, extension_prompt_types.IN_CHAT, Number(s.injectionDepth) || 4, false, extension_prompt_roles.SYSTEM);
}

function refreshSummaryUi() {
    const latest = latestStoredSummary();
    const box = document.getElementById('is_summary');
    if (box && document.activeElement !== box) box.value = latest.text || '';
    setSummaryPrompt(latest.text || '');
}

function formatChatMessages(startIndex, maxMessages) {
    const context = getContext();
    const chat = context.chat || [];
    const clean = [];

    for (let i = Math.max(0, startIndex); i < chat.length; i++) {
        const m = chat[i];
        if (!m || m.is_system || !m.mes) continue;
        const name = m.name || (m.is_user ? context.name1 : context.name2) || (m.is_user ? 'User' : 'Character');
        clean.push({ index: i, role: m.is_user ? 'user' : 'assistant', name, text: String(m.mes) });
    }

    if (maxMessages > 0 && clean.length > maxMessages) {
        return clean.slice(-maxMessages);
    }
    return clean;
}

function buildRequestMessages(previous, chatMessages) {
    const s = settings();
    const prompt = String(s.prompt || defaultPrompt).replaceAll('{{words}}', String(s.targetWords || 350));

    let material = '';
    if (previous?.text) {
        material += `OLDER SUMMARY:\n${previous.text}\n\n`;
    }
    material += 'NEWER CHAT MATERIAL:\n';
    for (const m of chatMessages) {
        material += `\n[${m.name}]\n${m.text}\n`;
    }

    return [
        { role: 'system', content: prompt },
        { role: 'user', content: material.trim() },
    ];
}

async function saveSummary(text, coveredUntil) {
    const context = getContext();
    const chat = context.chat || [];
    if (!chat.length) throw new Error('No chat message is available to attach the summary to.');

    const target = chat[chat.length - 1];
    target.extra ||= {};
    target.extra[MODULE_NAME] = {
        text: text.trim(),
        coveredUntil,
        createdAt: Date.now(),
    };

    await context.saveChat();
    refreshSummaryUi();
}

async function runSummary({ silent = false } = {}) {
    const s = settings();

    if (!s.profileId) {
        if (!silent) toastr.warning('Choose a Connection Profile for Independent Summarizer first.');
        return false;
    }

    const previous = latestStoredSummary();
    const context = getContext();
    const chat = context.chat || [];
    if (!chat.length) {
        if (!silent) toastr.warning('There is no chat to summarize.');
        return false;
    }

    // Incremental by default: start after the last covered message.
    // If maxMessages clips it, the previous summary still carries older continuity.
    const startIndex = Math.max(0, Number(previous.coveredUntil ?? -1) + 1);
    let material = formatChatMessages(startIndex, Number(s.maxMessages) || 0);

    // If nothing new exists, allow manual "rebuild" from recent context.
    if (!material.length) {
        material = formatChatMessages(0, Number(s.maxMessages) || 0);
    }

    if (!material.length) {
        if (!silent) toastr.warning('No usable messages found.');
        return false;
    }

    const newestCovered = material[material.length - 1].index;
    const messages = buildRequestMessages(previous, material);

    const button = document.getElementById('is_summarize_now');
    if (button) button.disabled = true;
    if (!silent) toastr.info('Generating summary...', 'Independent Summarizer', { timeOut: 1500 });

    try {
        const response = await ConnectionManagerRequestService.sendRequest(
            s.profileId,
            messages,
            Number(s.maxTokens) || 900,
            {
                stream: false,
                extractData: true,
                includePreset: false,
                includeInstruct: false,
            },
            {
                temperature: 0.35,
                top_p: 0.95,
            },
        );

        const text = String(response?.content || '').trim();
        if (!text) throw new Error('The summary model returned an empty response.');

        await saveSummary(text, newestCovered);
        if (!silent) toastr.success('Summary updated.', 'Independent Summarizer');
        return true;
    } catch (error) {
        console.error('[Independent Summarizer] summary failed', error);
        if (!silent) toastr.error(error?.message || String(error), 'Independent Summarizer');
        return false;
    } finally {
        if (button) button.disabled = false;
    }
}

async function clearSummary() {
    const context = getContext();
    const chat = context.chat || [];
    for (const m of chat) {
        if (m?.extra?.[MODULE_NAME]) delete m.extra[MODULE_NAME];
    }
    await context.saveChat();
    refreshSummaryUi();
    toastr.success('Independent summary cleared.');
}

async function saveEditedSummary() {
    const text = document.getElementById('is_summary')?.value?.trim() || '';
    const context = getContext();
    const chat = context.chat || [];
    if (!chat.length) return;
    if (!text) {
        await clearSummary();
        return;
    }
    await saveSummary(text, chat.length - 1);
    toastr.success('Edited summary saved.');
}

function renderProfiles() {
    const select = document.getElementById('is_profile');
    if (!select) return;
    const current = settings().profileId;
    const profiles = getProfiles();

    select.innerHTML = '<option value="">-- choose a Connection Profile --</option>';
    for (const p of profiles) {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.name || p.id}${p.model ? ` — ${p.model}` : ''}`;
        option.selected = p.id === current;
        select.appendChild(option);
    }
}

function bind(id, eventName, handler) {
    document.getElementById(id)?.addEventListener(eventName, handler);
}

function renderSettings() {
    const s = settings();
    const host = document.getElementById('extensions_settings');
    if (!host || document.getElementById('independent_summarizer_settings')) return;

    const wrap = document.createElement('div');
    wrap.id = 'independent_summarizer_settings';
    wrap.className = 'extension_container';
    wrap.innerHTML = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>Independent Summarizer</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <p class="is_hint">Summarizes with a separate Connection Manager profile. Your active RP API/model is untouched.</p>

        <label for="is_profile">Summary Connection Profile</label>
        <div class="is_row">
          <select id="is_profile" class="text_pole flex1"></select>
          <button id="is_refresh_profiles" class="menu_button" title="Refresh profiles"><i class="fa-solid fa-rotate"></i></button>
        </div>

        <label for="is_prompt">Summary prompt</label>
        <textarea id="is_prompt" class="text_pole textarea_compact" rows="8">${escapeHtml(s.prompt)}</textarea>

        <div class="is_grid">
          <label>Target words
            <input id="is_words" class="text_pole" type="number" min="50" max="3000" step="25" value="${Number(s.targetWords)}">
          </label>
          <label>Max output tokens
            <input id="is_tokens" class="text_pole" type="number" min="64" max="8192" step="64" value="${Number(s.maxTokens)}">
          </label>
          <label>Max new messages/request
            <input id="is_max_messages" class="text_pole" type="number" min="0" max="500" step="1" value="${Number(s.maxMessages)}">
          </label>
          <label>Auto every N messages
            <input id="is_auto_every" class="text_pole" type="number" min="0" max="500" step="1" value="${Number(s.autoEvery)}">
          </label>
        </div>

        <label class="checkbox_label">
          <input id="is_inject" type="checkbox" ${s.inject ? 'checked' : ''}>
          <span>Inject current summary into RP prompt</span>
        </label>

        <label for="is_template">Injection template</label>
        <textarea id="is_template" class="text_pole textarea_compact" rows="3">${escapeHtml(s.template)}</textarea>

        <label for="is_depth">Injection depth</label>
        <input id="is_depth" class="text_pole" type="number" min="0" max="100" step="1" value="${Number(s.injectionDepth)}">

        <div class="is_buttons">
          <button id="is_summarize_now" class="menu_button"><i class="fa-solid fa-wand-magic-sparkles"></i> Summarize now</button>
          <button id="is_save_edit" class="menu_button"><i class="fa-solid fa-floppy-disk"></i> Save edited summary</button>
          <button id="is_clear" class="menu_button"><i class="fa-solid fa-trash"></i> Clear</button>
        </div>

        <label for="is_summary">Current summary</label>
        <textarea id="is_summary" class="text_pole textarea_compact" rows="10" placeholder="No independent summary yet."></textarea>

        <p class="is_hint"><b>Recommended:</b> create an OpenRouter Connection Profile with a cheap/non-Claude model, select it above, then switch your normal RP connection back to Claude. The summarizer keeps using its own profile.</p>
      </div>
    </div>`;

    host.appendChild(wrap);
    renderProfiles();
    refreshSummaryUi();

    bind('is_refresh_profiles', 'click', renderProfiles);
    bind('is_profile', 'change', e => { s.profileId = e.target.value; saveSettingsDebounced(); });
    bind('is_prompt', 'input', e => { s.prompt = e.target.value; saveSettingsDebounced(); });
    bind('is_words', 'input', e => { s.targetWords = Number(e.target.value); saveSettingsDebounced(); });
    bind('is_tokens', 'input', e => { s.maxTokens = Number(e.target.value); saveSettingsDebounced(); });
    bind('is_max_messages', 'input', e => { s.maxMessages = Number(e.target.value); saveSettingsDebounced(); });
    bind('is_auto_every', 'input', e => { s.autoEvery = Number(e.target.value); saveSettingsDebounced(); });
    bind('is_inject', 'change', e => { s.inject = e.target.checked; saveSettingsDebounced(); refreshSummaryUi(); });
    bind('is_template', 'input', e => { s.template = e.target.value; saveSettingsDebounced(); refreshSummaryUi(); });
    bind('is_depth', 'input', e => { s.injectionDepth = Number(e.target.value); saveSettingsDebounced(); refreshSummaryUi(); });
    bind('is_summarize_now', 'click', () => runSummary());
    bind('is_save_edit', 'click', saveEditedSummary);
    bind('is_clear', 'click', clearSummary);
}

async function maybeAutoSummarize() {
    const s = settings();
    const interval = Number(s.autoEvery) || 0;
    if (interval <= 0 || !s.profileId) return;

    const latest = latestStoredSummary();
    const chat = getContext().chat || [];
    const newCount = Math.max(0, chat.length - 1 - Number(latest.coveredUntil ?? -1));

    if (newCount >= interval) {
        await runSummary({ silent: true });
    }
}

export async function init() {
    settings();
    renderSettings();
    refreshSummaryUi();

    eventSource.on(event_types.CHAT_CHANGED, () => {
        renderProfiles();
        refreshSummaryUi();
    });

    eventSource.on(event_types.MESSAGE_RECEIVED, () => {
        refreshSummaryUi();
        setTimeout(() => maybeAutoSummarize(), 250);
    });

    eventSource.on(event_types.MESSAGE_EDITED, refreshSummaryUi);
    eventSource.on(event_types.MESSAGE_DELETED, refreshSummaryUi);
    eventSource.on(event_types.MESSAGE_SWIPED, refreshSummaryUi);

    console.log('[Independent Summarizer] loaded');
}
