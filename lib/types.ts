import { BloodType } from './bloodCompatibility';

export interface UserProfile {
  id: string;                     // usually the document ID == uid
  uid?: string;                   // sometimes stored separately
  email: string;
  name: string;
  phoneNumber: string;
  bloodType: BloodType;
  role: 'donor' | 'recipient' | 'admin';
  college: string;
  year: string;
  profilePhotoUrl?: string;
  medicalHistory?: string;
  lastDonation?: string | Date | any;     // allow Firestore Timestamp
  totalDonations: number;
  activeDonationId?: string | null;
  isAvailable: boolean;
  bloodStatus?: 'Available' | 'Unavailable' | 'Unknown';   // used in dashboard
  nextAvailableDate?: string | Date | any;                 // used for 3-month cooldown
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  createdAt: string | any;
  updatedAt: string | any;
}

export interface BloodRequest {
  id: string;
  recipientId: string;
  bloodType: BloodType;
  quantity: number;                    // primary field – number of units needed
  unitsNeeded?: number;                // optional alias (if old code still uses it)
  urgency: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  requiredDate: string;
  status: 'open' | 'matched' | 'completed' | 'cancelled';
  matchedDonors: string[];             // array of donor user IDs
  createdAt: string | any;
  updatedAt: string | any;
}

export interface DonationRecord {
  id: string;                          // Firestore document ID
  donorId: string;
  requestId?: string;                  // ← added: link to the blood request
  recipientId?: string;                // optional – if not tied to a request
  bloodType?: BloodType;
  units: number;                       // ← main field (matches service)
  quantity?: number;                   // ← optional alias for compatibility
  status: 'offered' | 'scheduled' | 'completed' | 'cancelled';
  offeredAt?: string | Date | any;     // ← added: when the offer was made (Timestamp)
  donationDate?: string | Date | any;  // actual donation date (if completed)
  location?: string;
  notes?: string;
  createdAt?: string | any;
  updatedAt?: string | any;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  isRead: boolean;
  createdAt: string | any;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'match' | 'request' | 'donation' | 'message' | 'system';
  title: string;
  message: string;
  relatedId?: string;
  isRead: boolean;
  createdAt: string | any;
}

export interface AdminStats {
  totalDonors: number;
  totalRecipients: number;
  totalDonations: number;
  totalBloodRequests: number;
  bloodTypeInventory: Record<BloodType, number>;
  successRate: number;
}