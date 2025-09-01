// components/actions/regenerator.js
export class Regenerator {
    #getChatId;
    #window;
    #startStream;
    #setActivePivotId;
    #setPendingUserParentId;

    constructor({
                    chatIdGetter,
                    window,
                    startStream,
                    setActivePivotId,
                    setPendingUserParentId,
                }) {
        this.#getChatId = chatIdGetter;
        this.#window = window;
        this.#startStream = startStream;
        this.#setActivePivotId = setActivePivotId;
        this.#setPendingUserParentId = setPendingUserParentId;
    }

    /**
     * Regenerate an assistant reply in-place, keeping on the same branch.
     * Mirrors the original inline logic, but isolated for reuse.
     */
    regenerate(article, button) {
        const chatId = this.#getChatId?.();
        if (!chatId) return console.warn("No active chat.");

        const assistantId = article?.dataset?.id;
        if (!assistantId) return console.warn("Assistant message id missing.");

        // stay on same branch
        const parentId = Number(article.dataset.parentId) || null;
        this.#setPendingUserParentId(parentId);
        this.#setActivePivotId(Number(assistantId) || null);

        // pin the path and give button feedback
        this.#window.pinPathTo(assistantId);
        if (button) {
            button.disabled = true;
            button.classList.add("is-active");
            button.setAttribute("data-tip", "Regenerating…");
            button.setAttribute("title", "Regenerating…");
        }

        // stream regeneration
        this.#startStream(null, {
            reuseArticle: article,
            skipUserEcho: true,
            endpoint: `/chats/${chatId}/messages/${assistantId}/regenerate/stream`,
            extraParams: {},
            regenButton: button,
        });
    }
}
