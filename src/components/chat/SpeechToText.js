// components/chat/speech-to-text.js
import { authPostForm } from "../../services/api";

export class SpeechToText {
    constructor({
                    endpoint = "/api/transcribe",
                    recordingClass = "is-recording",
                    onResult = (text) => console.log("STT:", text),
                    onError  = (msg)  => console.error("STT error:", msg),
                } = {}) {
        this.endpoint = endpoint;
        this.recordingClass = recordingClass;
        this.onResult = onResult;
        this.onError  = onError;

        this.mediaRecorder = null;
        this.stream = null;
        this.chunks = [];
        this.currentBtn = null;

        this.mime = ""; // actual mime from MediaRecorder
    }

    async toggle({ button, translate = false, language = null, prompt = "" } = {}) {
        if (button instanceof HTMLElement) this.currentBtn = button;

        if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
            await this.stop({ translate, language, prompt });
            return false;
        }
        await this.start();
        return true;
    }

    async start() {
        if (!window.MediaRecorder) {
            this.onError("MediaRecorder is not supported in this browser.");
            return;
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const preferred = this._pickMime();
            this.mediaRecorder = new MediaRecorder(
                this.stream,
                preferred ? { mimeType: preferred } : undefined
            );

            // actual mime selected by the browser (may include ;codecs=opus)
            this.mime = this.mediaRecorder.mimeType || preferred || "audio/webm";

            this.chunks = [];
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size) this.chunks.push(e.data);
            };

            this.mediaRecorder.start(250);
            this._setBtnActive(true);
        } catch (e) {
            this.onError(e?.message || "Mic permission denied");
            this._setBtnActive(false);
        }
    }

    async stop({ translate = false, language = null, prompt = "" } = {}) {
        if (!this.mediaRecorder) return;

        const rec = this.mediaRecorder;

        return new Promise((resolve) => {
            rec.onstop = async () => {
                try {
                    // Normalize mime for Laravel's exact match (strip ";codecs=...")
                    const baseMime = this._baseMime(this.mime);        // e.g. "audio/webm"
                    const ext     = this._extForMime(baseMime);        // e.g. "webm"

                    const blob = new Blob(this.chunks, { type: baseMime });

                    const fd = new FormData();
                    fd.append("audio", blob, `recording.${ext}`);      // field name MUST be "audio"
                    fd.append("translate", translate ? "1" : "0");     // ← boolean as "1"/"0"
                    if (language) fd.append("language", language);
                    if (prompt)   fd.append("prompt",   prompt);

                    const { ok, data, error } = await authPostForm(this.endpoint, fd);
                    if (!ok || !data?.ok) {
                        this.onError(error || data?.message || "Transcription failed");
                    } else {
                        this.onResult(data.text || "");
                    }
                } catch (e) {
                    this.onError(e?.message || "Upload failed");
                } finally {
                    this._cleanupStream();
                    this._setBtnActive(false);
                    resolve();
                }
            };

            try { rec.stop(); } catch {}
        });
    }

    // ---------- helpers ----------

    // Prefer webm/opus, then webm/ogg/mp4
    _pickMime() {
        const c = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/ogg",
            "audio/mp4", // Safari/iOS (AAC in MP4/M4A)
        ];
        for (const m of c) {
            try { if (MediaRecorder.isTypeSupported(m)) return m; } catch {}
        }
        return "";
    }

    // Strip codec parameters so Laravel 'mimetypes' exact match passes
    _baseMime(m) {
        if (!m) return "audio/webm";
        return m.split(";")[0].trim(); // "audio/webm;codecs=opus" -> "audio/webm"
    }

    _extForMime(m) {
        if (!m) return "webm";
        if (m.includes("ogg"))  return "ogg";
        if (m.includes("mp4"))  return "m4a"; // common audio-only ext for audio/mp4
        if (m.includes("wav"))  return "wav";
        if (m.includes("mpeg")) return "mp3";
        return "webm";
    }

    _cleanupStream() {
        if (this.stream) {
            try { this.stream.getTracks().forEach(t => t.stop()); } catch {}
        }
        this.stream = null;
        this.mediaRecorder = null;
        this.chunks = [];
    }

    _setBtnActive(active) {
        const el = this.currentBtn;
        if (!el) return;
        el.classList.toggle(this.recordingClass, !!active);
        el.dataset.recording = active ? "1" : "0";
        el.setAttribute("aria-pressed", active ? "true" : "false");
    }
}
