// ui/chat-sidebar.js
import { authGet } from "../services/api.js";
import { showError } from "../utils/dom.js";

export class ChatSidebar {
    #conversations;
    #onConversationSelected;

    constructor(selector = "#recent-conversations") {
        this.#conversations = document.querySelector(selector);
        if (!this.#conversations) throw new Error("ChatSidebar: container not found");
        this.renderConversations();
        this.#wireClicks();
    }

    async renderConversations() {
        try {
            const { ok, data } = await authGet("/chats");
            if (!ok || data.status === "error") return showError(data.message || "Fetching Conversations Failed.");

            this.#conversations.innerHTML = ""; // clear first
            data.data.forEach((c) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "thread";
                btn.dataset.id = c.id;
                btn.innerHTML = c.title;

                const dot = document.createElement("span");
                dot.className = "dot";
                btn.prepend(dot);

                this.#conversations.appendChild(btn);
            });
        } catch (err) {
            console.error("Error fetching conversations:", err);
        }
    }

    #wireClicks() {
        this.#conversations.addEventListener("click", (e) => {
            const btn = e.target.closest("button.thread");
            if (!btn) return;
            this.#onConversationSelected?.(btn.dataset.id);
        });
    }

    onConversationSelected(cb) { this.#onConversationSelected = cb; }
}
