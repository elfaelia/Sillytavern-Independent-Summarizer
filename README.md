# Independent Summarizer for SillyTavern

Independent Summarizer keeps an evolving whole-chat continuity summary using a dedicated SillyTavern **Connection Profile**. Your main roleplay can stay on Claude while summarization runs through a different model, including an OpenRouter model.

The summarization request sends only the extension's prompt, the previously saved continuity summary, and the new chat messages being folded into it. It does **not** send the active roleplay completion preset, instruct preset, character card, Author's Note, World Info, IHYLL instructions, or other extension prompts.

## Features

- Dedicated Connection Profile/model for summaries
- Manual **Summarize now** and optional automatic updates
- Oldest-first, resumable batching for long chats and first-run backlogs
- Per-chat persistent summary state
- Editable, saveable, and clearable summary
- Target words, maximum output tokens, messages per request, injection depth, and injection template controls
- Edit/swipe/delete detection for already-summarized messages
- A checkpoint after every completed batch, so a later API failure or usage limit does not erase earlier progress

## Install

In SillyTavern, open **Extensions**, choose **Install extension**, and paste:

```text
https://github.com/elfaelia/Sillytavern-Independent-Summarizer
```

Reload SillyTavern after installation or update.

## Set up an OpenRouter summarizer

1. Configure your OpenRouter API key in SillyTavern.
2. Open SillyTavern's **Connection Profiles** manager.
3. Create a Chat Completion profile using **OpenRouter** and choose the summarization model you want.
4. Open **Extensions -> Independent Summarizer** and select that profile.
5. Return your normal roleplay connection/model to Claude. The extension retains the selected summarization profile ID.
6. Open a chat and press **Summarize now**.

You may leave SillyTavern's built-in Summarize extension disabled to avoid injecting two competing summaries.

## Continuity and batching

The first run starts at the oldest usable chat message. If **Messages per request** is 40 and the chat has 95 messages, the extension performs three sequential updates: 40, 40, then 15. Every result becomes the previous summary for the next batch, producing one evolving continuity record rather than unrelated summaries.

Each completed batch is saved immediately. If the provider errors or a usage limit interrupts batch three, pressing **Summarize now** again resumes after the first 80 messages.

Automatic updates count both user and character messages. Set **Auto-update after N new messages** to `0` to disable them.

## Editing, swiping, and deleting

The extension stores a signature of the exact message prefix covered by the summary. Editing, swiping, or deleting a covered message marks the summary stale and removes it from RP prompt injection. The text remains visible. The next manual or automatic run rebuilds oldest-first from the current chat.

Edits to messages that have not been summarized yet do not invalidate existing memory.

## Data and compatibility

- Preferences are stored in SillyTavern extension settings.
- Summary text and coverage are stored in per-chat metadata.
- Prototype `extra.independent_summarizer` message data is migrated once when found.
- `manifest.json` intentionally uses `"requires": []`. Connection Manager is a built-in client extension, not an Extras module.
- Requests use `ConnectionManagerRequestService.sendRequest(...)` with `includePreset: false` and `includeInstruct: false`.

## Development check

```bash
npm test
```

This runs state/batching tests and a syntax check of the browser entry point.
