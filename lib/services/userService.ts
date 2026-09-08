// lib/services/userService.ts

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addMonths, isAfter } from 'date-fns';

/**
 * Get a Date from either a Firestore Timestamp,
 * Date object, or ISO date string.
 */
function parseDate(value: any): Date | null {
  if (!value) return null;

  try {
    if (value?.toDate) {
      const date = value.toDate();

      return isNaN(date.getTime())
        ? null
        : date;
    }

    const date = value instanceof Date
      ? value
      : new Date(value);

    return isNaN(date.getTime())
      ? null
      : date;
  } catch {
    return null;
  }
}

/**
 * Update donor information after an ACTUAL completed donation.
 *
 * This function should ONLY be called when:
 *
 * offered → scheduled → completed
 *
 * It should NOT be called when a donor merely offers blood.
 */
export async function updateUserAfterDonation(
  userId: string,
  donationDate: Date
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.warn(
        `[userService] User document not found for UID: ${userId}`
      );
      return;
    }

    const currentData = userSnap.data() ?? {};

    const currentTotal =
      typeof currentData.totalDonations === 'number'
        ? currentData.totalDonations
        : 0;

    // Current app uses a 3-month interval.
    // This can be made sex-specific later if that information
    // is added to the donor profile.
    const nextAvailable = addMonths(
      donationDate,
      3
    );

    const updatePayload: Record<string, any> = {
      lastDonation:
        donationDate.toISOString(),

      totalDonations:
        currentTotal + 1,

      isAvailable: false,

      bloodStatus: 'Unavailable',

      nextAvailableDate:
        nextAvailable.toISOString(),

      updatedAt: serverTimestamp(),
    };

    await updateDoc(
      userRef,
      updatePayload
    );

    console.log(
      `[userService] Donation completed for ${userId}:\n` +
      `  • lastDonation: ${donationDate.toISOString()}\n` +
      `  • totalDonations: ${currentTotal + 1}\n` +
      `  • nextAvailableDate: ${nextAvailable.toISOString()}\n` +
      `  • bloodStatus: Unavailable`
    );
  } catch (error) {
    console.error(
      '[userService] Failed to update user after donation:',
      error
    );

    throw error;
  }
}

/**
 * Get the donor's current availability.
 *
 * IMPORTANT:
 * If the donor's waiting period has ended,
 * automatically restore availability.
 */
export async function getUserAvailability(
  userId: string
): Promise<'Available' | 'Unavailable' | 'Unknown'> {
  try {
    const userRef = doc(
      db,
      'users',
      userId
    );

    const userSnap =
      await getDoc(userRef);

    if (!userSnap.exists()) {
      console.warn(
        `[userService] User not found: ${userId}`
      );

      return 'Unknown';
    }

    const data =
      userSnap.data() ?? {};

    const nextDate =
      parseDate(data.nextAvailableDate);

    // --------------------------------------------------
    // 1. Check donation waiting period FIRST
    // --------------------------------------------------

    if (nextDate) {
      const now = new Date();

      if (isAfter(now, nextDate)) {
        // Waiting period is over.
        //
        // Automatically restore donor availability.
        if (
          data.isAvailable === false ||
          data.bloodStatus === 'Unavailable'
        ) {
          await updateDoc(userRef, {
            isAvailable: true,
            bloodStatus: 'Available',
            updatedAt: serverTimestamp(),
          });
        }

        return 'Available';
      }

      // Waiting period has NOT ended.
      return 'Unavailable';
    }

    // --------------------------------------------------
    // 2. No waiting period exists
    // --------------------------------------------------

    if (data.isAvailable === false) {
      return 'Unavailable';
    }

    return 'Available';
  } catch (error) {
    console.error(
      '[userService] Error checking user availability:',
      error
    );

    return 'Unknown';
  }
}

/**
 * Check whether a donor is currently eligible to donate.
 *
 * IMPORTANT:
 * A stored isAvailable=false should NOT permanently
 * block the donor if their nextAvailableDate has passed.
 */
export async function isUserEligibleToDonate(
  userId: string
): Promise<boolean> {
  try {
    const userRef = doc(
      db,
      'users',
      userId
    );

    const userSnap =
      await getDoc(userRef);

    if (!userSnap.exists()) {
      return false;
    }

    const data =
      userSnap.data() ?? {};

    const nextDate =
      parseDate(data.nextAvailableDate);

    // --------------------------------------------------
    // 1. Donation waiting period
    // --------------------------------------------------

    if (nextDate) {
      const now = new Date();

      // Still within the waiting period.
      if (!isAfter(now, nextDate)) {
        return false;
      }

      // Waiting period has ended.
      // Automatically restore availability.
      if (
        data.isAvailable === false ||
        data.bloodStatus === 'Unavailable'
      ) {
        await updateDoc(userRef, {
          isAvailable: true,
          bloodStatus: 'Available',
          updatedAt: serverTimestamp(),
        });
      }

      return true;
    }

    // --------------------------------------------------
    // 2. No nextAvailableDate
    // --------------------------------------------------

    if (
      data.bloodStatus === 'Unavailable'
    ) {
      return false;
    }

    return data.isAvailable !== false;
  } catch (error) {
    console.error(
      '[userService] Eligibility check failed:',
      error
    );

    return false;
  }
}