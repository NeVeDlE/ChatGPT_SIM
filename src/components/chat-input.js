
export class ChatInput {
    #form; #input; #onSubmit = null;

    constructor({ formSelector = "#chat-form", inputSelector = "#message" } = {}) {
        this.#form  = document.querySelector(formSelector);
        this.#input = document.querySelector(inputSelector);
        if (!this.#form || !this.#input) throw new Error("ChatInput: form or input not found");

        this.#form.addEventListener("submit", this.#handleSubmit);
        this.#input.addEventListener("keydown", this.#handleKey);
    }

    onMessageSubmit(cb) { this.#onSubmit = cb; }
    destroy() {
        this.#form?.removeEventListener("submit", this.#handleSubmit);
        this.#input?.removeEventListener("keydown", this.#handleKey);
    }

    #handleKey = (e) => {
        if (e.isComposing) return;             // IME safe
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.#handleSubmit(e);
        }
    };

    #handleSubmit = (e) => {
        e.preventDefault();
        const text = this.#input.value.trim();
        if (!text) return;
        this.#input.value = "";
        this.#onSubmit?.(text);
    };
}
