import { post } from '../services/api';

export function init() {
    const form = document.querySelector('#forgot-form');
    const msg = document.querySelector('#forgot-msg');

    const show = (t) => { msg.textContent = t; msg.style.display = 'block'; };

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.querySelector('#reset-email')?.value.trim();
        if (!email) return show('Email is required');

        try {
            // Adjust to your real endpoint
            const { data } = await post('/api/auth/forgot-password', { email });
            show(data.message || 'If that email exists, a reset link was sent.');
        } catch {
            show('If that email exists, a reset link was sent.');
        }
    });
}
