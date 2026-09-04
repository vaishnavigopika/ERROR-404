import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  onSnapshot,
  DocumentData,
  QuerySnapshot,
} from 'firebase/firestore';
import { Notification } from '@/lib/types';
import {
  getCompatibleDonors,
  BloodType,
  BLOOD_TYPES,
} from '@/lib/bloodCompatibility';

function isValidBloodType(value: string): value is BloodType {
  return BLOOD_TYPES.includes(value as BloodType);
}

export const notificationService = {
  // Create a notification
  async createNotification(
    userId: string,
    type: Notification['type'],
    title: string,
    message: string,
    relatedId?: string
  ): Promise<string> {
    try {
      const notificationData = {
        userId,
        type,
        title,
        message,
        relatedId,
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(
        collection(db, 'notifications'),
        notificationData
      );

      return docRef.id;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  },

  // Get user's notifications
  async getUserNotifications(
    userId: string
  ): Promise<Notification[]> {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId)
      );

      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Notification));
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }
  },

  // Subscribe to real-time notifications
  subscribeToNotifications(
    userId: string,
    callback: (notifications: Notification[]) => void
  ): () => void {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot: QuerySnapshot<DocumentData>) => {
        const notifications = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as Notification));

        callback(notifications);
      },
      (error) => {
        console.error(
          'Real-time notification error:',
          error
        );
      }
    );

    return unsubscribe;
  },

  // Mark notification as read
  async markAsRead(
    notificationId: string
  ): Promise<void> {
    try {
      const docRef = doc(
        db,
        'notifications',
        notificationId
      );

      await updateDoc(docRef, {
        isRead: true,
      });
    } catch (error) {
      console.error(
        'Error marking notification as read:',
        error
      );
      throw error;
    }
  },

  // Mark all notifications as read
  async markAllAsRead(
    userId: string
  ): Promise<void> {
    try {
      const notifications =
        await this.getUserNotifications(userId);

      const updatePromises = notifications
        .filter((notification) => !notification.isRead)
        .map((notification) =>
          this.markAsRead(notification.id)
        );

      await Promise.all(updatePromises);
    } catch (error) {
      console.error(
        'Error marking all as read:',
        error
      );
      throw error;
    }
  },

  // Notify compatible donors about a request
  async notifyCompatibleDonors(
    bloodType: string,
    requestId: string,
    recipientName: string,
    quantity: number,
    urgency: string
  ): Promise<void> {
    try {
      // Validate the requested blood type
      if (!isValidBloodType(bloodType)) {
        throw new Error(
          `Invalid blood type: ${bloodType}`
        );
      }

      // Get blood types that can donate to the recipient
      const compatibleBloodTypes =
        getCompatibleDonors(bloodType);

      // Find only available donors with compatible blood types
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'donor'),
        where('isAvailable', '==', true),
        where(
          'bloodType',
          'in',
          compatibleBloodTypes
        )
      );

      const querySnapshot = await getDocs(q);

      const donorPromises =
        querySnapshot.docs.map((donorDoc) => {
          const donor = donorDoc.data();

          // Use the document ID as the safest donor ID
          const donorId =
            donor.id || donorDoc.id;

          return this.createNotification(
            donorId,
            'request',
            `Blood Request - ${bloodType}`,
            `${recipientName} needs ${quantity} units of ${bloodType} blood (${urgency} priority)`,
            requestId
          );
        });

      await Promise.all(donorPromises);
    } catch (error) {
      console.error(
        'Error notifying compatible donors:',
        error
      );
      throw error;
    }
  },

  // Notify recipient about donor match
  async notifyRecipientAboutMatch(
    recipientId: string,
    donorName: string,
    bloodType: string,
    requestId: string
  ): Promise<void> {
    try {
      await this.createNotification(
        recipientId,
        'match',
        'Blood Match Found!',
        `${donorName} can donate ${bloodType} blood to you!`,
        requestId
      );
    } catch (error) {
      console.error(
        'Error notifying recipient:',
        error
      );
      throw error;
    }
  },

  // Notify about donation completion
  async notifyAboutDonation(
    userId: string,
    type: 'donor' | 'recipient',
    details: string
  ): Promise<void> {
    try {
      await this.createNotification(
        userId,
        'donation',
        type === 'donor'
          ? 'Thank You for Donating!'
          : 'Blood Donation Received',
        details
      );
    } catch (error) {
      console.error(
        'Error notifying about donation:',
        error
      );
      throw error;
    }
  },
};