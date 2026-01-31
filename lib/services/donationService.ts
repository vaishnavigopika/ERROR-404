// lib/services/donationService.ts
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  Unsubscribe,
  QuerySnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { updateUserAfterDonation } from './userService';
import { DonationRecord } from '@/lib/types';
import { BloodType } from '@/lib/bloodCompatibility'; // adjust path if needed

interface OfferDonationInput {
  donorId: string;
  requestId: string;
  units: number;
  date: Date;
  bloodType?: BloodType; // should be BloodType if provided
}

export async function offerBloodDonation(input: OfferDonationInput): Promise<string> {
  const { donorId, requestId, units, date, bloodType: providedBloodType } = input;

  try {
    // 1. Fetch donor's blood type if not provided
    let bloodType: BloodType | undefined = providedBloodType;

    if (!bloodType) {
      const donorSnap = await getDoc(doc(db, 'users', donorId));
      if (donorSnap.exists()) {
        const candidate = donorSnap.data()?.bloodType as string | undefined;
        // Optional: validate against your BloodType union
        if (candidate && isValidBloodType(candidate)) {
          bloodType = candidate as BloodType;
        } else {
          console.warn(`Invalid or missing blood type for donor ${donorId}`);
        }
      }
    }

    // 2. Create donation record
    const donationData: Partial<DonationRecord> = {
      donorId,
      requestId,
      units,
      bloodType, // now safe: BloodType | undefined
      status: 'offered',
      offeredAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const donationRef = await addDoc(collection(db, 'donations'), donationData);
    console.log(`[Donation] Created offer with ID: ${donationRef.id}`);

    // 3. Update blood request
    const requestRef = doc(db, 'bloodRequests', requestId);
    const requestSnap = await getDoc(requestRef);

    if (requestSnap.exists()) {
      const reqData = requestSnap.data() ?? {};
      const currentUnits = reqData.quantity ?? reqData.unitsNeeded ?? 1;
      const newUnits = Math.max(0, currentUnits - units);

      const updatePayload: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };

      // Update whichever field exists
      if ('quantity' in reqData) {
        updatePayload.quantity = newUnits;
      } else if ('unitsNeeded' in reqData) {
        updatePayload.unitsNeeded = newUnits;
      }

      if (newUnits <= 0) {
        updatePayload.status = 'matched';
      }

      await updateDoc(requestRef, updatePayload);
      console.log(`[Donation] Updated request ${requestId}: units now ${newUnits}`);
    } else {
      console.warn(`[Donation] Request ${requestId} not found — donation still saved`);
    }

    // 4. Update donor status & last donation
    await updateUserAfterDonation(donorId, date);
    console.log(`[Donation] Donor ${donorId} status updated`);

    return donationRef.id;
  } catch (error: any) {
    console.error('[Donation] Failed to offer blood:', error);
    throw new Error(error.message || 'Failed to submit blood offer. Try again.');
  }
}

/**
 * Helper to validate blood type string against BloodType union
 * Add your actual BloodType values here
 */
function isValidBloodType(value: string): value is BloodType {
  const validTypes: BloodType[] = [
    'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'
    // add any other types from your bloodCompatibility.ts
  ];
  return validTypes.includes(value as BloodType);
}

/**
 * Real-time subscription to a user's donations (already good)
 */
export function subscribeToUserDonations(
  userId: string,
  callback: (donations: DonationRecord[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'donations'),
    where('donorId', '==', userId),
    orderBy('offeredAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot: QuerySnapshot<DocumentData>) => {
      const donations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as DonationRecord[];
      callback(donations);
    },
    (error) => {
      console.error('[Donation] Real-time listener error:', error);
    }
  );
}