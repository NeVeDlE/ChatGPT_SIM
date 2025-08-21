import {createStream} from "../services/api";
import {ChatWindow} from "./chat-window";

export class ChatInput {
    #onMessageSubmit;

    constructor() {
        // this.addFormEventListner();
    }

    addFormEventListner() {
        const form = document.getElementById("chat-form");
        if (!form) {
            console.error("❌ chat-form not found");
            return;
        }

        form.addEventListener("submit", (e) => this.handleFormSubmit(e));
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        const input = document.getElementById("message");
        const message = input.value.trim();
        if (!message) return;

        input.value = "";

        let answer = "";

        await createStream(`/chats/2/generate/stream?prompt=${encodeURIComponent(message)}&temperature=1`, {
            onOpen: () => console.log("🔗 Stream connected"),
            onMessage: (msg) => {


                if (msg.type === "init") {
                    console.log("📨", msg.type);
                    if (this.#onMessageSubmit) {
                        new ChatWindow().renderMessageHTML({
                            id: msg.user_message_id,
                            role: "user",
                            content: [{value: message}],
                        });
                    }

                 /*   if (this.#onMessageSubmit) {
                        this.#onMessageSubmit({
                            id: msg.user_message_id,
                            role: "user",
                            content: [{value: message}],
                        });
                    }*/
                }

                answer += msg.data;
            },
            onError: (err) => console.error("❌ Stream error:", err),
        });
    }

    onMessageSubmit(callback) {
        console.log(callback)
        this.#onMessageSubmit = callback;
    }


}