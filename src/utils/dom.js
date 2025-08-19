export function showError(el, message) {
    el.textContent = message;
    el.style.display = "block";
}

export function clearError(el) {
    el.textContent = "";
    el.style.display = "none";
}