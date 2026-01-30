import type { ConversationSummary } from "@/lib/chatApi";
import type { Message } from "@/types/Message";

const DB_NAME = "bubblekit";
const DB_VERSION = 1;
const CONVERSATIONS_STORE = "conversations";
const MESSAGES_STORE = "messages";

interface ConversationRecord extends ConversationSummary {
  userId: string;
  syncedAt: number;
}

interface MessageRecord {
  messageId: string;
  conversationId: string;
  userId: string;
  role: Message["role"];
  content: string;
  type?: string;
  config?: Message["config"];
  createdAt?: string;
  status?: Message["status"];
  seq: number;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        const store = db.createObjectStore(CONVERSATIONS_STORE, { keyPath: "id" });
        store.createIndex("byUserId", "userId", { unique: false });
        store.createIndex("byUserIdUpdatedAt", ["userId", "updatedAt"], { unique: false });
      }

      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        const store = db.createObjectStore(MESSAGES_STORE, { keyPath: "messageId" });
        store.createIndex("byConversation", ["conversationId", "userId"], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeMessageId(id: Message["id"]) {
  return typeof id === "string" ? id : String(id);
}

export async function getLocalConversations(
  userId: string,
): Promise<ConversationSummary[]> {
  const db = await openDb();
  const tx = db.transaction(CONVERSATIONS_STORE, "readonly");
  const index = tx.objectStore(CONVERSATIONS_STORE).index("byUserId");
  const records = await requestToPromise(index.getAll(userId));
  return (records as ConversationRecord[])
    .map(({ id, title, updatedAt }) => ({
      id,
      title,
      updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveLocalConversations(
  userId: string,
  conversations: ConversationSummary[],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CONVERSATIONS_STORE, "readwrite");
  const store = tx.objectStore(CONVERSATIONS_STORE);
  const index = store.index("byUserId");
  const keys = await requestToPromise(index.getAllKeys(userId));

  for (const key of keys) {
    store.delete(key);
  }

  const now = Date.now();
  for (const conversation of conversations) {
    const record: ConversationRecord = {
      ...conversation,
      userId,
      syncedAt: now,
    };
    store.put(record);
  }

  await transactionComplete(tx);
}

export async function getLocalMessages(
  userId: string,
  conversationId: string,
): Promise<Message[]> {
  const db = await openDb();
  const tx = db.transaction(MESSAGES_STORE, "readonly");
  const index = tx.objectStore(MESSAGES_STORE).index("byConversation");
  const records = await requestToPromise(
    index.getAll([conversationId, userId]),
  );

  return (records as MessageRecord[])
    .sort((a, b) => a.seq - b.seq)
    .map((record) => ({
      id: record.messageId,
      role: record.role,
      content: record.content,
      type: record.type,
      config: record.config,
      createdAt: record.createdAt,
      status: record.status,
    }));
}

export async function getLocalMessageCount(
  userId: string,
  conversationId: string,
): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(MESSAGES_STORE, "readonly");
  const index = tx.objectStore(MESSAGES_STORE).index("byConversation");
  const request = index.count([conversationId, userId]);
  return requestToPromise(request);
}

export async function saveLocalMessages(
  userId: string,
  conversationId: string,
  messages: Message[],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(MESSAGES_STORE, "readwrite");
  const store = tx.objectStore(MESSAGES_STORE);
  const index = store.index("byConversation");
  const keys = await requestToPromise(index.getAllKeys([conversationId, userId]));

  for (const key of keys) {
    store.delete(key);
  }

  messages.forEach((message, indexValue) => {
    const record: MessageRecord = {
      messageId: normalizeMessageId(message.id),
      conversationId,
      userId,
      role: message.role,
      content: message.content,
      type: message.type,
      config: message.config,
      createdAt: message.createdAt,
      status: message.status,
      seq: indexValue,
    };
    store.put(record);
  });

  await transactionComplete(tx);
}
