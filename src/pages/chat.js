import {Sidebar} from "../components/chat/sidebar";
import {Regenerator} from "../components/chat/regenerator";
import {Editor} from "../components/chat/editor";
import {ActionController} from "../components/chat/action-controller";
import {ConversationLoader} from "../components/chat/conversation-loader";
import {KeyboardNavigator} from "../components/chat/keyboard-navigator";
import {getUser} from "../services/storage";
import {StreamSession} from "../components/chat/stream-session";
import {authGet, createStreamES} from "../services/api";
import {showError} from "../utils/dom";
import {Window} from "../components/chat/window";
import {Input} from "../components/chat/input.js";

class Chat {
    // state
    #chatId = null;
    #activePivotId = null;
    #pendingUserParentId = null;
    #tempUserId = null;
    #currentUserText = "";

    // tuning
    #TYPE_CPS = 80;
    #TICK_MS = 20;
    #RENDER_MS = 60;

    // helpers
    #actions;
    #loader;
    #kbd;
    #session = null;

    constructor() {
        this.#initHeader();

        // core UI
        this.window = new Window("#chat");
        this.sidebar = new Sidebar("#recent-conversations");
        this.input = new Input({formSelector: "#chat-form", inputSelector: "#message"});

        // features
        this.regen = new Regenerator({
            chatIdGetter: () => this.#chatId,
            window: this.window,
            startStream: (...args) => this.startStream(...args),
            setActivePivotId: (id) => {
                this.#activePivotId = id;
            },
            setPendingUserParentId: (id) => {
                this.#pendingUserParentId = id;
            },
        });

        this.editor = new Editor({
            chatIdGetter: () => this.#chatId,
            window: this.window,
            startStream: (...args) => this.startStream(...args),
            setActivePivotId: (id) => {
                this.#activePivotId = id;
            },
            setPendingUserParentId: (id) => {
                this.#pendingUserParentId = id;
            },
            setTempUserId: (tid) => {
                this.#tempUserId = tid;
            },
        });

        this.#actions = new ActionController({
            window: this.window,
            setActivePivotId: (id) => {
                this.#activePivotId = id;
            },
            regen: this.regen,
            editor: this.editor,
        });

        this.#loader = new ConversationLoader({
            authGet,
            window: this.window,
            setActivePivotId: (id) => {
                this.#activePivotId = id;
            },
            showError,
        });

        this.#kbd = new KeyboardNavigator({
            window: this.window,
            getPivotId: () => this.#activePivotId,
            setPivotId: (id) => {
                this.#activePivotId = id;
            },
        });

        // wiring
        this.sidebar.onConversationSelected((id) => {
            this.#chatId = Number(id);
            this.loadConversation(this.#chatId);
        });
        this.input.onMessageSubmit((text) => {
            if (!this.#chatId) return showError("Pick a conversation first.");
            this.startStream(text);
        });
        this.window.onAction(this.#handleAction);
    }

    #initHeader() {
        const {email, name, avatar_url} = getUser();
        const nameEl = document.querySelector("[data-user-name]");
        const emailEl = document.querySelector("[data-user-email]");
        const avatarEl = document.querySelector("[data-user-avatar]");
        if (nameEl) nameEl.textContent = name || "";
        if (emailEl) emailEl.textContent = email || "";
        if (avatarEl) avatarEl.src = avatar_url || "";
    }

    // ------ tiny public surface ------
    async loadConversation(conversationId) {
        return this.#loader.load(conversationId);
    }

    startStream(userText, {
        endpoint = null,
        extraParams = {},
        skipUserEcho = false,
        forceFromId,
        regenButton = null,
        reuseArticle = null, // not used here, but kept for API parity; StreamSession renders skeleton fresh
    } = {}) {
        // end previous stream if any
        this.#session?.cancel();

        // build a new session per turn
        this.#session = new StreamSession({
            chatId: this.#chatId,
            window: this.window,
            createStreamES,
            tuning: {cps: this.#TYPE_CPS, tickMs: this.#TICK_MS, renderMs: this.#RENDER_MS},
            state: {
                getActivePivotId: () => this.#activePivotId,
                setActivePivotId: (id) => {
                    this.#activePivotId = id;
                },
                getPendingUserParentId: () => this.#pendingUserParentId,
                setPendingUserParentId: (id) => {
                    this.#pendingUserParentId = id;
                },
                getTempUserId: () => this.#tempUserId,
                setTempUserId: (id) => {
                    this.#tempUserId = id;
                },
                getCurrentUserText: () => this.#currentUserText,
                setCurrentUserText: (t) => {
                    this.#currentUserText = t;
                },
            },
            hooks: {
                onFinalize: (opts) => {
                    // keep variant groups correct after stream
                    this.window.decorateVariantGroups();

                    // also reset regen button here if you want — already handled inside session,
                    // left here so you can extend later (analytics, etc.)
                    if (opts?.regenButton) {
                        try {
                            opts.regenButton.disabled = false;
                            opts.regenButton.classList.remove("is-active");
                            opts.regenButton.setAttribute("data-tip", "Regenerate");
                            opts.regenButton.setAttribute("title", "Regenerate");
                        } catch {
                        }
                    }
                },
            },
        });

        this.#session.start({
            userText,
            endpoint,
            extraParams,
            skipUserEcho,
            forceFromId,
            regenButton,
        });
    }

    // one-liner: delegate UI actions to controller
    #handleAction = (payload) => this.#actions.handle(payload);
}

new Chat();

