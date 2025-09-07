import {authPost, authPostBlob, post} from "../../services/api";
import {saveUserData} from "../../services/storage";
import {showError} from "../../utils/dom";
import {TextToSpeech} from "./text-to-speech";

/**
 * Central router for message actions coming from ChatWindow.
 * Keeps Chat thin and makes actions reusable/extensible.
 */
export class ActionController {
    #window;
    #setActivePivotId;
    #regen;
    #editor;
    #handlers = new Map();

    #tts;            // <-- add
    #activeReadBtn = null;

    constructor({window, setActivePivotId, regen, editor}) {
        this.#window = window;
        this.#setActivePivotId = setActivePivotId;
        this.#regen = regen;
        this.#editor = editor;

        this.#tts = new TextToSpeech({
            endpoint: "/tts",
            defaultVoice: "Atlas-PlayAI",
            playingClass: "is-playing",

        });

        // built-ins
        this.register("set-pivot", this.#setPivot);
        this.register("variant-prev", this.#variantPrev);
        this.register("variant-next", this.#variantNext);
        this.register("regenerate", this.#regenerate);
        this.register("copy", this.#copy);
        this.register("edit-save", this.#editSave);
        this.register("read", this.#read);
    }

    /** Public: register/override an action at runtime */
    register(action, fn) {
        this.#handlers.set(action, fn.bind(this));
    }


    /** Public: the single entry point Chat will call */
    async handle({action, role, article, text, button}) {
        const fn = this.#handlers.get(action);
        if (!fn) return; // silently ignore unknown actions
        await fn({role, article, text, button});
    }

    // ---------- built-in handlers ----------

    #setPivot({article}) {
        const id = article?.dataset?.id ? Number(article.dataset.id) : null;
        this.#setActivePivotId(id);
    }

    // ---- actions ----

    async #read({ text, button }) {
        await this.#tts.toggle({ text, button }); // use #tts here too
    }

    #variantPrev({article}) {
        const nextArt = this.#window.switchVariantByArticle(article, -1);
        const newPivot = Number(this.#window.getLastVisibleAssistantId() || nextArt?.dataset?.id);
        if (!Number.isNaN(newPivot)) this.#setActivePivotId(newPivot);
        this.#window.scrollToBottom();
    }

    #variantNext({article}) {
        const nextArt = this.#window.switchVariantByArticle(article, +1);
        const newPivot = Number(this.#window.getLastVisibleAssistantId() || nextArt?.dataset?.id);
        if (!Number.isNaN(newPivot)) this.#setActivePivotId(newPivot);
        this.#window.scrollToBottom();
    }

    #regenerate({role, article, button}) {
        if (role !== "assistant") return;
        this.#regen.regenerate(article, button);
    }

    async #copy({text}) {
        try {
            await navigator.clipboard.writeText(text || "");
        } catch (e) {
            console.error("Copy failed:", e);
        }
    }

    #editSave({role, article, text}) {
        if (role !== "user") return;
        this.#editor.save(article, text);
    }

}
