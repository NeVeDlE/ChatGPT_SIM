import Router from './utils/router';
import '.././public/styles.css'; // if you also keep a module stylesheet; optional

import { getToken } from './services/storage';

const router = new Router({ rootId: 'app', viewBase: '/views', useHash: false });

// Routes (like Laravel)
router
    .add({ path: '/',       view: 'login.html',  script: 'login.js' })   // 👈 add this
    .add({ path: '/login',  view: 'login.html',  script: 'login.js' })
    .add({ path: '/forgot', view: 'forgot.html', script: 'forgot.js' })
    .add({ path: '/chat',   view: 'chat.html',   script: 'chat.js', meta: { auth: true } });

// Global guard (middleware)
router.beforeEach(({ to, path }) => {
    const token = getToken();
    if (to.meta?.auth && !token) return '/login';   // protect /chat
    if (path === '/login' && token) return '/chat'; // already logged in
});

// Start the app (default route)
router.start('/login');

// Expose for debugging
window._router = router;
