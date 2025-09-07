export function showError(message) {
    const msg = typeof message === 'string'
        ? message
        : (message?.message || JSON.stringify(message));

    // Put the message into a toast or fallback to alert
    const toast = document.querySelector('[data-toast="error"]');
    if (toast) {
        toast.textContent = msg;
        toast.classList.add('is-visible');
        setTimeout(() => toast.classList.remove('is-visible'), 4000);
    } else {
        console.error(msg);
        alert(msg);
    }
}
export function clearError(el) {
    el.textContent = "";
    el.style.display = "none";
}