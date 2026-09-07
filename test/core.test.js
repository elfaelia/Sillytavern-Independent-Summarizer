import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, getPendingBatches, normaliseChat, reconcileState, renderSummaryTemplate, signatureForMessages } from '../core.js';

const chat = [
    { is_user: true, name: 'Ellie', mes: 'First' },
    { is_system: true, mes: 'Hidden system event' },
    { is_user: false, name: 'Bot', mes: 'Second' },
    { is_user: false, name: 'Bot', mes: 'Third' },
];

test('normaliseChat excludes system and empty messages while preserving order', () => {
    const messages = normaliseChat(chat);
    assert.deepEqual(messages.map(message => message.text), ['First', 'Second', 'Third']);
    assert.deepEqual(messages.map(message => message.sourceIndex), [0, 2, 3]);
});

test('backlog batches are oldest-first and never discard the first messages', () => {
    const batches = getPendingBatches(normaliseChat(chat), 0, 2);
    assert.deepEqual(batches.map(batch => batch.map(message => message.text)), [['First', 'Second'], ['Third']]);
});

test('covered-prefix edits invalidate a summary', () => {
    const messages = normaliseChat(chat);
    const state = { ...createEmptyState(), summary: 'Memory', coveredCount: 2, coveredSignature: signatureForMessages(messages.slice(0, 2)) };
    const edited = normaliseChat([{ ...chat[0], mes: 'Edited first' }, ...chat.slice(1)]);
    assert.equal(reconcileState(state, edited).state.stale, true);
});

test('changes after the covered prefix do not invalidate a summary', () => {
    const messages = normaliseChat(chat);
    const state = { ...createEmptyState(), summary: 'Memory', coveredCount: 1, coveredSignature: signatureForMessages(messages.slice(0, 1)) };
    const edited = normaliseChat([...chat.slice(0, 3), { ...chat[3], mes: 'Edited third' }]);
    assert.equal(reconcileState(state, edited).state.stale, false);
});

test('injection template replaces every summary placeholder', () => {
    assert.equal(renderSummaryTemplate('{{summary}} / {{summary}}', 'Memory'), 'Memory / Memory');
});
