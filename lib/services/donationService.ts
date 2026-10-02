import { addMonths } from 'date-fns';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

import {
  canDonate,
  BloodType,
  BLOOD_TYPES,
} from '@/lib/bloodCompatibility';

import {
  isUserEligibleToDonate,
} from '@/lib/services/userService';

interface OfferBloodDonationInput {
  donorId: string;
  requestId: string;
  units: number;
  date: Date;
  bloodType?: string;
}

function isValidBloodType(
  value: string
): value is BloodType {
  return BLOOD_TYPES.includes(
    value as BloodType
  );
}


// ============================================================
// OFFER BLOOD
// ============================================================

export async function offerBloodDonation(
  input: OfferBloodDonationInput
) {
  const { donorId, requestId, units, date, bloodType } = input;

  if (!donorId) throw new Error('Donor ID is required.');
  if (!requestId) throw new Error('Request ID is required.');
  if (units !== 1) throw new Error('A donor can offer only 1 unit per donation.');
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid offer date.');
  }

  const eligible = await isUserEligibleToDonate(donorId);
  if (!eligible) {
    throw new Error('You are currently unavailable for blood donation.');
  }

  const donorRef = doc(db, 'users', donorId);
  const requestRef = doc(db, 'bloodRequests', requestId);
  const donationRef = doc(collection(db, 'donations'));

  const result = await runTransaction(db, async (transaction) => {
    const donorSnap = await transaction.get(donorRef);
    const requestSnap = await transaction.get(requestRef);

    if (!donorSnap.exists()) throw new Error('Donor profile not found.');
    if (!requestSnap.exists()) throw new Error('Blood request not found.');

    const donorData = donorSnap.data();
    const requestData = requestSnap.data();

    if (donorData.role !== 'donor') {
      throw new Error('Only registered donors can offer blood.');
    }

    if (donorData.activeDonationId) {
      throw new Error(
        'You already have an active blood donation. Complete or cancel it before offering blood to another request.'
      );
    }

    if (requestData.status !== 'open') {
      throw new Error('This blood request is no longer open.');
    }

    // An offer is allowed before the requested donation window.
    // It is rejected only after the window has completely passed.
    if (requestData.requiredDate) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const requiredDate = String(requestData.requiredDate);

      if (requiredDate < today) {
        throw new Error('This blood request has expired because its required date has passed.');
      }

      if (requiredDate === today && requestData.requiredTimeEnd) {
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (currentTime > String(requestData.requiredTimeEnd)) {
          throw new Error(
            `This blood request has expired because its requested time window ended at ${requestData.requiredTimeEnd}.`
          );
        }
      }
    }

    if (requestData.recipientId === donorId) {
      throw new Error('You cannot donate to your own blood request.');
    }

    const donorBloodType = bloodType || donorData.bloodType;
    const requestBloodType = requestData.bloodType;

    if (!donorBloodType || !isValidBloodType(donorBloodType)) {
      throw new Error('Donor has an invalid or missing blood type.');
    }

    if (!requestBloodType || !isValidBloodType(requestBloodType)) {
      throw new Error('Blood request has an invalid blood type.');
    }

    if (!canDonate(donorBloodType, requestBloodType)) {
      throw new Error(
        `Your blood type (${donorBloodType}) is not compatible with this request (${requestBloodType}).`
      );
    }

    const currentUnits =
      typeof requestData.quantity === 'number'
        ? requestData.quantity
        : typeof requestData.unitsNeeded === 'number'
          ? requestData.unitsNeeded
          : 0;

    if (currentUnits <= 0) {
      throw new Error('This blood request has already received enough blood.');
    }

    // Count ACTIVE OFFERS separately from units actually received.
    // IMPORTANT: offering blood does NOT reduce request.quantity.
    const donationQuery = query(
      collection(db, 'donations'),
      where('requestId', '==', requestId),
      where('status', 'in', ['offered', 'scheduled'])
    );
    const activeOffersSnap = await getDocs(donationQuery);

    const duplicateOffer = activeOffersSnap.docs.some(
      (d) => d.data().donorId === donorId
    );
    if (duplicateOffer) {
      throw new Error('You have already offered blood for this request.');
    }

    const now = new Date().toISOString();

    const donationData = {
      donorId,
      requestId,
      recipientId: requestData.recipientId,
      bloodType: donorBloodType,
      units: 1,
      quantity: 1,
      status: 'offered',
      offeredAt: now,
      donationDate: null,
      requiredDate: requestData.requiredDate || null,
      requiredTimeStart: requestData.requiredTimeStart || null,
      requiredTimeEnd: requestData.requiredTimeEnd || null,
      location: requestData.location || null,
      unitsCounted: false,
      pendingConfirmation: true,
      createdAt: now,
      updatedAt: now,
    };

    transaction.set(donationRef, donationData);

    // Lock donor until they cancel or confirm what happened.
    // Do NOT change the blood request quantity here.
    transaction.update(donorRef, {
      activeDonationId: donationRef.id,
      isAvailable: false,
      bloodStatus: 'Unavailable',
      pendingDonationConfirmation: true,
      updatedAt: now,
    });

    return {
      donationId: donationRef.id,
      remainingUnits: currentUnits,
      status: 'offered' as const,
    };
  });

  return {
    success: true,
    donationId: result.donationId,
    remainingUnits: result.remainingUnits,
    status: result.status,
  };
}

