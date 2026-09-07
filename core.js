export const STATE_VERSION = 2;

export function createEmptyState() {
    return { version: STATE_VERSION, summary: '', coveredCount: 0, coveredSignature: signatureForMessages([]), updatedAt: 0, stale: false, staleReason: '' };
}

export function normaliseChat(chat = [], names = {}) {
    const result = [];
    for (let sourceIndex = 0; sourceIndex < chat.length; sourceIndex++) {
        const message = chat[sourceIndex];
        if (!message || message.is_system || !String(message.mes || '').trim()) continue;
        const isUser = Boolean(message.is_user);
        result.push({
            sourceIndex,
            role: isUser ? 'user' : 'assistant',
            name: String(message.name || (isUser ? names.user : names.character) || (isUser ? 'User' : 'Character')),
            text: String(message.mes),
        });
    }
    return result;
}

export function signatureForMessages(messages) {
    let hash = 0x811c9dc5;
    const input = messages.map(message => `${message.role}\u001f${message.name}\u001f${message.text}`).join('\u001e');
    for (let index = 0; index < input.length; index++) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function reconcileState(state, messages) {
    const next = { ...createEmptyState(), ...state };
    const coveredCount = Number.isInteger(Number(next.coveredCount)) ? Math.max(0, Number(next.coveredCount)) : 0;
    const invalid = coveredCount > messages.length
        || (coveredCount > 0 && next.coveredSignature !== signatureForMessages(messages.slice(0, coveredCount)));
    next.coveredCount = coveredCount;
    if (invalid) {
        next.stale = true;
        next.staleReason = 'A message already included in this summary was edited, swiped, or deleted.';
    }
    return { state: next, changed: invalid && !state?.stale };
}

export function getPendingBatches(messages, coveredCount, maxMessages) {
    const pending = messages.slice(Math.max(0, coveredCount));
    const size = Math.max(0, Number(maxMessages) || 0);
    if (!pending.length) return [];
    if (!size) return [pending];
    const batches = [];
    for (let index = 0; index < pending.length; index += size) batches.push(pending.slice(index, index + size));
    return batches;
}

export function renderSummaryTemplate(template, summary) {
    return String(template || '{{summary}}').replaceAll('{{summary}}', String(summary || ''));
}
