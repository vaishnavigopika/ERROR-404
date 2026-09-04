import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { canDonate, BloodType, BLOOD_TYPES } from '@/lib/bloodCompatibility';
import { updateUserAfterDonation } from '@/lib/services/userService';

interface OfferBloodDonationInput {
  donorId: string;
  requestId: string;
  units: number;
  date: Date;
  bloodType?: string;
}

/**
 * Check whether a value is a valid BloodType.
 */
function isValidBloodType(value: string): value is BloodType {
  return BLOOD_TYPES.includes(value as BloodType);
}

/**
 * Offer blood for a blood request.
 *
 * This function performs the important business validations:
 * - donor exists
 * - donor is actually a donor
 * - donor has a valid blood type
 * - donor is available
 * - request exists
 * - request is still open
 * - request has units remaining
 * - donor and recipient blood types are compatible
 */
export async function offerBloodDonation(
  input: OfferBloodDonationInput
) {
  const {
    donorId,
    requestId,
    units,
    date,
    bloodType,
  } = input;

  // --------------------------------------------------
  // 1. Validate basic input
  // --------------------------------------------------

  if (!donorId) {
    throw new Error('Donor ID is required.');
  }

  if (!requestId) {
    throw new Error('Request ID is required.');
  }

  if (!Number.isInteger(units) || units <= 0) {
    throw new Error('Donation units must be a positive whole number.');
  }

  // --------------------------------------------------
  // 2. Get donor profile
  // --------------------------------------------------

  const donorRef = doc(db, 'users', donorId);
  const donorSnap = await getDoc(donorRef);

  if (!donorSnap.exists()) {
    throw new Error('Donor profile not found.');
  }

  const donorData = donorSnap.data();

  // --------------------------------------------------
  // 3. Make sure the user is actually a donor
  // --------------------------------------------------

  if (donorData.role !== 'donor') {
    throw new Error('Only registered donors can offer blood.');
  }

  // --------------------------------------------------
  // 4. Determine donor blood type
  // --------------------------------------------------

  const donorBloodType = bloodType || donorData.bloodType;

  if (!donorBloodType || !isValidBloodType(donorBloodType)) {
    throw new Error('Donor has an invalid or missing blood type.');
  }

  // --------------------------------------------------
  // 5. Check donor availability
  // --------------------------------------------------

  if (donorData.isAvailable === false) {
    throw new Error('You are currently unavailable for blood donation.');
  }

  // If the donor has a future nextAvailableDate,
  // don't allow donation before that date.
  if (donorData.nextAvailableDate) {
    const nextAvailableDate =
      donorData.nextAvailableDate?.toDate
        ? donorData.nextAvailableDate.toDate()
        : new Date(donorData.nextAvailableDate);

    if (
      !Number.isNaN(nextAvailableDate.getTime()) &&
      new Date() < nextAvailableDate
    ) {
      throw new Error(
        `You are not eligible to donate until ${nextAvailableDate.toLocaleDateString()}.`
      );
    }
  }

  // --------------------------------------------------
  // 6. Get blood request
  // --------------------------------------------------

  const requestRef = doc(db, 'bloodRequests', requestId);
  const requestSnap = await getDoc(requestRef);

  if (!requestSnap.exists()) {
    throw new Error('Blood request not found.');
  }

  const requestData = requestSnap.data();

  // --------------------------------------------------
  // 7. Check request status
  // --------------------------------------------------

  if (requestData.status !== 'open') {
    throw new Error('This blood request is no longer open.');
  }

  // --------------------------------------------------
  // 8. Get requested blood type
  // --------------------------------------------------

  const requestBloodType = requestData.bloodType;

  if (
    !requestBloodType ||
    !isValidBloodType(requestBloodType)
  ) {
    throw new Error('Blood request has an invalid blood type.');
  }

  // --------------------------------------------------
  // 9. IMPORTANT: Check blood compatibility
  // --------------------------------------------------

  if (!canDonate(donorBloodType, requestBloodType)) {
    throw new Error(
      `Your blood type (${donorBloodType}) is not compatible with this request (${requestBloodType}).`
    );
  }

  // --------------------------------------------------
  // 10. Check remaining quantity
  // --------------------------------------------------

  const currentUnits =
    typeof requestData.quantity === 'number'
      ? requestData.quantity
      : typeof requestData.unitsNeeded === 'number'
        ? requestData.unitsNeeded
        : 1;

  if (currentUnits <= 0) {
    throw new Error('This blood request has already received enough blood.');
  }

  if (units > currentUnits) {
    throw new Error(
      `Only ${currentUnits} unit(s) are still needed for this request.`
    );
  }

  // --------------------------------------------------
  // 11. Create donation offer
  // --------------------------------------------------

  const now = new Date().toISOString();

  const donationData = {
    donorId,
    requestId,
    recipientId: requestData.recipientId,
    bloodType: donorBloodType,
    units,
    quantity: units,
    status: 'offered',
    offeredAt: now,
    donationDate: date.toISOString(),
    createdAt: now,
    updatedAt: now,
  };

  await addDoc(
    collection(db, 'donations'),
    donationData
  );

  // --------------------------------------------------
  // 12. Update blood request
  // --------------------------------------------------

  const newUnits = currentUnits - units;

  await updateDoc(requestRef, {
    quantity: newUnits,
    status: newUnits <= 0 ? 'matched' : 'open',
    updatedAt: now,
  });

  // --------------------------------------------------
  // 13. Update donor information
  // --------------------------------------------------
  //
  // NOTE:
  // Your existing application currently treats an offer
  // as a donation and updates totalDonations here.
  //
  // We will improve this later when we implement the
  // offered -> scheduled -> completed lifecycle.
  //

  await updateUserAfterDonation(donorId, date);

  return {
    success: true,
    donationId: undefined,
    remainingUnits: newUnits,
    status: newUnits <= 0 ? 'matched' : 'open',
  };
}

/**
 * Subscribe to a donor's donation records in real time.
 */
export function subscribeToUserDonations(
  donorId: string,
  callback: (donations: any[]) => void,
  onError?: (error: Error) => void
) {
  const donationsRef = collection(db, 'donations');

  const q = query(
    donationsRef,
    where('donorId', '==', donorId),
    orderBy('offeredAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const donations = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      callback(donations);
    },
    (error) => {
      console.error(
        'Donations real-time error:',
        error
      );

      if (onError) {
        onError(error);
      }
    }
  );
}