// ============================================================
// SCHEDULE DONATION
// ============================================================

export async function scheduleDonation(
  donationId: string,
  scheduledDate: Date,
  schedulerUserId?: string
) {
  if (!donationId) {
    throw new Error('Donation ID is required.');
  }

  if (
    !(scheduledDate instanceof Date) ||
    Number.isNaN(scheduledDate.getTime())
  ) {
    throw new Error('Invalid scheduled donation date and time.');
  }

  if (!schedulerUserId) {
    throw new Error(
      'Only the recipient who created the blood request can schedule this donation.'
    );
  }

  const donationRef = doc(
    db,
    'donations',
    donationId
  );

  const result = await runTransaction(
    db,
    async (transaction) => {
      // ----------------------------------------------------------
      // READ DONATION
      // ----------------------------------------------------------

      const donationSnap = await transaction.get(
        donationRef
      );

      if (!donationSnap.exists()) {
        throw new Error('Donation record not found.');
      }

      const donationData = donationSnap.data();

      if (donationData.status !== 'offered') {
        throw new Error(
          'Only offered donations can be scheduled.'
        );
      }

      if (!donationData.requestId) {
        throw new Error(
          'Donation is not linked to a blood request.'
        );
      }

      // ----------------------------------------------------------
      // READ REQUEST
      // ----------------------------------------------------------

      const requestRef = doc(
        db,
        'bloodRequests',
        donationData.requestId
      );

      const requestSnap = await transaction.get(
        requestRef
      );

      if (!requestSnap.exists()) {
        throw new Error('Blood request not found.');
      }

      const requestData = requestSnap.data();

      // Only the person who created the request can choose
      // the appointment date and time.
      if (requestData.recipientId !== schedulerUserId) {
        throw new Error(
          'Only the recipient who created this request can schedule the donation.'
        );
      }

      // ----------------------------------------------------------
      // VALIDATE REQUESTED DATE
      // ----------------------------------------------------------

      if (requestData.requiredDate) {
        const requiredDate = String(
          requestData.requiredDate
        );

        // Compare calendar dates in local time rather than using
        // toISOString(), which can shift the calendar date through UTC.
        const scheduledYear = scheduledDate.getFullYear();
        const scheduledMonth = String(
          scheduledDate.getMonth() + 1
        ).padStart(2, '0');
        const scheduledDay = String(
          scheduledDate.getDate()
        ).padStart(2, '0');

        const scheduledDateString =
          `${scheduledYear}-${scheduledMonth}-${scheduledDay}`;

        if (requiredDate !== scheduledDateString) {
          throw new Error(
            `The donation must be scheduled on ${requiredDate}.`
          );
        }
      }

      // ----------------------------------------------------------
      // VALIDATE REQUESTED TIME WINDOW
      // ----------------------------------------------------------

      const scheduledHours = String(
        scheduledDate.getHours()
      ).padStart(2, '0');

      const scheduledMinutes = String(
        scheduledDate.getMinutes()
      ).padStart(2, '0');

      const scheduledTime =
        `${scheduledHours}:${scheduledMinutes}`;

      if (
        requestData.requiredTimeStart &&
        scheduledTime < String(requestData.requiredTimeStart)
      ) {
        throw new Error(
          `Choose a donation time at or after ${requestData.requiredTimeStart}.`
        );
      }

      if (
        requestData.requiredTimeEnd &&
        scheduledTime > String(requestData.requiredTimeEnd)
      ) {
        throw new Error(
          `Choose a donation time at or before ${requestData.requiredTimeEnd}.`
        );
      }

      // Do not allow a scheduled appointment in the past.
      if (scheduledDate.getTime() < Date.now()) {
        throw new Error(
          'The donation appointment cannot be scheduled in the past.'
        );
      }

      // ----------------------------------------------------------
      // UPDATE DONATION
      // ----------------------------------------------------------

      const now = new Date().toISOString();

      transaction.update(
        donationRef,
        {
          status: 'scheduled',
          donationDate: scheduledDate.toISOString(),
          scheduledAt: now,
          scheduledBy: schedulerUserId,
          updatedAt: now,
        }
      );

      return {
        donationId,
        status: 'scheduled' as const,
      };
    }
  );

  return {
    success: true,
    donationId: result.donationId,
    status: result.status,
  };
}


