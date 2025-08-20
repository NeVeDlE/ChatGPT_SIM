import {createStream} from "../services/api";

export class ChatInput {
    constructor(message) {
        document.getElementById("chat-form").addEventListener("submit", async function (e) {
            e.preventDefault();

            const input = document.getElementById("message");
            const message = input.value.trim();
            if (!message) return;

            input.value = ""; // clear input

            // Start streaming from backend
            await createStream(`/chats/2/generate/stream?prompt=${encodeURIComponent(message)}`, {
                onOpen: () => console.log("🔗 Stream connected"),
                onMessage: (msg) => {
                    console.log("📨", msg);

                    const chat = document.getElementById("chat");
                    const div = document.createElement("div");
                    div.textContent = typeof msg === "string" ? msg : JSON.stringify(msg);
                    chat.appendChild(div);

                    chat.scrollTo({top: chat.scrollHeight, behavior: "smooth"});
                },
                onError: (err) => console.error("❌ Stream error:", err)
            });
        });
    }




}