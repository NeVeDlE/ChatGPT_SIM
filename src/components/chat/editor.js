// components/actions/editor.js
export class Editor {
    #getChatId;
    #window;
    #startStream;
    #setActivePivotId;
    #setPendingUserParentId;
    #setTempUserId;

    constructor({
                    chatIdGetter,
                    window,
                    startStream,
                    setActivePivotId,
                    setPendingUserParentId,
                    setTempUserId,
                }) {
        this.#getChatId = chatIdGetter;
        this.#window = window;
        this.#startStream = startStream;
        this.#setActivePivotId = setActivePivotId;
        this.#setPendingUserParentId = setPendingUserParentId;
        this.#setTempUserId = setTempUserId;
    }

    /**
     * Save a user edit as a new branch (keeps original message),
     * then stream a fresh assistant reply under the new user node.
     */
    save(article, newText) {
        const chatId = this.#getChatId?.();
        if (!chatId) return console.warn("No active chat.");

        const originalUserId = Number(article?.dataset?.id);
        if (!originalUserId) return console.warn("User message id missing.");

        const parentRaw = article.dataset.parentId;
        const parentId = (parentRaw && parentRaw !== "null") ? Number(parentRaw) : null;

        // 1) Create optimistic new USER node under the same parent
        const tempId = `t-${Date.now()}`;
        this.#window.renderMessage({
            id: tempId,
            role: "user",
            content: [{ value: newText }],
            parent_id: parentId,
        });
        this.#setTempUserId(tempId);

        // keep the UI focused on this new branch
        this.#window.pinPathTo(tempId);
        this.#window.decorateVariantGroups();
        this.#window.scrollToBottom();

        // 2) Stream a brand new ASSISTANT child under this new user node
        this.#setActivePivotId(parentId ?? null);  // avoid wrong fallback anchor
        this.#setPendingUserParentId(null);        // assistant uses payload.user_message_id as parent

        this.#startStream(newText, {
            skipUserEcho: true,
            endpoint: `/chats/${chatId}/messages/${originalUserId}/edit/stream`,
            forceFromId: (parentId !== null) ? parentId : null, // null => no from_id at root
        });
    }
}