// ============================================================
// COMPLETE DONATION
// ============================================================

export async function completeDonation(
  donationId: string,
  completionDate: Date = new Date()
) {
  if (!donationId) throw new Error('Donation ID is required.');
  if (!(completionDate instanceof Date) || Number.isNaN(completionDate.getTime())) {
    throw new Error('Invalid completion date.');
  }

  const donationRef = doc(db, 'donations', donationId);

  await runTransaction(db, async (transaction) => {
    const donationSnap = await transaction.get(donationRef);
    if (!donationSnap.exists()) throw new Error('Donation record not found.');

    const donation = donationSnap.data();
    if (donation.status !== 'offered' && donation.status !== 'scheduled') {
      throw new Error('This donation is no longer awaiting confirmation.');
    }

    const donorId = donation.donorId as string | undefined;
    const requestId = donation.requestId as string | undefined;
    if (!donorId) throw new Error('Donation does not have a donor ID.');
    if (!requestId) throw new Error('Donation does not have a request ID.');

    const donorRef = doc(db, 'users', donorId);
    const requestRef = doc(db, 'bloodRequests', requestId);

    const donorSnap = await transaction.get(donorRef);
    const requestSnap = await transaction.get(requestRef);

    if (!donorSnap.exists()) throw new Error('Donor profile not found.');
    if (!requestSnap.exists()) throw new Error('Blood request not found.');

    const donorData = donorSnap.data();
    const requestData = requestSnap.data();

    if (donation.donorId !== donorId) {
      throw new Error('You are not allowed to confirm this donation.');
    }

    if (donorData.activeDonationId !== donationId) {
      throw new Error('This donation is no longer the donor\'s active donation.');
    }

    // The donor can confirm during the requested window OR any time after it.
    // They cannot confirm before the receiver's requested start time.
    if (requestData.requiredDate) {
      const [year, month, day] = String(requestData.requiredDate).split('-').map(Number);
      if (year && month && day) {
        const start = new Date(year, month - 1, day);
        if (requestData.requiredTimeStart) {
          const [h, m] = String(requestData.requiredTimeStart).split(':').map(Number);
          start.setHours(h || 0, m || 0, 0, 0);
        } else {
          start.setHours(0, 0, 0, 0);
        }

        if (completionDate.getTime() < start.getTime()) {
          throw new Error(
            `Donation confirmation is available from ${requestData.requiredDate}${requestData.requiredTimeStart ? ` at ${requestData.requiredTimeStart}` : ''}.`
          );
        }
      }
    }

    const currentQuantity =
      typeof requestData.quantity === 'number'
        ? requestData.quantity
        : typeof requestData.unitsNeeded === 'number'
          ? requestData.unitsNeeded
          : 0;

    const alreadyCounted = donation.unitsCounted === true;
    const newQuantity = alreadyCounted
      ? currentQuantity
      : Math.max(0, currentQuantity - 1);

    const existingMatchedDonors = Array.isArray(requestData.matchedDonors)
      ? requestData.matchedDonors
      : [];

    const matchedDonors = existingMatchedDonors.includes(donorId)
      ? existingMatchedDonors
      : [...existingMatchedDonors, donorId];

    const now = new Date().toISOString();

    transaction.update(donationRef, {
      status: 'completed',
      donationDate: completionDate.toISOString(),
      completedAt: now,
      unitsCounted: true,
      pendingConfirmation: false,
      updatedAt: now,
    });

    // ONLY NOW does the request lose one unit.
    transaction.update(requestRef, {
      quantity: newQuantity,
      matchedDonors,
      status: newQuantity <= 0 ? 'matched' : 'open',
      updatedAt: now,
    });

    // A real donation starts the 3-month waiting period.
    const nextAvailableDate = addMonths(completionDate, 3).toISOString();

    transaction.update(donorRef, {
      activeDonationId: null,
      isAvailable: false,
      bloodStatus: 'Unavailable',
      pendingDonationConfirmation: false,
      lastDonation: completionDate.toISOString(),
      totalDonations:
        typeof donorData.totalDonations === 'number'
          ? donorData.totalDonations + (alreadyCounted ? 0 : 1)
          : 1,
      nextAvailableDate,
      updatedAt: now,
    });
  });

  return {
    success: true,
    donationId,
    status: 'completed' as const,
  };
}

