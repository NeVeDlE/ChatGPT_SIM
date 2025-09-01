// components/chat-window.js
import { marked } from "marked";
import { VariantGraph } from "./variant-graph.js";
import { InlineEditor } from "./inline-editor.js";
import { Icons } from "./icons.js";
import { Message } from "./message.js";

marked.setOptions({ mangle: false, headerIds: false, breaks: true });

export class Window {
    #chatBox;
    #onAction = null;
    #graph = new VariantGraph();
    #byId = new Map();
    #currentAssistant = null;

    constructor(selector = "#chat") {
        this.#chatBox = document.querySelector(selector);
        if (!this.#chatBox) throw new Error("ChatWindow: #chat not found");

        // Inline editor (uses Message.actions to restore toolbar)
        this.editor = new InlineEditor({ renderActions: (role) => Message.actions(role) });

        // delegate ALL clicks
        this.#chatBox.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            const article = btn.closest("article.msg");
            if (!article) return;

            const id = article.dataset.id || null;
            const role = article.classList.contains("user") ? "user" : "assistant";
            const contentEl = article.querySelector(".content");
            const text = contentEl ? contentEl.innerText.trim() : "";
            const action = btn.dataset.action;

            if (article.classList.contains("assistant") && !article.classList.contains("variant-hidden")) {
                this.setCurrentAssistant(article);
                this.#emitAction({ action: "set-pivot", id: article.dataset.id, role: "assistant", article });
            }

            if (action === "edit" && role === "user") { this.editor.enter(article); return; }
            if (action === "edit-save" && role === "user") {
                const newText = contentEl.innerText.trim();
                this.editor.exit(article, { restoreActionsForRole: "user", keepHtml: newText });
                this.#emitAction({ action: "edit-save", id, role, article, contentEl, text: newText, button: btn });
                return;
            }
            if (action === "edit-cancel" && role === "user") {
                const current = contentEl.innerText;
                this.editor.exit(article, { restoreActionsForRole: "user", keepHtml: current.trim() });
                this.#emitAction({ action: "edit-cancel", id, role, article, contentEl, text: current.trim(), button: btn });
                return;
            }
            if (action === "regenerate" && role === "assistant") {
                this.#emitAction({ action: "regenerate", id, role, article, contentEl, text, button: btn });
                return;
            }

            this.#emitAction({ action, id, role, article, contentEl, text, button: btn });
        });

