import {authGet} from "../services/api";
import {getUser} from "../services/storage";
import {showError} from "../utils/dom";
import {marked} from "marked";

export class ChatWindow {
    #messages;

    constructor() {

    }

    loadConversation(conversationId) {
        this.fetchConversationMessages(conversationId);
    }

    async fetchConversationMessages(conversationId) {
        try {
            const {ok, data} = await authGet(`/chats/${conversationId}/messages`);

            if (!ok || data.status === 'error') {
                return showError(data.message || 'Fetching Conversations Failed.');
            }
            this.#messages = data;
            this.renderMessagesHtml(data.data);

        } catch (error) {
            console.error("Error fetching Messages:", error);
        }

    }

    renderMessagesHtml(messages) {
        const chatBox = document.getElementById('chat');
        chatBox.innerHTML = ""; // clear previous

        messages.forEach((message) => {
            const role = message.role ?? 'user';

            const article = this.renderArticleHTML(role);
            const avatar = this.renderAvatarHTML(role);
            const bubble = this.renderBubbleHtml(role);
            const meta = this.renderMetaHTML();
            const span = this.renderSpanHTML(role);
            const content = this.renderContentHtml(message.content[0].value);

            meta.appendChild(span);
            bubble.appendChild(meta);
            bubble.appendChild(content);

            if (role === "assistant") {
                // Assistant → avatar left, bubble right
                article.appendChild(avatar);
                article.appendChild(bubble);
            } else {
                // User → bubble left, avatar right
                article.appendChild(bubble);
                article.appendChild(avatar);
            }

            chatBox.appendChild(article);
        });
        chatBox.scrollTo({
            top: chatBox.scrollHeight,
            behavior: "smooth"
        });
    }

    renderArticleHTML(role) {
        const article = document.createElement('article');
        article.className = `msg ${role === "user" ? "user" : ""}`;
        return article;
    }

    renderAvatarHTML(role) {
        const avatar = document.createElement('img');
        avatar.className = 'avatar';

        if (role !== 'assistant' && getUser().avatar_url.length > 0)
            avatar.src = getUser().avatar_url;
        else avatar.src = 'https://placehold.co/40x40';
        //  avatar.aria.hidden = true;
        return avatar;
    }

    renderBubbleHtml(role) {
        const bubble = document.createElement('div');
        bubble.className = `bubble ${role === 'assistant' ? 'assistant' : 'user'}`;
        return bubble;
    }

    renderMetaHTML() {
        const meta = document.createElement('div');
        meta.className = 'meta';
        return meta;
    }

    renderSpanHTML(role) {
        const span = document.createElement('span');
        span.className = 'role';
        span.innerHTML = role === "assistant" ? 'Assistant' : getUser().name;
        return span;
    }

    renderContentHtml(message) {
        const content = document.createElement('div');
        content.className = 'content';
        content.innerHTML = marked.parse(message);
        return content;
    }
    
}