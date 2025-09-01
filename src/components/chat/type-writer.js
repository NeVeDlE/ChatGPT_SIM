// components/stream/Typewriter.js
export class TypeWriter {
    #buffer = "";
    #visible = "";
    #done = false;

    #TYPE_CPS;
    #TICK_MS;
    #RENDER_MS;

    #timers = { type: null, render: null };

    #setContent;     // (md: string) => void
    #onRender;       // () => void   (e.g., scrollToBottom)
    #onFinalize;     // () => void   (cleanup hooks)

    constructor({
                    cps = 80,
                    tickMs = 20,
                    renderMs = 60,
                    setContent = () => {},
                    onRender = () => {},
                    onFinalize = () => {},
                } = {}) {
        this.#TYPE_CPS = cps;
        this.#TICK_MS = tickMs;
        this.#RENDER_MS = renderMs;
        this.#setContent = setContent;
        this.#onRender = onRender;
        this.#onFinalize = onFinalize;
    }

    start() {
        // chars per tick
        const CHARS_PER_TICK = Math.max(1, Math.round((this.#TYPE_CPS * this.#TICK_MS) / 1000));

        this.cancel(); // clear any previous run

        this.#timers.type = setInterval(() => {
            if (this.#buffer.length > 0) {
                const take = Math.min(this.#buffer.length, CHARS_PER_TICK);
                const chunk = this.#buffer.slice(0, take);
                this.#buffer = this.#buffer.slice(take);
                this.#visible += chunk;
                this.#scheduleRender();
            } else if (this.#done) {
                this.#finalize();
            }
        }, this.#TICK_MS);
    }

    append(text) {
        if (!text) return;
        this.#buffer += String(text);
    }

    done() {
        this.#done = true;
    }

    cancel() {
        if (this.#timers.render) {
            clearTimeout(this.#timers.render);
            this.#timers.render = null;
        }
        if (this.#timers.type) {
            clearInterval(this.#timers.type);
            this.#timers.type = null;
        }
        this.#buffer = "";
        this.#visible = "";
        this.#done = false;
    }

    // ---- internals ----
    #scheduleRender() {
        if (this.#timers.render) return;
        this.#timers.render = setTimeout(() => {
            this.#setContent(this.#visible);
            this.#onRender();
            this.#timers.render = null;
        }, this.#RENDER_MS);
    }

    #finalize() {
        if (this.#timers.render) {
            clearTimeout(this.#timers.render);
            this.#timers.render = null;
        }
        if (this.#timers.type) {
            clearInterval(this.#timers.type);
            this.#timers.type = null;
        }
        this.#setContent(this.#visible);
        this.#onFinalize();
    }
}
