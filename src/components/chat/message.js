// components/window/message.js
import { marked } from "marked";
import { getUser } from "../../services/storage.js";
import { Icons } from "./icons.js";

marked.setOptions({ mangle: false, headerIds: false, breaks: true });

/**
 * Message: renders a chat message node and the streaming skeleton.
 * - Pure DOM creation (no side effects outside the returned element)
 * - Centralizes actions toolbar & content rendering
 */
export class Message {
    /**
     * Create a message <article> element.
     * @param {Object} message - shape similar to your API messages
     *   { id, role: 'user'|'assistant', content: [{value:string}], parent_id, variant_index, variant_total, is_active_variant }
     * @returns {HTMLElement} <article.msg ...>
     */
    static create(message) {
        const role = message.role ?? "user";
        const article = this.#article(role);
        const avatar = this.#avatar(role);
        const bubble = this.#bubble(role);
        const meta = this.#meta();
        const roleEl = this.#roleSpan(role);
        const contentText = message.content?.[0]?.value || "";
        const contentEl = this.#content(contentText);

        const pid = message.parent_id ?? null;
        article.dataset.parentId = (pid === null) ? "null" : String(pid);
        article.dataset.id = message.id;
        article.dataset.variantIndex = message.variant_index ?? "";
        article.dataset.variantTotal = message.variant_total ?? "";
        article.dataset.variantActive = message.is_active_variant ?? 0;

        meta.appendChild(roleEl);
        bubble.append(meta, contentEl);

        const actions = this.actions(role);
        const stack = document.createElement("div");
        stack.className = "msg-stack";
        stack.append(bubble, actions);

        if (role === "assistant") article.append(avatar, stack);
        else article.append(stack, avatar);

        return article;
    }

    /**
     * Build an assistant streaming skeleton. Returns control methods.
     * @param {{id: string|number}} param0
     * @returns {{ setMarkdown: (md:string)=>void, finish: ()=>void, elements: {article, bubble, contentEl} }}
     */
    static skeleton({ id }) {
        const article = this.create({ id, role: "assistant", content: [{ value: "" }], parent_id: null });
        const bubble = article.querySelector(".bubble");
        const contentEl = article.querySelector(".content");

        bubble.classList.add("streaming");

        const cursorEl = document.createElement("span");
        cursorEl.className = "cursor";

        const typingEl = document.createElement("div");
        typingEl.className = "typing";
        typingEl.innerHTML = "<span></span><span></span><span></span>";

        bubble.append(cursorEl, typingEl);

        return {
            setMarkdown: (md) => { contentEl.innerHTML = marked.parse(md || ""); },
            finish: () => {
                try { cursorEl.remove(); } catch (e) {}
                try { typingEl.remove(); } catch (e) {}
                bubble.classList.remove("streaming");
            },
            elements: { article, bubble, contentEl },
        };
    }

    // ---------- public: actions toolbar (used by InlineEditor restore) ----------
    static actions(role) {
        const bar = document.createElement("div");
        bar.className = "msg-actions";
        if (role === "assistant") {
            bar.innerHTML = `
        <button class="msg-action" data-action="copy" title="Copy" data-tip="Copy" aria-label="Copy message">
          ${Icons.copy()}
        </button>
        <button class="msg-action" data-action="regenerate" title="Regenerate" data-tip="Regenerate" aria-label="Regenerate response">
          ${Icons.refresh()}
        </button>
        <button class="msg-action" data-action="read" title="Read aloud" data-tip="Read aloud" aria-label="Read aloud">
          ${Icons.speaker()}
        </button>
      `;
        } else {
            bar.innerHTML = `
        <button class="msg-action" data-action="edit" title="Edit" data-tip="Edit" aria-label="Edit message">
          ${Icons.pencil()}
        </button>
        <button class="msg-action" data-action="copy" title="Copy" data-tip="Copy" aria-label="Copy message">
          ${Icons.copy()}
        </button>
      `;
        }
        return bar;
    }

    // ---------- private DOM factories ----------
    static #article(role) {
        const el = document.createElement("article");
        el.className = `msg ${role === "user" ? "user" : "assistant"}`;
        return el;
    }

    static #avatar(role) {
        const img = document.createElement("img");
        img.className = "avatar";
        const u = (typeof getUser === "function" ? getUser() : {}) || {};
        img.src = role !== "assistant" && u.avatar_url?.length ? u.avatar_url : "https://placehold.co/40x40";
        return img;
    }

    static #bubble(role) {
        const div = document.createElement("div");
        div.className = `bubble ${role === "assistant" ? "assistant" : "user"}`;
        return div;
    }

    static #meta() {
        const div = document.createElement("div");
        div.className = "meta";
        return div;
    }

    static #roleSpan(role) {
        const span = document.createElement("span");
        span.className = "role";
        const u = (typeof getUser === "function" ? getUser() : {}) || {};
        span.innerHTML = role === "assistant" ? "Assistant" : (u.name || "You");
        return span;
    }

    static #content(text) {
        const div = document.createElement("div");
        div.className = "content";
        div.innerHTML = marked.parse(text || "");
        return div;
    }
}
