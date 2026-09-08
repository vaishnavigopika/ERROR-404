import {
  collection,
  doc,
  getDoc,
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
  updateUserAfterDonation,
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
  const {
    donorId,
    requestId,
    units,
    date,
    bloodType,
  } = input;

  if (!donorId) {
    throw new Error(
      'Donor ID is required.'
    );
  }

  if (!requestId) {
    throw new Error(
      'Request ID is required.'
    );
  }

  if (units !== 1) {
    throw new Error(
      'A donor can offer only 1 unit per donation.'
    );
  }

  if (
    !(date instanceof Date) ||
    isNaN(date.getTime())
  ) {
    throw new Error(
      'Invalid donation date.'
    );
  }


  // ----------------------------------------------------------
  // CHECK DONOR ELIGIBILITY
  // ----------------------------------------------------------

  const eligible =
    await isUserEligibleToDonate(
      donorId
    );

  if (!eligible) {
    throw new Error(
      'You are currently unavailable for blood donation.'
    );
  }


  // ----------------------------------------------------------
  // GET DONOR PROFILE
  // ----------------------------------------------------------

  const donorRef =
    doc(
      db,
      'users',
      donorId
    );

  const donorSnap =
    await getDoc(
      donorRef
    );

  if (!donorSnap.exists()) {
    throw new Error(
      'Donor profile not found.'
    );
  }

  const donorData =
    donorSnap.data();


  if (
    donorData.role !==
    'donor'
  ) {
    throw new Error(
      'Only registered donors can offer blood.'
    );
  }


  const donorBloodType =
    bloodType ||
    donorData.bloodType;


  if (
    !donorBloodType ||
    !isValidBloodType(
      donorBloodType
    )
  ) {
    throw new Error(
      'Donor has an invalid or missing blood type.'
    );
  }


  // ----------------------------------------------------------
  // CREATE DONATION DOCUMENT REFERENCE
  // ----------------------------------------------------------

  const donationRef =
    doc(
      collection(
        db,
        'donations'
      )
    );


  // ----------------------------------------------------------
  // TRANSACTION
  // ----------------------------------------------------------

  const result =
    await runTransaction(
      db,
      async (transaction) => {

        // ====================================================
        // READ DONOR
        // ====================================================

        const donorTransactionSnap =
          await transaction.get(
            donorRef
          );

        if (
          !donorTransactionSnap.exists()
        ) {
          throw new Error(
            'Donor profile not found.'
          );
        }


        const currentDonorData =
          donorTransactionSnap.data();


        // ====================================================
        // ACTIVE DONATION LOCK
        // ====================================================

        if (
          currentDonorData.activeDonationId
        ) {
          throw new Error(
            'You already have an active blood donation. Complete or cancel it before offering blood to another request.'
          );
        }


        // ====================================================
        // READ REQUEST
        // ====================================================

        const requestRef =
          doc(
            db,
            'bloodRequests',
            requestId
          );


        const requestSnap =
          await transaction.get(
            requestRef
          );


        if (
          !requestSnap.exists()
        ) {
          throw new Error(
            'Blood request not found.'
          );
        }


        const requestData =
          requestSnap.data();


        // ====================================================
        // REQUEST STATUS
        // ====================================================

        if (
          requestData.status !==
          'open'
        ) {
          throw new Error(
            'This blood request is no longer open.'
          );
        }

        // Do not allow offers after the requested date or time window.
        // Offers may be made before the requested window starts; the window
        // describes when the actual donation should take place.
        if (requestData.requiredDate) {
          const now = new Date();
          const todayString =
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
              now.getDate()
            ).padStart(2, '0')}`;
          const requiredDate = String(requestData.requiredDate);

          if (requiredDate < todayString) {
            throw new Error(
              'This blood request has expired because its required date has passed.'
            );
          }

          if (
            requiredDate === todayString &&
            requestData.requiredTimeEnd
          ) {
            const currentTime =
              `${String(now.getHours()).padStart(2, '0')}:${String(
                now.getMinutes()
              ).padStart(2, '0')}`;

            if (currentTime > String(requestData.requiredTimeEnd)) {
              throw new Error(
                `This blood request has expired because its requested time window ended at ${requestData.requiredTimeEnd}.`
              );
            }
          }
        }


        // ====================================================
        // PREVENT SELF-DONATION
        // ====================================================

        if (
          requestData.recipientId ===
          donorId
        ) {
          throw new Error(
            'You cannot donate to your own blood request.'
          );
        }


        // ====================================================
        // REQUEST BLOOD TYPE
        // ====================================================

        const requestBloodType =
          requestData.bloodType;


        if (
          !requestBloodType ||
          !isValidBloodType(
            requestBloodType
          )
        ) {
          throw new Error(
            'Blood request has an invalid blood type.'
          );
        }


        // ====================================================
        // COMPATIBILITY
        // ====================================================

        if (
          !canDonate(
            donorBloodType,
            requestBloodType
          )
        ) {
          throw new Error(
            `Your blood type (${donorBloodType}) is not compatible with this request (${requestBloodType}).`
          );
        }


        // ====================================================
        // CURRENT REQUEST QUANTITY
        // ====================================================

        const currentUnits =
          typeof requestData.quantity ===
          'number'
            ? requestData.quantity
            : typeof requestData.unitsNeeded ===
              'number'
              ? requestData.unitsNeeded
              : 0;


        if (
          currentUnits <= 0
        ) {
          throw new Error(
            'This blood request has already received enough blood.'
          );
        }


        // ====================================================
        // MATCHED DONORS
        // ====================================================

        const existingMatchedDonors =
          Array.isArray(
            requestData.matchedDonors
          )
            ? requestData.matchedDonors
            : [];


        // Prevent the same donor from being added twice.
        const matchedDonors =
          existingMatchedDonors.includes(
            donorId
          )
            ? existingMatchedDonors
            : [
                ...existingMatchedDonors,
                donorId,
              ];


        // ====================================================
        // NEW REQUEST VALUES
        // ====================================================

        const newUnits =
          currentUnits - 1;


        const newStatus =
          newUnits <= 0
            ? 'matched'
            : 'open';


        const now =
          new Date().toISOString();


        // ====================================================
        // DONATION RECORD
        // ====================================================

        const donationData = {

          donorId,

          requestId,

          recipientId:
            requestData.recipientId,

          bloodType:
            donorBloodType,

          units:
            1,

          quantity:
            1,

          status:
            'offered',

          offeredAt:
            now,

          // The date supplied when the donor makes the offer is
          // only the offer timestamp and must NOT be treated as the
          // actual donation appointment. The recipient schedules it.
          donationDate:
            null,

          createdAt:
            now,

          updatedAt:
            now,
        };


        // ====================================================
        // CREATE DONATION
        // ====================================================

        transaction.set(
          donationRef,
          donationData
        );


        // ====================================================
        // UPDATE BLOOD REQUEST
        // ====================================================

        transaction.update(
          requestRef,
          {

            quantity:
              newUnits,

            status:
              newStatus,

            matchedDonors,

            updatedAt:
              now,

          }
        );


        // ====================================================
        // LOCK DONOR
        // ====================================================

        transaction.update(
          donorRef,
          {

            activeDonationId:
              donationRef.id,

            updatedAt:
              now,

          }
        );


        return {

          donationId:
            donationRef.id,

          remainingUnits:
            newUnits,

          status:
            newStatus,

          matchedDonors,

        };
      }
    );


  return {

    success:
      true,

    donationId:
      result.donationId,

    remainingUnits:
      result.remainingUnits,

    status:
      result.status,

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

  if (!donationId) {
    throw new Error(
      'Donation ID is required.'
    );
  }


  if (
    !(completionDate instanceof Date) ||
    isNaN(
      completionDate.getTime()
    )
  ) {
    throw new Error(
      'Invalid completion date.'
    );
  }


  const donationRef =
    doc(
      db,
      'donations',
      donationId
    );


  const donationSnap =
    await getDoc(
      donationRef
    );


  if (
    !donationSnap.exists()
  ) {
    throw new Error(
      'Donation record not found.'
    );
  }


  const donationData =
    donationSnap.data();


  if (
    donationData.status !==
    'scheduled'
  ) {
    throw new Error(
      'Only scheduled donations can be completed.'
    );
  }


  const donorId =
    donationData.donorId;


  if (!donorId) {
    throw new Error(
      'Donation does not have a donor ID.'
    );
  }


  const now =
    new Date().toISOString();


  await updateDoc(
    donationRef,
    {

      status:
        'completed',

      donationDate:
        completionDate.toISOString(),

      completedAt:
        now,

      updatedAt:
        now,

    }
  );


  // Update donor's donation history,
  // availability and next donation date.
  await updateUserAfterDonation(
    donorId,
    completionDate
  );


  // Clear active donation lock.
  const donorRef =
    doc(
      db,
      'users',
      donorId
    );


  const donorSnap =
    await getDoc(
      donorRef
    );


  if (
    donorSnap.exists() &&
    donorSnap.data().activeDonationId ===
      donationId
  ) {

    await updateDoc(
      donorRef,
      {

        activeDonationId:
          null,

        updatedAt:
          now,

      }
    );
  }


  return {

    success:
      true,

    donationId,

    status:
      'completed',

  };
}


// ============================================================
// CANCEL DONATION
// ============================================================

export async function cancelDonation(
  donationId: string
) {

  if (!donationId) {
    throw new Error(
      'Donation ID is required.'
    );
  }


  const donationRef =
    doc(
      db,
      'donations',
      donationId
    );


  const donationSnap =
    await getDoc(
      donationRef
    );


  if (
    !donationSnap.exists()
  ) {
    throw new Error(
      'Donation record not found.'
    );
  }


  const donationData =
    donationSnap.data();


  if (
    donationData.status !==
      'offered' &&
    donationData.status !==
      'scheduled'
  ) {
    throw new Error(
      'This donation cannot be cancelled.'
    );
  }


  const donorId =
    donationData.donorId;


  const requestId =
    donationData.requestId;


  if (!donorId) {
    throw new Error(
      'Donation does not have a donor ID.'
    );
  }


  if (!requestId) {
    throw new Error(
      'Donation does not have a request ID.'
    );
  }


  await runTransaction(
    db,
    async (
      transaction
    ) => {

      // ------------------------------------------------------
      // READ CURRENT DONATION
      // ------------------------------------------------------

      const currentDonationSnap =
        await transaction.get(
          donationRef
        );


      if (
        !currentDonationSnap.exists()
      ) {
        throw new Error(
          'Donation record not found.'
        );
      }


      const currentDonationData =
        currentDonationSnap.data();


      if (
        currentDonationData.status !==
          'offered' &&
        currentDonationData.status !==
          'scheduled'
      ) {
        throw new Error(
          'This donation can no longer be cancelled.'
        );
      }


      // ------------------------------------------------------
      // REFERENCES
      // ------------------------------------------------------

      const requestRef =
        doc(
          db,
          'bloodRequests',
          requestId
        );


      const donorRef =
        doc(
          db,
          'users',
          donorId
        );


      // ------------------------------------------------------
      // READ REQUEST + DONOR
      // ------------------------------------------------------

      const requestSnap =
        await transaction.get(
          requestRef
        );


      const donorSnap =
        await transaction.get(
          donorRef
        );


      const now =
        new Date().toISOString();


      // ------------------------------------------------------
      // CANCEL DONATION
      // ------------------------------------------------------

      transaction.update(
        donationRef,
        {

          status:
            'cancelled',

          cancelledAt:
            now,

          updatedAt:
            now,

        }
      );


      // ------------------------------------------------------
      // RESTORE REQUEST UNIT
      // ------------------------------------------------------

      if (
        requestSnap.exists()
      ) {

        const requestData =
          requestSnap.data();


        const currentUnits =
          typeof requestData.quantity ===
          'number'
            ? requestData.quantity
            : 0;


        const restoredUnits =
          currentUnits + 1;


        // Remove this donor from matchedDonors.
        const existingMatchedDonors =
          Array.isArray(
            requestData.matchedDonors
          )
            ? requestData.matchedDonors
            : [];


        const updatedMatchedDonors =
          existingMatchedDonors.filter(
            (
              id: string
            ) =>
              id !== donorId
          );


        transaction.update(
          requestRef,
          {

            quantity:
              restoredUnits,

            status:
              'open',

            matchedDonors:
              updatedMatchedDonors,

            updatedAt:
              now,

          }
        );
      }


      // ------------------------------------------------------
      // CLEAR DONOR LOCK
      // ------------------------------------------------------

      if (
        donorSnap.exists() &&
        donorSnap.data().activeDonationId ===
          donationId
      ) {

        transaction.update(
          donorRef,
          {

            activeDonationId:
              null,

            updatedAt:
              now,

          }
        );
      }

    }
  );


  return {

    success:
      true,

    donationId,

    status:
      'cancelled',

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