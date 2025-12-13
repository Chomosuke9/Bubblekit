// src/types.ts
export type Sender = "user" | "bot";

export interface Message {
    id: number;
    text: string;
    sender: Sender;
    // nanti bisa ditambah:
    // kind?: "text" | "image" | "file" | "tool";
    // imageUrl?: string;
    // dll...
}
