export const getToken = () => JSON.parse(localStorage.getItem('token') || '""');
export const saveUserData = (payload) => {
    // payload shape: { user: {...}, access_token: '...' }
    const keys = ['id','name','email','avatar_url'];
    keys.forEach(k => localStorage.setItem(k, JSON.stringify(payload?.user?.[k] || '')));
    localStorage.setItem('token', JSON.stringify(payload?.access_token || ''));
};
export const clearUser = () => {
    ['id','name','email','avatar','token'].forEach(k => localStorage.removeItem(k));
};
export const getUser = () => ({
    id: JSON.parse(localStorage.getItem('id') || '""'),
    name: JSON.parse(localStorage.getItem('name') || '""'),
    email: JSON.parse(localStorage.getItem('email') || '""'),
    avatar_url: JSON.parse(localStorage.getItem('avatar') || '""'),
});
