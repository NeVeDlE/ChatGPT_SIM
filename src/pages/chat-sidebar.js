import {authGet} from "../services/api";
import {showError} from "../utils/dom";

export class ChatSidebar {
    #conversations;

    constructor() {
        this.#conversations = document.querySelector("#recent-conversations");
        this.renderConversations();
    }

    async renderConversations() {
        try {
            const {ok, data} = await authGet('/chats');

            if (!ok || data.status === 'error') {
                return showError(data.message || 'Fetching Conversations Failed.');
            }

            this.renderConversationHTML(data.data);

        } catch (error) {
            console.error("Error fetching conversations:", error);
        }
    }

    renderConversationHTML(data) {
        data.forEach((conversation) => {
            const button = this.renderButtonHTML(conversation);

            const span = this.renderSpanHTML();

            button.prepend(span);

            this.#conversations.appendChild(button);
        })
    }

    renderButtonHTML(conversation) {
        const button = document.createElement("button");
        button.innerHTML = conversation.title;
        button.setAttribute("type", "button");
        button.className = "thread";
        return button;
    }

    renderSpanHTML() {
        const span = document.createElement("span");
        span.className = "dot";
        return span;
    }


}