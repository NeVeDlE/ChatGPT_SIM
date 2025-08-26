// utils/markdown.js
import { marked } from "marked";

// Safer defaults + line breaks like chat apps
marked.setOptions({ mangle: false, headerIds: false, breaks: true });

export { marked };
