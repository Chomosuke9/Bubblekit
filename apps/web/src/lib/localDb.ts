import type { ConversationSummary } from "./chatApi";
import type { Message } from "@/types/Message";

type MessageId = string | number;

interface ConversationRecord extends ConversationSummary {
  userId: string;
}

interface MessageRecord extends Message {
  userId: string;
  conversationId: string;
  id: MessageId;
}

const DB_NAME = "bubblekit";
const DB_VERSION = 1;
const CONVERSATION_STORE = "conversations";
const MESSAGE_STORE = "messages";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONVERSATION_STORE)) {
        const conversationStore = db.createObjectStore(CONVERSATION_STORE, {
          keyPath: ["userId", "id"],
        });
        conversationStore.createIndex("by-user", "userId");
      }
      if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
        const messageStore = db.createObjectStore(MESSAGE_STORE, {
          keyPath: ["userId", "conversationId", "id"],
        });
        messageStore.createIndex("by-conversation", ["userId", "conversationId"]);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getCachedConversations(
  userId: string,
): Promise<ConversationSummary[]> {
  const db = await openDb();
  const tx = db.transaction(CONVERSATION_STORE, "readonly");
  const index = tx.objectStore(CONVERSATION_STORE).index("by-user");
  const records = await requestToPromise(index.getAll(userId));
  await transactionDone(tx);
  return records.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
}

export async function saveConversations(
  userId: string,
  conversations: ConversationSummary[],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CONVERSATION_STORE, "readwrite");
  const store = tx.objectStore(CONVERSATION_STORE);
  const index = store.index("by-user");
  const range = IDBKeyRange.only(userId);
  let cursor = await requestToPromise(index.openCursor(range));
  while (cursor) {
    cursor.delete();
    cursor = await requestToPromise(cursor.continue());
  }
  for (const conversation of conversations) {
    store.put({ ...conversation, userId });
  }
  await transactionDone(tx);
}

export async function getCachedMessages(
  userId: string,
  conversationId: string,
): Promise<Message[]> {
  const db = await openDb();
  const tx = db.transaction(MESSAGE_STORE, "readonly");
  const index = tx.objectStore(MESSAGE_STORE).index("by-conversation");
  const records = await requestToPromise(
    index.getAll([userId, conversationId]),
  );
  await transactionDone(tx);
  return records.map(({ userId: _userId, conversationId: _id, ...message }) => ({
    ...message,
  }));
}

export async function replaceCachedMessages(
  userId: string,
  conversationId: string,
  messages: Message[],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(MESSAGE_STORE, "readwrite");
  const store = tx.objectStore(MESSAGE_STORE);
  const index = store.index("by-conversation");
  const range = IDBKeyRange.only([userId, conversationId]);
  let cursor = await requestToPromise(index.openCursor(range));
  while (cursor) {
    cursor.delete();
    cursor = await requestToPromise(cursor.continue());
  }
  for (const message of messages) {
    const record: MessageRecord = {
      ...message,
      userId,
      conversationId,
      id: message.id,
    };
    store.put(record);
  }
  await transactionDone(tx);
}

export async function hasCachedMessages(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const db = await openDb();
  const tx = db.transaction(MESSAGE_STORE, "readonly");
  const count = await requestToPromise(
    tx
      .objectStore(MESSAGE_STORE)
      .index("by-conversation")
      .count([userId, conversationId]),
  );
  await transactionDone(tx);
  return count > 0;
}
