// components/stream/StreamSession.js
// Orchestrates one streaming turn: building params, SSE dispatch, UI updates, typewriter rendering.

import {TypeWriter} from "./type-writer.js";

export class StreamSession {
    #chatId;
    #window;
    #createStreamES;

    #tuning;
    #state;  // getters/setters provided by Chat
    #hooks;  // { onFinalize(opts), onScroll() }

    #opts = null; // { skipUserEcho, regenButton }
    #close = null;

    #typewriter = null;
    #skeletonHandle = null; // { setMarkdown, finish, elements }

    constructor({
                    chatId,
                    window,
                    createStreamES,
                    tuning = {cps: 80, tickMs: 20, renderMs: 60},
                    state,
                    hooks,
                }) {
        this.#chatId = chatId;
        this.#window = window;
        this.#createStreamES = createStreamES;
        this.#tuning = tuning;
        this.#state = state;
        this.#hooks = hooks;
    }

    start({
              userText,
              endpoint = null,
              extraParams = {},
              skipUserEcho = false,
              forceFromId,
              regenButton = null,
          } = {}) {
        // save opts for later (finalize hook resets regen button etc.)
        this.#opts = {skipUserEcho, regenButton};

        // init typewriter
        this.#typewriter?.cancel();
        this.#typewriter = new TypeWriter({
            cps: this.#tuning.cps,
            tickMs: this.#tuning.tickMs,
            renderMs: this.#tuning.renderMs,
            setContent: (md) => this.#skeletonHandle?.setMarkdown?.(md),
            onRender: () => this.#window.scrollToBottom(),
            onFinalize: () => this.#finalize(),
        });
        this.#typewriter.start();

        // build URL + params
        const path = endpoint ?? `/chats/${this.#chatId}/generate/stream`;
        const params = {temperature: 1, ...extraParams};
        if (userText) this.#state.setCurrentUserText(userText), (params.prompt = userText);

        // resolve anchor
        let anchor =
            this.#state.getActivePivotId() ??
            this.#window.getCurrentAssistantId() ??
            this.#window.getLastVisibleAssistantId();

        if (forceFromId !== undefined) {
            anchor = (forceFromId === null) ? undefined : Number(forceFromId);
        }
        if (anchor === undefined || anchor === null) {
            if ("from_id" in params) delete params.from_id;
        } else {
            params.from_id = anchor;
        }

        // set pending user parent only if we'll echo user
        this.#state.setPendingUserParentId((!skipUserEcho && anchor) ? anchor : null);

        const {close} = this.#createStreamES(path, {
            params,
            tokenParam: "bearer",
            withCredentials: false,
            onOpen: () => console.log("🔗 stream open"),
            onEvent: this.#onSSEEvent,
            onError: this.#onStreamFailure,
        });
        this.#close = close;

        return {close};
    }

    cancel() {
        try {
            this.#close?.();
        } catch {
        }
        this.#typewriter?.cancel();
        this.#close = null;
    }

    // ---------- SSE handling ----------

    #onSSEEvent = (evt) => {
        const payload = evt?.data ?? evt;
        const type = payload?.type ?? evt?.type;
        switch (type) {
            case "init":
                return this.#handleInit(payload);
            case "delta":
                return this.#handleDelta(payload);
            case "done":
                return this.#handleDone(payload);
            case "error":
                return this.#handleServerError(payload);
            default:
                return;
        }
    };

    #handleInit(payload) {
        // bind optimistic edited user id -> real id
        const temp = this.#state.getTempUserId?.();
        if (temp && payload.user_message_id) {
            this.#window.rebindId(temp, payload.user_message_id);
            this.#state.setTempUserId?.(null);
            // hand-off the pin from the temp user to the real user id
            this.#window.pinPathTo(payload.user_message_id);
            this.#window.decorateVariantGroups();
        }

        // echo user if not skipping
        if (!this.#opts.skipUserEcho && payload.user_message_id) {
            this.#window.renderMessage({
                id: payload.user_message_id,
                role: "user",
                content: [{value: this.#state.getCurrentUserText?.() || ""}],
                parent_id: this.#state.getPendingUserParentId?.() ?? null,
            });
        }
        // never use pending parent after init
        this.#state.setPendingUserParentId?.(null);

        // assistant skeleton
        this.#skeletonHandle = this.#window.startAssistantSkeleton({id: payload.assistant_message_id});
        this.#state.setActivePivotId?.(payload.assistant_message_id);

        // attach under the fresh user message if present
        const parentId = payload.user_message_id || payload.assistant_parent_id || null;
        if (parentId && this.#skeletonHandle?.elements?.article) {
            this.#skeletonHandle.elements.article.dataset.parentId = String(parentId);
        }

        // keep visible path pinned
        this.#window.pinPathTo(payload.assistant_message_id);

        // update variant groups
        this.#window.decorateVariantGroups();
    }

    #handleDelta(payload) {
        const chunk = typeof payload === "string" ? payload : (payload?.data ?? "");
        if (chunk) this.#typewriter.append(chunk);
    }

    #handleDone(payload) {
        const tail = typeof payload === "string" ? payload : (payload?.data ?? "");
        if (tail) this.#typewriter.append(tail);
        this.#close?.();
        this.#typewriter.done();
    }

    #handleServerError(payload) {
        console.error("SSE error:", payload);
        this.#close?.();
        this.#typewriter.done(); // finalize will still run (empty buffer)
    }

    #onStreamFailure = (err) => {
        console.error("❌ stream failed:", err);
        this.#typewriter.done();
    };

    // ---------- finalize hook ----------

    #finalize() {
        try {
            this.#skeletonHandle?.finish?.();
        } catch (e) {
        }
        if (this.#opts?.regenButton) {
            const btn = this.#opts.regenButton;
            try {
                btn.disabled = false;
                btn.classList.remove("is-active");
                btn.setAttribute("data-tip", "Regenerate");
                btn.setAttribute("title", "Regenerate");
            } catch (e) {
            }
            this.#opts.regenButton = null;
        }
        this.#hooks?.onFinalize?.(this.#opts);
        this.#window.scrollToBottom();
    }

}
