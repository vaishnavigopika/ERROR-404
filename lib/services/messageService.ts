import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  DocumentData,
  QuerySnapshot,
} from 'firebase/firestore';
import { Message } from '@/lib/types';

export const MAX_MESSAGE_LENGTH = 100;

export type DonationMessage = Message & {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  donationId: string;
  requestId: string;
};

export type DonationConversation = {
  id: string;
  donationId: string;
  requestId: string;
  donorId: string;
  recipientId: string;
  lastMessage: string;
  lastMessageAt: string;
  createdAt: string;
};

function validateMessage(content: string): string {
  const trimmed = content.trim();

  if (!trimmed) {
    throw new Error('Message cannot be empty.');
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`);
  }

  return trimmed;
}

async function getDonationAndVerifyUser(donationId: string, userId: string) {
  if (!donationId) {
    throw new Error('Donation ID is required.');
  }

  if (!userId) {
    throw new Error('User ID is required.');
  }

  const donationSnap = await getDoc(doc(db, 'donations', donationId));

  if (!donationSnap.exists()) {
    throw new Error('Donation record not found.');
  }

  const donation = donationSnap.data();

  if (donation.donorId !== userId && donation.recipientId !== userId) {
    throw new Error('You are not part of this donation conversation.');
  }

  return donation;
}

export const messageService = {
  // ============================================================
  // LEGACY USER-TO-USER METHODS
  // Kept so existing code does not immediately break.
  // New messaging UI should use the donation-specific methods below.
  // ============================================================

  async sendMessage(
    senderId: string,
    recipientId: string,
    content: string,
  ): Promise<string> {
    const message = validateMessage(content);

    try {
      const messageData = {
        senderId,
        recipientId,
        content: message,
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'messages'), messageData);
      return docRef.id;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  },

  async getConversation(userId1: string, userId2: string): Promise<Message[]> {
    try {
      const [sentSnapshot, receivedSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'messages'), where('senderId', '==', userId1), where('recipientId', '==', userId2))),
        getDocs(query(collection(db, 'messages'), where('senderId', '==', userId2), where('recipientId', '==', userId1))),
      ]);

      const messages = [...sentSnapshot.docs, ...receivedSnapshot.docs]
        .map((messageDoc) => ({
          id: messageDoc.id,
          ...messageDoc.data(),
        } as Message))
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

      return messages;
    } catch (error) {
      console.error('Error fetching conversation:', error);
      throw error;
    }
  },

  async getUserConversations(userId: string): Promise<Map<string, Message>> {
    try {
      const [sentSnapshot, receivedSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'messages'), where('senderId', '==', userId))),
        getDocs(query(collection(db, 'messages'), where('recipientId', '==', userId))),
      ]);

      const conversationMap = new Map<string, Message>();

      [...sentSnapshot.docs, ...receivedSnapshot.docs].forEach((messageDoc) => {
        const message = {
          id: messageDoc.id,
          ...messageDoc.data(),
        } as Message;

        const otherId =
          message.senderId === userId ? message.recipientId : message.senderId;

        if (
          !conversationMap.has(otherId) ||
          new Date(message.createdAt).getTime() >
            new Date(conversationMap.get(otherId)!.createdAt).getTime()
        ) {
          conversationMap.set(otherId, message);
        }
      });

      return conversationMap;
    } catch (error) {
      console.error('Error fetching conversations:', error);
      throw error;
    }
  },

  subscribeToConversation(
    userId1: string,
    userId2: string,
    callback: (messages: Message[]) => void,
  ): () => void {
    const sentQuery = query(
      collection(db, 'messages'),
      where('senderId', '==', userId1),
      where('recipientId', '==', userId2),
    );

    const receivedQuery = query(
      collection(db, 'messages'),
      where('senderId', '==', userId2),
      where('recipientId', '==', userId1),
    );

    let sentMessages: Message[] = [];
    let receivedMessages: Message[] = [];

    const emit = () => {
      callback(
        [...sentMessages, ...receivedMessages].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
      );
    };

    const unsubscribeSent = onSnapshot(
      sentQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        sentMessages = snapshot.docs.map((messageDoc) => ({
          id: messageDoc.id,
          ...messageDoc.data(),
        } as Message));
        emit();
      },
    );

    const unsubscribeReceived = onSnapshot(
      receivedQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        receivedMessages = snapshot.docs.map((messageDoc) => ({
          id: messageDoc.id,
          ...messageDoc.data(),
        } as Message));
        emit();
      },
    );

    return () => {
      unsubscribeSent();
      unsubscribeReceived();
    };
  },

  async markMessageAsRead(messageId: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'messages', messageId), { isRead: true });
    } catch (error) {
      console.error('Error marking message as read:', error);
      throw error;
    }
  },

  async getUnreadCount(userId: string, fromUserId?: string): Promise<number> {
    try {
      const constraints = [where('recipientId', '==', userId), where('isRead', '==', false)];

      if (fromUserId) {
        constraints.push(where('senderId', '==', fromUserId));
      }

      const snapshot = await getDocs(
        query(collection(db, 'messages'), ...constraints),
      );

      return snapshot.size;
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  },

  // ============================================================
  // DONATION-SPECIFIC MESSAGING
  // ============================================================

  async getOrCreateDonationConversation(
    donationId: string,
    userId: string,
  ): Promise<DonationConversation> {
    const donation = await getDonationAndVerifyUser(donationId, userId);

    const conversationRef = doc(db, 'conversations', donationId);
    const conversationSnap = await getDoc(conversationRef);

    if (conversationSnap.exists()) {
      return {
        id: conversationSnap.id,
        ...conversationSnap.data(),
      } as DonationConversation;
    }

    const now = new Date().toISOString();

    const conversation: DonationConversation = {
      id: donationId,
      donationId,
      requestId: donation.requestId,
      donorId: donation.donorId,
      recipientId: donation.recipientId,
      lastMessage: '',
      lastMessageAt: now,
      createdAt: now,
    };

    await setDoc(conversationRef, conversation);

    return conversation;
  },

  async sendDonationMessage(
    donationId: string,
    senderId: string,
    content: string,
  ): Promise<string> {
    const message = validateMessage(content);
    const donation = await getDonationAndVerifyUser(donationId, senderId);

    // A cancelled donation should not allow new messages.
    if (donation.status === 'cancelled') {
      throw new Error('Messaging is unavailable for a cancelled donation.');
    }

    const conversation = await this.getOrCreateDonationConversation(
      donationId,
      senderId,
    );

    const receiverId =
      senderId === conversation.donorId
        ? conversation.recipientId
        : conversation.donorId;

    const now = new Date().toISOString();

    const messageData = {
      senderId,
      receiverId,
      content: message,
      isRead: false,
      createdAt: now,
      donationId,
      requestId: conversation.requestId,
    };

    const messagesRef = collection(
      db,
      'conversations',
      donationId,
      'messages',
    );

    const messageRef = await addDoc(messagesRef, messageData);

    await updateDoc(doc(db, 'conversations', donationId), {
      lastMessage: message,
      lastMessageAt: now,
    });

    return messageRef.id;
  },

  async getDonationMessages(
    donationId: string,
    userId: string,
  ): Promise<DonationMessage[]> {
    await getDonationAndVerifyUser(donationId, userId);

    const messagesSnapshot = await getDocs(
      query(
        collection(db, 'conversations', donationId, 'messages'),
        where('donationId', '==', donationId),
      ),
    );

    return messagesSnapshot.docs
      .map((messageDoc) => ({
        id: messageDoc.id,
        ...messageDoc.data(),
      } as DonationMessage))
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
  },

  subscribeToDonationMessages(
    donationId: string,
    userId: string,
    callback: (messages: DonationMessage[]) => void,
  ): () => void {
    const messagesRef = collection(
      db,
      'conversations',
      donationId,
      'messages',
    );

    const q = query(messagesRef, where('donationId', '==', donationId));

    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs
        .map((messageDoc) => ({
          id: messageDoc.id,
          ...messageDoc.data(),
        } as DonationMessage))
        .filter(
          (message) =>
            message.senderId === userId || message.receiverId === userId,
        )
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

      callback(messages);
    });
  },

  async markDonationMessagesAsRead(
    donationId: string,
    userId: string,
  ): Promise<void> {
    await getDonationAndVerifyUser(donationId, userId);

    const snapshot = await getDocs(
      query(
        collection(db, 'conversations', donationId, 'messages'),
        where('receiverId', '==', userId),
        where('isRead', '==', false),
      ),
    );

    await Promise.all(
      snapshot.docs.map((messageDoc) =>
        updateDoc(messageDoc.ref, { isRead: true }),
      ),
    );
  },

  subscribeToDonationConversations(
    userId: string,
    callback: (conversations: DonationConversation[]) => void,
  ): () => void {
    const donorQuery = query(
      collection(db, 'conversations'),
      where('donorId', '==', userId),
    );

    const recipientQuery = query(
      collection(db, 'conversations'),
      where('recipientId', '==', userId),
    );

    let donorConversations: DonationConversation[] = [];
    let recipientConversations: DonationConversation[] = [];

    const emit = () => {
      const merged = new Map<string, DonationConversation>();

      [...donorConversations, ...recipientConversations].forEach((conversation) => {
        merged.set(conversation.id, conversation);
      });

      callback(
        Array.from(merged.values()).sort(
          (a, b) =>
            new Date(b.lastMessageAt || b.createdAt).getTime() -
            new Date(a.lastMessageAt || a.createdAt).getTime(),
        ),
      );
    };

    const unsubscribeDonor = onSnapshot(donorQuery, (snapshot) => {
      donorConversations = snapshot.docs.map((conversationDoc) => ({
        id: conversationDoc.id,
        ...conversationDoc.data(),
      } as DonationConversation));
      emit();
    });

    const unsubscribeRecipient = onSnapshot(recipientQuery, (snapshot) => {
      recipientConversations = snapshot.docs.map((conversationDoc) => ({
        id: conversationDoc.id,
        ...conversationDoc.data(),
      } as DonationConversation));
      emit();
    });

    return () => {
      unsubscribeDonor();
      unsubscribeRecipient();
    };
  },

  async getDonationConversations(
    userId: string,
  ): Promise<DonationConversation[]> {
    const [donorSnapshot, recipientSnapshot] = await Promise.all([
      getDocs(
        query(
          collection(db, 'conversations'),
          where('donorId', '==', userId),
        ),
      ),
      getDocs(
        query(
          collection(db, 'conversations'),
          where('recipientId', '==', userId),
        ),
      ),
    ]);

    const conversations = new Map<string, DonationConversation>();

    [...donorSnapshot.docs, ...recipientSnapshot.docs].forEach((conversationDoc) => {
      conversations.set(conversationDoc.id, {
        id: conversationDoc.id,
        ...conversationDoc.data(),
      } as DonationConversation);
    });

    return Array.from(conversations.values()).sort(
      (a, b) =>
        new Date(b.lastMessageAt || b.createdAt).getTime() -
        new Date(a.lastMessageAt || a.createdAt).getTime(),
    );
  },
};
