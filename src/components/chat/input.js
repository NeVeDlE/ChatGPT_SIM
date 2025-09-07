// components/chat/input.js


import {SpeechToText} from "./SpeechToText";

export class Input {
    #form; #ta; #btnRecord; #onSubmit;
    #stt; #opts;

    /**
     * Options:
     * - formSelector:   form element selector
     * - inputSelector:  textarea/input selector
     * - recordSelector: (optional) record button selector; if missing, STT is disabled
     * - sttEndpoint:    defaults to "/transcribe"
     * - recordingClass: CSS class toggled on the record button
     * - onSttError:     callback for STT errors (e.g., showError)
     */
    constructor({
                    formSelector   = "#chat-form",
                    inputSelector  = "#message",
                    recordSelector= '[data-hook="voice"]', // 👈 hook the 🎙️ button
                    sttEndpoint    = "/transcribe",
                    recordingClass = "is-recording",
                    onSttError     = (m) => console.error(m),
                } = {}) {
        this.#opts = { sttEndpoint, recordingClass, onSttError };

        this.#form = document.querySelector(formSelector);
        this.#ta   = document.querySelector(inputSelector);
        this.#btnRecord = recordSelector ? document.querySelector(recordSelector) : null;

        if (!this.#ta) throw new Error("Input: textarea not found");

        // Submit (Enter to send handled outside or add here as you wish)
        this.#form?.addEventListener("submit", (e) => {
            e.preventDefault();
            const text = this.value.trim();
            if (!text) return;
            this.#onSubmit?.(text);
            this.value = ""; // clear
        });

        // Optional: STT
        if (this.#btnRecord) {
            this.#stt = new SpeechToText({
                endpoint: this.#opts.sttEndpoint,
                recordingClass: this.#opts.recordingClass,
                onResult: (text) => {
                    const needsSpace = this.value && !/\s$/.test(this.value);
                    this.value = (this.value || "") + (needsSpace ? " " : "") + (text || "");
                    this.focus();
                },
                onError: this.#opts.onSttError,
            });

            this.#btnRecord.addEventListener("click", async () => {
                await this.#stt.toggle({ button: this.#btnRecord, translate: false, language: null });
            });
        }
    }

    onMessageSubmit(cb) { this.#onSubmit = cb; }

    // Small conveniences the rest of your app can use:
    get value() { return this.#ta?.value ?? ""; }
    set value(v) {
        if (!this.#ta) return;
        this.#ta.value = v ?? "";
        this.#ta.dispatchEvent(new Event("input")); // keep autoresize etc. in sync
    }
    focus() { this.#ta?.focus(); }

    destroy() {
        // If you add listeners you want to remove, do it here.
        // Stop STT if recording:
        try { this.#stt?.toggle({}); } catch {}
    }
}
