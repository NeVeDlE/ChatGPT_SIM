// components/window/inline-editor.js
import { marked } from "marked";

export class InlineEditor {
    #renderActions; // (role: 'user' | 'assistant') => HTMLElement

    constructor({ renderActions }) {
        this.#renderActions = renderActions;
    }

    enter(article) {
        if (!article) return;
        article.setAttribute("data-editing", "1");
        const contentEl = article.querySelector(".content");
        const actions = article.querySelector(".msg-actions");
        if (!contentEl || !actions) return;
        contentEl.setAttribute("contenteditable", "true");
        contentEl.focus();
        actions.innerHTML = `
      <button class="msg-action" data-action="edit-save" title="Save" data-tip="Save" aria-label="Save edit">
        ${/* ✓ */ this.#icCheck()}
      </button>
      <button class="msg-action" data-action="edit-cancel" title="Cancel" data-tip="Cancel" aria-label="Cancel edit">
        ${/* ✕ */ this.#icX()}
      </button>
    `;
    }

    exit(article, { restoreActionsForRole = "user", keepHtml = null } = {}) {
        if (!article) return;
        const contentEl = article.querySelector(".content");
        if (contentEl) contentEl.removeAttribute("contenteditable");
        article.removeAttribute("data-editing");

        // restore actions bar
        const actions = article.querySelector(".msg-actions");
        if (actions) actions.replaceWith(this.#renderActions(restoreActionsForRole));

        // optionally overwrite HTML (used on save)
        if (keepHtml !== null && contentEl) {
            contentEl.innerHTML = marked.parse(keepHtml || "");
        }
    }

    // tiny inline icons for the editor buttons
    #icCheck() {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 16.2-3.5-3.5L4 14.2l5 5 12-12-1.5-1.5L9 16.2Z"/></svg>`;
    }
    #icX() {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 13.41l-6.29 6.3-1.42-1.42L10.59 12 4.29 5.71 5.7 4.29 12 10.59l6.29-6.3 1.41 1.42Z"/></svg>`;
    }
}
