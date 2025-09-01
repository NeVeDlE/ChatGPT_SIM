// components/chat-window.js
import { getUser } from "../services/storage";
import { marked } from "marked";

marked.setOptions({ mangle: false, headerIds: false, breaks: true });

export class ChatWindow {
    #chatBox;
    #onAction = null;
    #variantGroups = new Map();
    #byId = new Map();
    #currentAssistant = null;
    #pinnedLeafId = null;

    constructor(selector = "#chat") {
        this.#chatBox = document.querySelector(selector);
        if (!this.#chatBox) throw new Error("ChatWindow: #chat not found");

        // one delegated handler for all actions
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

            // If we clicked on a visible assistant article, treat it as the pivot
            if (article.classList.contains("assistant") && !article.classList.contains("variant-hidden")) {
                this.setCurrentAssistant(article);
                this.#emitAction({ action: "set-pivot", id: article.dataset.id, role: "assistant", article });
            }

            // Inline edit UI inside ChatWindow; rest is delegated
            if (action === "edit" && role === "user") {
                this.#enterEditMode(article);
                return;
            }
            if (action === "edit-save" && role === "user") {
                const newText = contentEl.innerText.trim();
                this.#exitEditMode(article);
                contentEl.innerHTML = marked.parse(newText || "");
                this.#emitAction({ action: "edit-save", id, role, article, contentEl, text: newText, button: btn });
                return;
            }
            if (action === "edit-cancel" && role === "user") {
                const current = contentEl.innerText;
                this.#exitEditMode(article);
                contentEl.innerHTML = marked.parse(current || "");
                this.#emitAction({
                    action: "edit-cancel",
                    id,
                    role,
                    article,
                    contentEl,
                    text: current.trim(),
                    button: btn,
                });
                return;
            }
            if (action === "regenerate" && role === "assistant") {
                this.#emitAction({ action: "regenerate", id, role, article, contentEl, text, button: btn });
            }

