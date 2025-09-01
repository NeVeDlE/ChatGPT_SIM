// services/ConversationLoader.js
export class ConversationLoader {
    #authGet; #window; #setActivePivotId; #showError;

    constructor({ authGet, window, setActivePivotId, showError }) {
        console.log('here');
        this.#authGet = authGet;
        this.#window = window;
        this.#setActivePivotId = setActivePivotId;
        this.#showError = showError;
    }

    async load(conversationId) {
        try {
            const { ok, data } = await this.#authGet(`/chats/${conversationId}/messages`);
            if (!ok || data?.status === "error") return this.#showError(data?.message || "Fetching Conversations Failed.");
            this.#window.pinPathTo(null);
            this.#window.renderMessages(data.data);
            this.#setActivePivotId(this.#window.getLastVisibleAssistantId() || null);
            this.#window.scrollToBottom();
        } catch (err) {
            console.error("Error fetching messages:", err);
            this.#showError("Could not load conversation.");
        }
    }
}