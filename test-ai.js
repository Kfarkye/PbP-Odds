import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: "AIzaSyAfN2AFl632MaZQ8AmlHMuK53jDlDGThSg" });
const chat = ai.chats.create({ model: "gemini-3.1-pro-preview" });
chat.sendMessage({ message: "Hello" }).then(r => console.log(r.text)).catch(e => console.error(e));