            this.#emitAction({ action, id, role, article, contentEl, text, button: btn });
        });

        // decorate any static messages already in DOM
        this.#decorateExisting();
    }

    // ---- branch pinning (keep visible path on a chosen leaf) ----
    pinPathTo(leafId) {
        this.#pinnedLeafId = leafId ? String(leafId) : null;
    }

    #applyPinnedPath(leafId) {
        let child = this.#byId.get(String(leafId));
        while (child) {
            const childId = child.dataset.id;
            const parentId = child.dataset.parentId;
            if (!parentId || parentId === "null") break;
            const childRole = child.classList.contains("assistant") ? "assistant" : "user";
            const key = `${parentId}|${childRole}`;
            const g = this.#variantGroups.get(key);
            if (g) {
                const idx = g.articles.findIndex((el) => el.dataset.id === childId);
                if (idx !== -1) g.active = idx;
            }
            child = this.#byId.get(String(parentId));
        }
    }

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

    markTailAsCurrent() {
        const id = this.getLastVisibleAssistantId();
        if (!id) return;
        const el = this.#chatBox.querySelector(`article.msg.assistant[data-id="${id}"]`);
        if (el) this.setCurrentAssistant(el);
    }

    onAction(cb) {
        this.#onAction = cb;
    }

    clear() {
        this.#chatBox.innerHTML = "";
    }

    renderMessages(messages) {
        this.clear();
        messages.forEach((m) => this.renderMessage(m));
        this.decorateVariantGroups();
        this.scrollToBottom(false);
    }

    decorateVariantGroups() {
        const box = this.#chatBox;
        this.#variantGroups.clear();
        this.#byId.clear();

        const articles = box.querySelectorAll("article.msg");
        const groupMap = new Map(); // `${parentId}|${role}` -> [articles]

        articles.forEach((el) => {
            const id = el.dataset.id;
            if (id) this.#byId.set(id, el);
            const role = el.classList.contains("assistant") ? "assistant" : "user";
            const pid = el.dataset.parentId ?? "root";
            const key = `${pid}|${role}`;
            if (!groupMap.has(key)) groupMap.set(key, []);
            groupMap.get(key).push(el);
        });

        for (const [key, list] of groupMap.entries()) {
            const total = list.length;
            if (!total) continue;

            // default to last in each group
            let active = total - 1;

            // honor previous active (by id) if still present
            const prev = this.#variantGroups.get(key);
            if (prev && prev.articles?.length) {
                const prevId = prev.articles[prev.active]?.dataset?.id;
                const idx = prevId ? list.findIndex((el) => el.dataset.id === prevId) : -1;
                if (idx !== -1) active = idx;
            }

            list.forEach((el, i) => {
                const serverActive = el.dataset.variantActive === "1";
                el.dataset.variantGroup = key;
                el.dataset.variantIndex = String(i + 1);
                el.dataset.variantTotal = String(total);
                if (serverActive) active = i;
                if (el.classList.contains("is-current")) active = i;
            });

            this.#variantGroups.set(key, { articles: list, active });
        }

        // If a path is pinned, force the groups on that path to point to the pinned leaf
        if (this.#pinnedLeafId) this.#applyPinnedPath(this.#pinnedLeafId);

        this.#rebuildLinearPath();
    }

    #rebuildLinearPath() {
        const box = this.#chatBox;

        // hide everything first
        box.querySelectorAll("article.msg").forEach((el) => el.classList.add("variant-hidden"));

        // root user nodes (parentId null)
        const roots = Array.from(box.querySelectorAll("article.msg.user")).filter(
            (el) => !el.dataset.parentId || el.dataset.parentId === "null"
        );

        // show a linear path from each root
        roots.forEach((root) => this.#showPathFrom(root));

        // add variant nav on visible articles that have variants > 1
        for (const [, group] of this.#variantGroups) {
            const { articles, active } = group;
            if (articles.length <= 1) continue;
            const activeEl = articles[active];
            if (!activeEl || activeEl.classList.contains("variant-hidden")) continue;
            this.#attachVariantNav(activeEl, active, articles.length);
        }
        this.scrollToBottom(false);
    }

    #showPathFrom(node) {
        if (!node) return;
        node.classList.remove("variant-hidden");

        const currentRole = node.classList.contains("assistant") ? "assistant" : "user";
        const childRole = currentRole === "assistant" ? "user" : "assistant";

        const next = this.#pickActiveChild(node.dataset.id, childRole);
        if (next) this.#showPathFrom(next);
    }

    #pickActiveChild(parentId, childRole) {
        if (!parentId) return null;
        const key = `${parentId}|${childRole}`;
        const group = this.#variantGroups.get(key);
        if (!group) return null;
        const { articles, active } = group;
        return articles[active] ?? null;
    }

    #attachVariantNav(article, idx, total) {
        const actions = article.querySelector(".msg-actions");
        if (!actions) return;

        // remove any existing nav in this specific actions row (avoid duplicates)
        actions.querySelectorAll(".variant-nav").forEach((n) => n.remove());

        const nav = document.createElement("div");
        nav.className = "variant-nav";
        nav.innerHTML = `
      <button class="variant-btn" data-action="variant-prev" title="Previous" aria-label="Previous">
        ${this.#icLeft()}
      </button>
      <span class="variant-count" data-variant-counter>${idx + 1}/${total}</span>
      <button class="variant-btn" data-action="variant-next" title="Next" aria-label="Next">
        ${this.#icRight()}
      </button>
    `;
        actions.prepend(nav);
    }

    switchVariantByArticle(article, step) {
        if (!article) return null;
        const key = article.dataset.variantGroup;
        if (!key || !this.#variantGroups.has(key)) return article;

        const group = this.#variantGroups.get(key);
        const total = group.articles.length;
        let idx = group.active;
        idx = (idx + step + total) % total;
        group.active = idx;
        this.#variantGroups.set(key, group);

        const newActive = group.articles[idx];
        if (newActive) {
            this.setCurrentAssistant(newActive);
            this.pinPathTo(newActive.dataset.id);
        }

        // Rebuild the visible linear path according to new choice
        this.#rebuildLinearPath();

        // Return the new active article in this group (handy so Chat can set the pivot)
        return group.articles[idx];
    }

    getLastVisibleAssistantId() {
        const vis = this.#chatBox.querySelectorAll("article.msg.assistant:not(.variant-hidden)");
        if (!vis.length) return null;
        return vis[vis.length - 1].dataset.id || null;
    }

    renderMessage(message) {
        const role = message.role ?? "user";
        const article = this.#article(role);
        const avatar = this.#avatar(role);
        const bubble = this.#bubble(role);
        const meta = this.#meta();
        const roleEl = this.#roleSpan(role);
        const content = this.#content(message.content?.[0]?.value || "");

        const pid = message.parent_id ?? null;
        article.dataset.parentId = pid === null ? "null" : String(pid);
        article.dataset.id = message.id;
        article.dataset.variantIndex = message.variant_index ?? "";
        article.dataset.variantTotal = message.variant_total ?? "";
        article.dataset.variantActive = message.is_active_variant ?? 0;

        meta.appendChild(roleEl);
        bubble.append(meta, content);

        const actions = this.#actions(role);
        const stack = document.createElement("div");
        stack.className = "msg-stack";
        stack.append(bubble, actions);

        if (role === "assistant") article.append(avatar, stack);
        else article.append(stack, avatar);

        this.#chatBox.appendChild(article);
        this.scrollToBottom(false);
        return article;
    }

    startAssistantSkeleton({ id }) {
        const article = this.renderMessage({ id, role: "assistant", content: [{ value: "" }] });
        const bubble = article.querySelector(".bubble");
        const contentEl = article.querySelector(".content");
        bubble.classList.add("streaming");

        const cursorEl = document.createElement("span");
        cursorEl.className = "cursor";
        const typingEl = document.createElement("div");
        typingEl.className = "typing";
        typingEl.innerHTML = "<span></span><span></span><span></span>";
        bubble.append(cursorEl, typingEl);

        // immediately treat this as current & pin to its branch
        this.setCurrentAssistant(article);
        this.pinPathTo(id);

        return {
            setMarkdown: (md) => (contentEl.innerHTML = marked.parse(md || "")),
            finish: () => {
                cursorEl.remove();
                typingEl.remove();
                bubble.classList.remove("streaming");
            },
            elements: { article, bubble, contentEl },
        };
    }

    scrollToBottom(smooth = true) {
        const box = this.#chatBox;
        const doScroll = () => box.scrollTo({ top: box.scrollHeight, behavior: smooth ? "smooth" : "auto" });
        requestAnimationFrame(() => {
            doScroll();
            setTimeout(doScroll, 0);
        });
    }

    // ---------- actions + edit mode ----------
    #actions(role) {
        const bar = document.createElement("div");
        bar.className = "msg-actions";
        if (role === "assistant") {
            bar.innerHTML = `
        <button class="msg-action" data-action="copy" title="Copy" data-tip="Copy" aria-label="Copy message">
          ${this.#icCopy()}
        </button>
        <button class="msg-action" data-action="regenerate" title="Regenerate" data-tip="Regenerate" aria-label="Regenerate response">
          ${this.#icRefresh()}
        </button>
        <button class="msg-action" data-action="read" title="Read aloud" data-tip="Read aloud" aria-label="Read aloud">
          ${this.#icSpeaker()}
        </button>
      `;
        } else {
            bar.innerHTML = `
        <button class="msg-action" data-action="edit" title="Edit" data-tip="Edit" aria-label="Edit message">
          ${this.#icPencil()}
        </button>
        <button class="msg-action" data-action="copy" title="Copy" data-tip="Copy" aria-label="Copy message">
          ${this.#icCopy()}
        </button>
      `;
        }
        return bar;
    }

    #enterEditMode(article) {
        article.setAttribute("data-editing", "1");
        const contentEl = article.querySelector(".content");
        const actions = article.querySelector(".msg-actions");
        if (!contentEl || !actions) return;
        contentEl.setAttribute("contenteditable", "true");
        contentEl.focus();
        actions.innerHTML = `
      <button class="msg-action" data-action="edit-save" title="Save" data-tip="Save" aria-label="Save edit">
        ${this.#icCheck()}
      </button>
      <button class="msg-action" data-action="edit-cancel" title="Cancel" data-tip="Cancel" aria-label="Cancel edit">
        ${this.#icX()}
      </button>
    `;
    }

    #exitEditMode(article) {
        const contentEl = article.querySelector(".content");
        if (contentEl) contentEl.removeAttribute("contenteditable");
        article.removeAttribute("data-editing");
        const actions = article.querySelector(".msg-actions");
        if (actions) actions.replaceWith(this.#actions("user"));
    }

    #decorateExisting() {
        this.#chatBox.querySelectorAll("article.msg").forEach((article) => {
            if (article.querySelector(".msg-actions")) return;
            const role = article.classList.contains("user") ? "user" : "assistant";
            const bubble = article.querySelector(".bubble");
            if (!bubble) return;
            const actions = this.#actions(role);
            bubble.parentElement.appendChild(actions);
        });
    }

    // ---------- DOM factories ----------
    #article(role) {
        const el = document.createElement("article");
        el.className = `msg ${role === "user" ? "user" : "assistant"}`;
        return el;
    }

    #avatar(role) {
        const img = document.createElement("img");
        img.className = "avatar";
        const u = (typeof getUser === "function" ? getUser() : {}) || {};
        img.src = role !== "assistant" && u.avatar_url?.length ? u.avatar_url : "https://placehold.co/40x40";
        return img;
    }

    #bubble(role) {
        const div = document.createElement("div");
        div.className = `bubble ${role === "assistant" ? "assistant" : "user"}`;
        return div;
    }

    #meta() {
        const div = document.createElement("div");
        div.className = "meta";
        return div;
    }

    #roleSpan(role) {
        const span = document.createElement("span");
        span.className = "role";
        const u = (typeof getUser === "function" ? getUser() : {}) || {};
        span.innerHTML = role === "assistant" ? "Assistant" : (u.name || "You");
        return span;
    }

    #content(text) {
        const div = document.createElement("div");
        div.className = "content";
        div.innerHTML = marked.parse(text || "");
        return div;
    }

    // ---------- inline SVG icons (currentColor) ----------
    #icCopy() {
        return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H8a2 2 0 0 0-2 2v2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2h1a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2Zm0 2v10H9a2 2 0 0 0-2 2v2H5V7h9V3ZM9 15h7v2H9v-2Z"/></svg>
    `;
    }

    #icRefresh() {
        return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66L16 8h5V3l-1.76 1.76A10 10 0 1 0 22 12h-2Z"/></svg>
    `;
    }

    #icSpeaker() {
        return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm8.54 1.46-1.41 1.41A6 6 0 0 1 19 12c0 1.66-.67 3.16-1.87 4.24l1.41 1.41A8 8 0 0 0 21 12c0-2.21-.9-4.21-2.46-5.54ZM15.36 8.64 14 10a2 2 0 0 1 0 4l1.36 1.36A4 4 0 0 0 17 12a4 4 0 0 0-1.64-3.36Z"/></svg>
    `;
    }

    #icPencil() {
        return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>
    `;
    }

    #icCheck() {
        return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 16.2-3.5-3.5L4 14.2l5 5 12-12-1.5-1.5L9 16.2Z"/></svg>
    `;
    }

    #icX() {
        return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 13.41l-6.29 6.3-1.42-1.42L10.59 12 4.29 5.71 5.7 4.29 12 10.59l6.29-6.3 1.41 1.42Z"/></svg>
    `;
    }

    #emitAction(detail) {
        this.#onAction?.(detail);
        this.#chatBox.dispatchEvent(new CustomEvent("chat:action", { detail, bubbles: true }));
    }

    // tiny arrow icons
    #icLeft() {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 19 8.5 12l7-7"/></svg>`;
    }
    #icRight() {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 5 7 7-7 7"/></svg>`;
    }
}