// ============================================================
// CANCEL DONATION
// ============================================================

export async function cancelDonation(
  donationId: string
) {
  if (!donationId) throw new Error('Donation ID is required.');

  const donationRef = doc(db, 'donations', donationId);

  await runTransaction(db, async (transaction) => {
    const donationSnap = await transaction.get(donationRef);
    if (!donationSnap.exists()) throw new Error('Donation record not found.');

    const donation = donationSnap.data();
    if (donation.status !== 'offered' && donation.status !== 'scheduled') {
      throw new Error('This donation cannot be cancelled.');
    }

    const donorId = donation.donorId as string | undefined;
    const requestId = donation.requestId as string | undefined;
    if (!donorId) throw new Error('Donation does not have a donor ID.');
    if (!requestId) throw new Error('Donation does not have a request ID.');

    const donorRef = doc(db, 'users', donorId);
    const requestRef = doc(db, 'bloodRequests', requestId);
    const donorSnap = await transaction.get(donorRef);
    const requestSnap = await transaction.get(requestRef);

    const now = new Date().toISOString();

    transaction.update(donationRef, {
      status: 'cancelled',
      cancelledAt: now,
      pendingConfirmation: false,
      updatedAt: now,
    });

    // New offers never reduce quantity, so cancellation must NOT add a unit back.
    // Remove the donor only if an old/legacy record incorrectly put them in matchedDonors.
    if (requestSnap.exists()) {
      const requestData = requestSnap.data();
      const matchedDonors = Array.isArray(requestData.matchedDonors)
        ? requestData.matchedDonors.filter((id: string) => id !== donorId)
        : [];

      transaction.update(requestRef, {
        matchedDonors,
        updatedAt: now,
      });
    }

    if (
      donorSnap.exists() &&
      donorSnap.data().activeDonationId === donationId
    ) {
      transaction.update(donorRef, {
        activeDonationId: null,
        pendingDonationConfirmation: false,
        isAvailable: true,
        bloodStatus: 'Available',
        updatedAt: now,
      });
    }
  });

  return {
    success: true,
    donationId,
    status: 'cancelled' as const,
  };
}

// ============================================================
// UPDATE BLOOD REQUEST
// ============================================================

interface UpdateBloodRequestInput {
  bloodType?: BloodType;
  unitsNeeded: number;
  unitsReceivedOutside: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  requiredDate: string;
  requiredTimeStart?: string;
  requiredTimeEnd?: string;
  location: {
    facilityName: string;
    address: string;
    city: string;
    state: string;
    pincode?: string;
  };
}

