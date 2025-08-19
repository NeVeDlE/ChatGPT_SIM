import {getToken, getUser} from "../services/storage.js";
import {showError} from "../utils/dom.js";
import {ChatSidebar} from "./chat-sidebar";

const errorBox = document.querySelector("#chat-error");

const {email, name, avatar_url} = getUser();
const nameEl = document.querySelector('[data-user-name]');
const emailEl = document.querySelector('[data-user-email]');
const avatarEl = document.querySelector('[data-user-avatar]');

nameEl.innerHTML = name;
emailEl.innerHTML = email;

if (avatar_url) {
    avatarEl.src = avatar_url ?? '';
}
const chatSidebar = new ChatSidebar();
