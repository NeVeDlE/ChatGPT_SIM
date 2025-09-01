// app/chat.js (the Chat controller)
import { getUser } from "../services/storage.js";
import { showError } from "../utils/dom.js";
import { authGet, createStreamES } from "../services/api.js";

import { ChatSidebar } from "../components/chat-sidebar.js";
import { ChatWindow } from "../components/chat-window.js";
import { ChatInput } from "../components/chat-input.js";

class Chat {
    #chatId = null;
    #activePivotId = null;        // assistant id to anchor new turns
    #pendingUserParentId = null;  // link the echo'd user message

    // streaming state
    #buffer = "";
    #visible = "";
    #done = false;
    #handle = null;
    #setContent = (md) => {};
    #closeStream = null;
    #currentUserText = "";

    // timers
    #timers = { type: null, render: null };

    // tuning
    #TYPE_CPS = 80;
    #TICK_MS = 20;
    #RENDER_MS = 60;
    #CHARS_PER_TICK = 1;

    constructor() {
        // header info
        const { email, name, avatar_url } = getUser();
        const nameEl = document.querySelector("[data-user-name]");
        const emailEl = document.querySelector("[data-user-email]");
        const avatarEl = document.querySelector("[data-user-avatar]");
        if (nameEl) nameEl.textContent = name || "";
        if (emailEl) emailEl.textContent = email || "";
        if (avatarEl) avatarEl.src = avatar_url || "";

        // components
        this.window = new ChatWindow("#chat");
        this.sidebar = new ChatSidebar("#recent-conversations");
        this.input = new ChatInput({ formSelector: "#chat-form", inputSelector: "#message" });

        // events
        this.sidebar.onConversationSelected((id) => {
            this.#chatId = Number(id);
            this.loadConversation(this.#chatId);
        });

        this.input.onMessageSubmit((text) => {
            if (!this.#chatId) return showError("Pick a conversation first.");
            this.startStream(text);
        });

        this.window.onAction(this.#handleAction);

        document.addEventListener("keydown", (e) => {
            const tag = (e.target?.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey) return;
            const nav = document.querySelector(".variant-nav");
            if (!nav) return;
            const article = nav.closest("article.msg");
            if (!article) return;
            if (e.key === "ArrowLeft") {
                const nextArt = this.window.switchVariantByArticle(article, -1);
                this.#activePivotId = Number(this.window.getLastVisibleAssistantId() || nextArt?.dataset?.id || this.#activePivotId);
            } else if (e.key === "ArrowRight") {
                const nextArt = this.window.switchVariantByArticle(article, +1);
                this.#activePivotId = Number(this.window.getLastVisibleAssistantId() || nextArt?.dataset?.id || this.#activePivotId);
            }
            this.window.scrollToBottom();
        });
    }

    async loadConversation(conversationId) {
        try {
            const { ok, data } = await authGet(`/chats/${conversationId}/messages`);
            if (!ok || data?.status === "error") return showError(data?.message || "Fetching Conversations Failed.");
            this.window.pinPathTo(null);                 // clear any previous pin
            this.window.renderMessages(data.data);
            this.#activePivotId = this.window.getLastVisibleAssistantId() || null;
            this.window.scrollToBottom();
        } catch (err) {
            console.error("Error fetching messages:", err);
            showError("Could not load conversation.");
        }
    }

    // =========================
    // Public: start the stream
    // =========================
    #opts = null; // { reuseArticle, skipUserEcho, regenButton }

    startStream(userText, {
        reuseArticle = null,
        skipUserEcho = false,
        endpoint = null,          // if set, use this (regen); else /generate/stream
        extraParams = {},
        regenButton = null,
    } = {}) {
        this.#clearTimers();
        this.#closeStream?.();

        this.#buffer = "";
        this.#visible = "";
        this.#done = false;
        this.#handle = null;
        this.#setContent = () => {};
        this.#currentUserText = userText;
        this.#CHARS_PER_TICK = Math.max(1, Math.round((this.#TYPE_CPS * this.#TICK_MS) / 1000));
        this.#opts = { reuseArticle, skipUserEcho, regenButton };

        const path = endpoint ?? `/chats/${this.#chatId}/generate/stream`;
        const params = { temperature: 1, ...extraParams };
        if (userText) params.prompt = userText;

        // Determine anchor: prefer explicitly set pivot, else current visible assistant, else tail
        const anchor =
            this.#activePivotId ??
            this.window.getCurrentAssistantId() ??
            this.window.getLastVisibleAssistantId();

        if (anchor) params.from_id = anchor;
        this.#pendingUserParentId = anchor || null;

        const { close } = createStreamES(path, {
            params,
            tokenParam: "bearer",
            withCredentials: false,
            onOpen: () => console.log("🔗 stream open"),
            onEvent: this.#onSSEEvent,
            onError: this.#onStreamFailure,
        });
        this.#closeStream = close;
    }

    // =========================
    // SSE dispatcher
    // =========================
    #onSSEEvent = (evt) => {
        const payload = evt?.data ?? evt;
        const type = payload?.type ?? evt?.type;

        switch (type) {
            case "init":  return this.#handleInit(payload);
            case "delta": return this.#handleDelta(payload);
            case "done":  return this.#handleDone(payload);
            case "error": return this.#handleServerError(payload);
            default:      return; // ignore unknown
        }
    };

    // ---------- event handlers ----------

    #handleInit(payload) {
        // echo the user message in the correct branch, unless told to skip
        if (!this.#opts.skipUserEcho && payload.user_message_id) {
            this.window.renderMessage({
                id: payload.user_message_id,
                role: "user",
                content: [{ value: this.#currentUserText }],
                parent_id: this.#pendingUserParentId ?? null,
            });
            this.#pendingUserParentId = null;
        }

        // create assistant skeleton
        this.#handle = this.window.startAssistantSkeleton({ id: payload.assistant_message_id });
        this.#setContent = (md) => this.#handle.setMarkdown(md);
        this.#activePivotId = payload.assistant_message_id;

        // Put the skeleton under the right parent
        const parentId =
            payload.assistant_parent_id ||
            this.#pendingUserParentId ||
            payload.user_message_id ||
            null;

        if (parentId && this.#handle?.elements?.article) {
            this.#handle.elements.article.dataset.parentId = String(parentId);
        }

        // Pin the visible path to this new leaf (keeps branch stable)
        this.window.pinPathTo(payload.assistant_message_id);

        // Re-evaluate groups so arrows/visibility are right away
        this.window.decorateVariantGroups();

        this.#startTypewriterLoop();
    }

    #handleDelta(payload) {
        const chunk = typeof payload === "string" ? payload : (payload?.data ?? "");
        if (chunk) this.#buffer += chunk;
    }

    #handleDone(payload) {
        const tail = typeof payload === "string" ? payload : (payload?.data ?? "");
        if (tail) this.#buffer += tail;
        this.#done = true;
        this.#closeStream?.();
    }

    #handleServerError(payload) {
        console.error("SSE error:", payload);
        this.#done = true;
        this.#closeStream?.();
        this.#finalizeStream(); // end gracefully
    }

