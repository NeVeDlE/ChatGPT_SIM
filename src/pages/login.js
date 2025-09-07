import { post } from '../services/api';
import { saveUserData, getToken } from '../services/storage';

export function init() {
    // Already logged in? go chat
    if (getToken()){
        history.replaceState({}, '', '/chat'); // Router guard will handle actual navigation
        window.dispatchEvent(new PopStateEvent('popstate'));
    }

    const form = document.querySelector('#login-form');
    const errorBox = document.querySelector('#login-error');

    const showError = (msg) => { errorBox.textContent = msg; errorBox.style.display = 'block'; };
    const clearError = () => { errorBox.textContent = ''; errorBox.style.display = 'none'; };

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();

        const email = document.querySelector('#email')?.value.trim();
        const password = document.querySelector('#password')?.value.trim();
        if (!email) return showError('Email is required.');
        if (!password) return showError('Password is required.');

        try {
            const { ok, data } = await post('/auth/login', { email, password });

            // Your backend returns { status: 'error', message: 'Invalid credentials' } on failure
            if (!ok || data.status === 'error') {
                return showError(data.message || 'Login failed');
            }

            // success: data.data = { user:{...}, access_token: '...' }
            saveUserData(data.data);
            window.history.pushState({}, '', '/chat');
            window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (err) {
            showError(err.message || 'Network error');
        }
    });
}
