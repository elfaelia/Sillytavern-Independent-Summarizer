# Independent Summarizer for SillyTavern

Independent Summarizer keeps an evolving whole-chat continuity summary using a dedicated SillyTavern **Connection Profile**. Your main roleplay can stay on Claude while summarization runs through a different model, including an OpenRouter model.

The summarization request sends only the extension's prompt, the previously saved continuity summary, and the new chat messages being folded into it. It does **not** send the active roleplay completion preset, instruct preset, character card, Author's Note, World Info, IHYLL instructions, or other extension prompts.

## Features

- Dedicated Connection Profile/model for summaries
- Manual **Summarize now** and optional automatic updates
- Simple manual mode: one click, one request, with a changeable message limit
- Oldest-first, resumable batching for long chats and first-run backlogs
- Optional initial/rebuild lookback, so an existing chat can start from only its latest messages
- Maximum requests per run as a provider-cost guardrail
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

Simple manual mode is enabled by default. One button press makes one request and folds up to **Messages added per update** new messages into the saved continuity summary. The first press starts from only that many recent messages.

With simple manual mode disabled, advanced batching can start at the oldest usable message. If the request size is 40 and the chat has 95 messages, it can perform three sequential updates: 40, 40, then 15. Every result becomes the previous summary for the next batch, producing one evolving continuity record rather than unrelated summaries.

Each completed batch is saved immediately. If the provider errors or a usage limit interrupts batch three, pressing **Summarize now** again resumes after the first 80 messages.

Automatic updates count both user and character messages. Set **Auto-update after N new messages** to `0` to disable them.

### Cheap-start example

The easiest option is to leave **Simple manual mode** enabled and set **Messages added per update** to `10`. Nothing runs automatically. The first click reads only the latest ten messages, and each later click folds up to ten waiting messages into the saved summary using one model request.

Simple manual mode also avoids paying to regenerate an already-current summary: pressing the button with no new messages reports that it is already up to date.

For advanced batching instead, disable simple manual mode and set:

- **Starting/rebuild history:** `10`
- **Messages added per update:** `10`
- **Maximum requests per run:** `1`

## Editing, swiping, and deleting

The extension stores a signature of the exact message range covered by the summary. Editing, swiping, or deleting a covered message marks the summary stale and removes it from RP prompt injection. The text remains visible. The next manual or automatic run rebuilds using the configured initial/rebuild lookback.

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
