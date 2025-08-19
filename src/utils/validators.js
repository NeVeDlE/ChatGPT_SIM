export function validateEmail(email) {
    if (!email.trim()) return "Email is required.";
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email) ? null : "Invalid email format.";
}

export function validatePassword(password) {
    if (!password.trim()) return "Password is required.";
    return password.length < 6 ? "Password must be at least 6 characters." : null;
}