export async function updateBloodRequest(
  requestId: string,
  userId: string,
  updates: UpdateBloodRequestInput
) {
  if (!requestId || !userId) {
    throw new Error('Request ID and user ID are required.');
  }

  if (!Number.isInteger(updates.unitsNeeded) || updates.unitsNeeded < 1 || updates.unitsNeeded > 10) {
    throw new Error('Units needed must be a whole number between 1 and 10.');
  }

  if (!Number.isInteger(updates.unitsReceivedOutside) || updates.unitsReceivedOutside < 0) {
    throw new Error('Units received elsewhere must be a non-negative whole number.');
  }

  if (!updates.reason || updates.reason.trim().length < 10) {
    throw new Error('Reason must contain at least 10 characters.');
  }

  if (!updates.location?.facilityName?.trim()) {
    throw new Error('Hospital / Blood Bank name is required.');
  }
  if (!updates.location?.address?.trim()) {
    throw new Error('Hospital / Blood Bank address is required.');
  }
  if (!updates.location?.city?.trim()) {
    throw new Error('City is required for the donation location.');
  }
  if (!updates.location?.state?.trim()) {
    throw new Error('State is required for the donation location.');
  }

  const requestRef = doc(db, 'bloodRequests', requestId);
  const requestSnap = await getDoc(requestRef);

  if (!requestSnap.exists()) {
    throw new Error('Blood request not found.');
  }

  const requestData = requestSnap.data();

  if (requestData.recipientId !== userId) {
    throw new Error('You can edit only your own blood requests.');
  }

  const matchedDonors = Array.isArray(requestData.matchedDonors)
    ? requestData.matchedDonors
    : [];

  const receivedThroughApp = matchedDonors.length;
  const totalAlreadyReceived = receivedThroughApp + updates.unitsReceivedOutside;

  if (updates.unitsNeeded < totalAlreadyReceived) {
    throw new Error(
      `Total requested units cannot be less than ${totalAlreadyReceived} units already received.`
    );
  }

  if (updates.requiredTimeStart && updates.requiredTimeEnd && updates.requiredTimeStart >= updates.requiredTimeEnd) {
    throw new Error('The required start time must be earlier than the end time.');
  }

  // Changing blood type after a donor has matched could invalidate that match.
  if (matchedDonors.length > 0 && updates.bloodType && updates.bloodType !== requestData.bloodType) {
    throw new Error('Blood type cannot be changed after a donor has matched this request.');
  }

  const remainingUnits = Math.max(
    0,
    updates.unitsNeeded - totalAlreadyReceived
  );

  const now = new Date().toISOString();

  await updateDoc(requestRef, {
    bloodType: updates.bloodType || requestData.bloodType,
    unitsNeeded: updates.unitsNeeded,
    quantity: remainingUnits,
    unitsReceivedOutside: updates.unitsReceivedOutside,
    urgency: updates.urgency,
    reason: updates.reason.trim(),
    requiredDate: updates.requiredDate,
    requiredTimeStart: updates.requiredTimeStart || null,
    requiredTimeEnd: updates.requiredTimeEnd || null,
    location: {
      facilityName: updates.location.facilityName.trim(),
      address: updates.location.address.trim(),
      city: updates.location.city.trim(),
      state: updates.location.state.trim(),
      pincode: updates.location.pincode?.trim() || '',
    },
    status: remainingUnits > 0 ? 'open' : 'matched',
    updatedAt: now,
  });

  return {
    success: true,
    remainingUnits,
    status: remainingUnits > 0 ? 'open' : 'matched',
  };
}


// ============================================================
// SUBSCRIBE TO USER DONATIONS
// ============================================================

export function subscribeToUserDonations(
  donorId: string,
  callback: (
    donations: any[]
  ) => void,
  onError?: (
    error: Error
  ) => void
) {

  const donationsRef =
    collection(
      db,
      'donations'
    );


  const q =
    query(
      donationsRef,

      where(
        'donorId',
        '==',
        donorId
      ),

      orderBy(
        'offeredAt',
        'desc'
      )
    );


  return onSnapshot(
    q,

    (snapshot) => {

      const donations =
        snapshot.docs.map(
          (
            docSnap
          ) => ({

            id:
              docSnap.id,

            ...docSnap.data(),

          })
        );


      callback(
        donations
      );
    },

    (error) => {

      console.error(
        'Donations real-time error:',
        error
      );


      if (
        onError
      ) {

        onError(
          error
        );
      }
    }
  );
}