        this.#decorateExisting();
    }

    // ---- public API ----
    onAction(cb) { this.#onAction = cb; }
    pinPathTo(leafId) { this.#graph.setPinnedLeaf(leafId); }
    clear() { this.#chatBox.innerHTML = ""; }

    setCurrentAssistant(article) {
        if (!article) return;
        this.#chatBox.querySelectorAll("article.msg.assistant.is-current").forEach((el) => el.classList.remove("is-current"));
        article.classList.add("is-current");
        this.#currentAssistant = article;
    }

    getCurrentAssistantId() {
        const el = this.#chatBox.querySelector("article.msg.assistant.is-current:not(.variant-hidden)");
        return el?.dataset?.id || null;
    }

    getLastVisibleAssistantId() {
        const vis = this.#chatBox.querySelectorAll("article.msg.assistant:not(.variant-hidden)");
        if (!vis.length) return null;
        return vis[vis.length - 1].dataset.id || null;
    }

    renderMessages(messages) {
        this.clear();
        messages.forEach((m) => this.renderMessage(m));
        this.decorateVariantGroups();
        this.scrollToBottom(false);
    }

    renderMessage(message) {
        const el = Message.create(message);
        this.#chatBox.appendChild(el);
        this.scrollToBottom(false);
        return el;
    }

    startAssistantSkeleton({ id }) {
        const sk = Message.skeleton({ id });
        this.#chatBox.appendChild(sk.elements.article);

        // immediately treat this as current & pin to its branch
        this.setCurrentAssistant(sk.elements.article);
        this.pinPathTo(id);

        return sk;
    }

    scrollToBottom(smooth = true) {
        const box = this.#chatBox;
        const doScroll = () => box.scrollTo({ top: box.scrollHeight, behavior: smooth ? "smooth" : "auto" });
        requestAnimationFrame(() => {
            doScroll();
            setTimeout(doScroll, 0);
        });
    }

    rebindId(oldId, newId) {
        if (!oldId || !newId) return;
        const el = this.#chatBox.querySelector(`article.msg[data-id="${oldId}"]`);
        if (!el) return;
        el.dataset.id = String(newId);
    }

    // ---- variants / grouping ----
    decorateVariantGroups() {
        const articles = this.#chatBox.querySelectorAll("article.msg");
        this.#graph.build(articles);

        // optional mirror lookup
        this.#byId.clear();
        for (const el of articles) {
            const id = el.dataset.id;
            if (id) this.#byId.set(id, el);
        }

        // dataset attrs for nav
        for (const [key, group] of this.#graph.groups.entries()) {
            const total = group.articles.length;
            group.articles.forEach((el, i) => {
                el.dataset.variantGroup = key;
                el.dataset.variantIndex = String(i + 1);
                el.dataset.variantTotal = String(total);
            });
        }

        this.#rebuildLinearPath();
    }

    switchVariantByArticle(article, step) {
        const newActive = this.#graph.switchVariantByArticle(article, step);
        if (newActive) {
            this.setCurrentAssistant(newActive);
            this.pinPathTo(newActive.dataset.id);
        }
        this.#rebuildLinearPath();
        return newActive;
    }

    // ---- internals ----
    #rebuildLinearPath() {
        const box = this.#chatBox;

        box.querySelectorAll("article.msg").forEach((el) => el.classList.add("variant-hidden"));

        // roots: user nodes with parentId null
        const roots = Array.from(box.querySelectorAll("article.msg.user"))
            .filter((el) => !el.dataset.parentId || el.dataset.parentId === "null");

        // active root
        const rootGroup = this.#graph.getGroup("root|user");
        const rootsToShow = (rootGroup && rootGroup.articles?.length)
            ? [rootGroup.articles[rootGroup.active]]
            : (roots.length ? [roots[roots.length - 1]] : []);

        rootsToShow.forEach((root) => this.#showPathFrom(root));

        // attach variant nav on visible articles that have variants > 1
        for (const [, group] of this.#graph.groups) {
            if (group.articles.length <= 1) continue;
            const activeEl = group.articles[group.active];
            if (!activeEl || activeEl.classList.contains("variant-hidden")) continue;
            this.#attachVariantNav(activeEl, group.active, group.articles.length);
        }

        this.scrollToBottom(false);
    }

    #showPathFrom(node) {
        if (!node) return;
        node.classList.remove("variant-hidden");

        const currentRole = node.classList.contains("assistant") ? "assistant" : "user";
        const childRole = currentRole === "assistant" ? "user" : "assistant";

        const next = this.#graph.getActiveChild(node.dataset.id, childRole);
        if (next) this.#showPathFrom(next);
    }

    #attachVariantNav(article, idx, total) {
        const actions = article.querySelector(".msg-actions");
        if (!actions) return;

        actions.querySelectorAll(".variant-nav").forEach((n) => n.remove());

        const nav = document.createElement("div");
        nav.className = "variant-nav";
        nav.innerHTML = `
      <button class="variant-btn" data-action="variant-prev" title="Previous" aria-label="Previous">
        ${Icons.left()}
      </button>
      <span class="variant-count" data-variant-counter>${idx + 1}/${total}</span>
      <button class="variant-btn" data-action="variant-next" title="Next" aria-label="Next">
        ${Icons.right()}
      </button>
    `;
        actions.prepend(nav);
    }

    #decorateExisting() {
        this.#chatBox.querySelectorAll("article.msg").forEach((article) => {
            if (article.querySelector(".msg-actions")) return;
            const role = article.classList.contains("user") ? "user" : "assistant";
            const bubble = article.querySelector(".bubble");
            if (!bubble) return;
            const actions = Message.actions(role);
            bubble.parentElement.appendChild(actions);
        });
    }

    #emitAction(detail) {
        this.#onAction?.(detail);
        this.#chatBox.dispatchEvent(new CustomEvent("chat:action", { detail, bubbles: true }));
    }
}
