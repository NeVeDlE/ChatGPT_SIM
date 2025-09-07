// components/text-to-speech.js
import { authPostBlob } from "../../services/api";

export class TextToSpeech {
    constructor({
                    endpoint = "/tts",
                    defaultVoice = "Atlas-PlayAI",
                    playingClass = "is-playing",
                } = {}) {
        this.endpoint = endpoint;
        this.defaultVoice = defaultVoice;
        this.playingClass = playingClass;

        this.audio = new Audio();
        this.abort = null;
        this.url = null;
        this.fetching = false;
        this.currentBtn = null;

        this.audio.addEventListener("ended", () => this._stopAndUpdate());
    }

    async toggle({ text, voice, button } = {}) {
        this.currentBtn = this._resolveEl(button) || this.currentBtn;

        const playing = !this.audio.paused && !this.audio.ended;
        if (this.fetching || playing) {
            this.stop();
            return false; // stopped
        }

        await this.speak({ text, voice });
        return true; // started
    }

    async speak({ text, voice } = {}) {
        if (!text || !text.trim()) return;

        this.stop(); // clean start
        this.fetching = true;
        this._updateButton(true);

        this.abort = new AbortController();

        try {
            const { ok, blob, error } = await authPostBlob(
                this.endpoint,
                { text, voice: voice || this.defaultVoice },
                this.abort.signal
            );
            if (!ok) throw new Error(error || "TTS failed");

            this.url = URL.createObjectURL(blob);
            this.audio.src = this.url;
            await this.audio.play().catch(() => {});
        } catch (e) {
            if (e.name !== "AbortError") console.error(e);
            this._stopAndUpdate();
        } finally {
            this.fetching = false;
            this._updateButton(!this.audio.paused && !this.audio.ended);
        }
    }

    stop() {
        if (this.abort) {
            try { this.abort.abort(); } catch {}
            this.abort = null;
        }
        try { this.audio.pause(); } catch {}
        this.audio.currentTime = 0;
        this.audio.src = "";
        if (this.url) {
            URL.revokeObjectURL(this.url);
            this.url = null;
        }
        this.fetching = false;
        this._updateButton(false);
    }

    // ---------- internals ----------
    _stopAndUpdate() {
        this.stop();
        this._updateButton(false);
    }

    _resolveEl(btnOrSelector) {
        if (!btnOrSelector) return null;
        if (btnOrSelector instanceof HTMLElement) return btnOrSelector;
        if (typeof btnOrSelector === "string") {
            try { return document.querySelector(btnOrSelector); } catch { return null; }
        }
        return null;
    }

    _updateButton(active) {
        const el = this.currentBtn;
        if (!el || !(el instanceof HTMLElement)) return; // handle no button passed
        el.classList.toggle(this.playingClass, !!active);
        el.dataset.playing = active ? "1" : "0";
        el.setAttribute("aria-pressed", active ? "true" : "false");
    }
}
