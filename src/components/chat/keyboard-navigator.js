// components/KeyboardNavigator.js
export class KeyboardNavigator {
    #window; #getPivotId; #setPivotId; #listener;

    constructor({ window, getPivotId, setPivotId }) {
        this.#window = window;
        this.#getPivotId = getPivotId;
        this.#setPivotId = setPivotId;

        this.#listener = (e) => {
            const tag = (e.target?.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey) return;

            const nav = document.querySelector(".variant-nav");
            if (!nav) return;
            const article = nav.closest("article.msg");
            if (!article) return;

            if (e.key === "ArrowLeft") {
                const nextArt = this.#window.switchVariantByArticle(article, -1);
                const id = this.#window.getLastVisibleAssistantId() || nextArt?.dataset?.id || this.#getPivotId();
                this.#setPivotId(Number(id));
            } else if (e.key === "ArrowRight") {
                const nextArt = this.#window.switchVariantByArticle(article, +1);
                const id = this.#window.getLastVisibleAssistantId() || nextArt?.dataset?.id || this.#getPivotId();
                this.#setPivotId(Number(id));
            }
            this.#window.scrollToBottom();
        };

        document.addEventListener("keydown", this.#listener);
    }

    destroy() {
        document.removeEventListener("keydown", this.#listener);
    }
}
