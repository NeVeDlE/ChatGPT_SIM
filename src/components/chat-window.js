// components/chat-window.js
import { getUser } from "../services/storage";
import { marked } from "marked";

marked.setOptions({ mangle: false, headerIds: false, breaks: true });

export class ChatWindow {
    #chatBox;
    #onAction = null;

    constructor(selector = "#chat") {
        this.#chatBox = document.querySelector(selector);
        if (!this.#chatBox) throw new Error("ChatWindow: #chat not found");

        // one delegated handler for all actions
        this.#chatBox.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            const article = btn.closest("article.msg");
            if (!article) return;

            const id   = article.dataset.id || null;
            const role = article.classList.contains("user") ? "user" : "assistant";
            const contentEl = article.querySelector(".content");
            const text = contentEl ? contentEl.innerText.trim() : "";
            const action = btn.dataset.action;

            // Inline edit UI inside ChatWindow; rest is delegated
            if (action === "edit" && role === "user") { this.#enterEditMode(article); return; }
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
                this.#emitAction({ action: "edit-cancel", id, role, article, contentEl, text: current.trim(), button: btn });
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

    onAction(cb) { this.#onAction = cb; }

    clear() { this.#chatBox.innerHTML = ""; }

    renderMessages(messages) {
        this.clear();
        messages.forEach((m) => this.renderMessage(m));
        this.scrollToBottom(false);
    }

    renderMessage(message) {
        const role = message.role ?? "user";
        const article = this.#article(role);
        const avatar  = this.#avatar(role);
        const bubble  = this.#bubble(role);
        const meta    = this.#meta();
        const roleEl  = this.#roleSpan(role);
        const content = this.#content(message.content?.[0]?.value || "");

        article.dataset.id = message.id;
        meta.appendChild(roleEl);
        bubble.append(meta, content);

        const actions = this.#actions(role);
        const stack = document.createElement("div");
        stack.append(bubble, actions);

        if (role === "assistant") article.append(avatar, stack);
        else article.append(stack, avatar);

        this.#chatBox.appendChild(article);
        this.scrollToBottom(false);
        return article;
    }

    startAssistantSkeleton({ id }) {
        const article = this.renderMessage({ id, role: "assistant", content: [{ value: "" }] });
        const bubble    = article.querySelector(".bubble");
        const contentEl = article.querySelector(".content");
        bubble.classList.add("streaming");

        const cursorEl = document.createElement("span"); cursorEl.className = "cursor";
        const typingEl = document.createElement("div");  typingEl.className  = "typing";
        typingEl.innerHTML = "<span></span><span></span><span></span>";
        bubble.append(cursorEl, typingEl);

        return {
            setMarkdown: (md) => (contentEl.innerHTML = marked.parse(md || "")),
            finish: () => { cursorEl.remove(); typingEl.remove(); bubble.classList.remove("streaming"); },
            elements: { article, bubble, contentEl },
        };
    }

    scrollToBottom(smooth = true) {
        this.#chatBox.scrollTo({ top: this.#chatBox.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    }
    scrollingToBottom(){ this.scrollToBottom(); }

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
    #article(role){ const el=document.createElement("article"); el.className=`msg ${role==="user"?"user":""}`; return el; }
    #avatar(role){
        const img=document.createElement("img"); img.className="avatar";
        const u=(typeof getUser==="function"?getUser():{})||{};
        img.src = role!=="assistant" && u.avatar_url?.length ? u.avatar_url : "https://placehold.co/40x40";
        return img;
    }
    #bubble(role){ const div=document.createElement("div"); div.className=`bubble ${role==="assistant"?"assistant":"user"}`; return div; }
    #meta(){ const div=document.createElement("div"); div.className="meta"; return div; }
    #roleSpan(role){
        const span=document.createElement("span"); span.className="role";
        const u=(typeof getUser==="function"?getUser():{})||{};
        span.innerHTML = role==="assistant" ? "Assistant" : (u.name||"You"); return span;
    }
    #content(text){ const div=document.createElement("div"); div.className="content"; div.innerHTML = marked.parse(text||""); return div; }

    // ---------- inline SVG icons (currentColor) ----------
    #icCopy(){ return `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H8a2 2 0 0 0-2 2v2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2h1a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2Zm0 2v10H9a2 2 0 0 0-2 2v2H5V7h9V3ZM9 15h7v2H9v-2Z"/></svg>
  `;}
    #icRefresh(){ return `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66L16 8h5V3l-1.76 1.76A10 10 0 1 0 22 12h-2Z"/></svg>
  `;}
    #icSpeaker(){ return `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm8.54 1.46-1.41 1.41A6 6 0 0 1 19 12c0 1.66-.67 3.16-1.87 4.24l1.41 1.41A8 8 0 0 0 21 12c0-2.21-.9-4.21-2.46-5.54ZM15.36 8.64 14 10a2 2 0 0 1 0 4l1.36 1.36A4 4 0 0 0 17 12a4 4 0 0 0-1.64-3.36Z"/></svg>
  `;}
    #icPencil(){ return `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>
  `;}
    #icCheck(){ return `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 16.2-3.5-3.5L4 14.2l5 5 12-12-1.5-1.5L9 16.2Z"/></svg>
  `;}
    #icX(){ return `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 13.41l-6.29 6.3-1.42-1.42L10.59 12 4.29 5.71 5.7 4.29 12 10.59l6.29-6.3 1.41 1.42Z"/></svg>
  `;}

    #emitAction(detail){ this.#onAction?.(detail); this.#chatBox.dispatchEvent(new CustomEvent("chat:action",{detail,bubbles:true})); }
}