    #onStreamFailure = (err) => {
        console.error("❌ stream failed:", err);
        this.#done = true;
        this.#finalizeStream();
    };

    // ---------- typewriter / render ----------

    #startTypewriterLoop() {
        this.#timers.type = setInterval(() => {
            if (this.#buffer.length > 0) {
                const take = Math.min(this.#buffer.length, this.#CHARS_PER_TICK);
                const chunk = this.#buffer.slice(0, take);
                this.#buffer = this.#buffer.slice(take);
                this.#visible += chunk;
                this.#scheduleRender();
            } else if (this.#done) {
                this.#finalizeStream();
            }
        }, this.#TICK_MS);
    }

    #scheduleRender() {
        if (this.#timers.render) return;
        this.#timers.render = setTimeout(() => {
            this.#setContent(this.#visible);
            this.window.scrollToBottom();
            this.#timers.render = null;
        }, this.#RENDER_MS);
    }

    #finalizeStream() {
        if (this.#timers.render) {
            clearTimeout(this.#timers.render);
            this.#timers.render = null;
        }
        if (this.#timers.type) {
            clearInterval(this.#timers.type);
            this.#timers.type = null;
        }
        this.#setContent(this.#visible);
        this.#handle?.finish?.();

        this.window.decorateVariantGroups();
        this.window.scrollToBottom();
    }

    // ---------- utilities ----------
    #clearTimers() {
        if (this.#timers.type) {
            clearInterval(this.#timers.type);
            this.#timers.type = null;
        }
        if (this.#timers.render) {
            clearTimeout(this.#timers.render);
            this.#timers.render = null;
        }
    }

    #handleAction = async ({ action, role, article, text, button }) => {
        if (action === "set-pivot") {
            this.#activePivotId = article?.dataset?.id ? Number(article.dataset.id) : null;
            return;
        }
        if (action === "variant-prev") {
            const nextArt = this.window.switchVariantByArticle(article, -1);
            this.#activePivotId = Number(this.window.getLastVisibleAssistantId() || nextArt?.dataset?.id || this.#activePivotId);
            this.window.scrollToBottom();
            return;
        }
        if (action === "variant-next") {
            const nextArt = this.window.switchVariantByArticle(article, +1);
            this.#activePivotId = Number(this.window.getLastVisibleAssistantId() || nextArt?.dataset?.id || this.#activePivotId);
            this.window.scrollToBottom();
            return;
        }
        if (action === "regenerate" && role === "assistant") {
            const assistantId = article.dataset.id;
            if (!assistantId) return console.warn("Assistant message id missing.");

            // stay on the same branch
            this.#pendingUserParentId = Number(article.dataset.parentId) || null;
            this.#activePivotId = Number(assistantId) || null;
            this.window.pinPathTo(assistantId);

            // optional button feedback
            if (button) {
                button.disabled = true;
                button.classList.add("is-active");
                button.setAttribute("data-tip", "Regenerating…");
                button.setAttribute("title", "Regenerating…");
            }

            // stream regeneration
            this.startStream(null, {
                reuseArticle: article,
                skipUserEcho: true,
                endpoint: `/chats/${this.#chatId}/messages/${assistantId}/regenerate/stream`,
                extraParams: {},
                regenButton: button,
            });
            return;
        }

        if (action === "copy") {
            try {
                await navigator.clipboard.writeText(text || "");
            } catch (e) {
                console.error("Copy failed:", e);
            }
            return;
        }
    };
}

new Chat();
