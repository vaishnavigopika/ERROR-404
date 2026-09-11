// lib/services/userService.ts

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  addMonths,
  addDays,
} from 'date-fns';

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

    const date =
      value instanceof Date
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
 * Convert a value to a boolean.
 *
 * Supports both:
 *   true / false
 *   "yes" / "no"
 *   "true" / "false"
 */
function isYes(value: any): boolean {
  if (value === true) return true;

  if (
    typeof value === 'string' &&
    value.toLowerCase() === 'yes'
  ) {
    return true;
  }

  if (
    typeof value === 'string' &&
    value.toLowerCase() === 'true'
  ) {
    return true;
  }

  return false;
}

/**
 * Convert a value to a number.
 */
function parseNumber(value: any): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

/**
 * Return true when the date is still in the future.
 */
function isFutureDate(date: Date): boolean {
  return date.getTime() > Date.now();
}

/**
 * Return the later of two dates.
 */
function laterDate(
  current: Date | null,
  candidate: Date | null
): Date | null {
  if (!candidate) return current;
  if (!current) return candidate;

  return candidate.getTime() > current.getTime()
    ? candidate
    : current;
}

/**
 * Calculate the donor's eligibility based on the
 * information stored in the users/{uid} document.
 *
 * The returned object is used internally by both
 * getUserAvailability() and isUserEligibleToDonate().
 */
function calculateEligibility(data: any): {
  eligible: boolean;
  permanent: boolean;
  medicalReview: boolean;
  reason: string | null;
  nextEligibleDate: Date | null;
} {
  const onboarding = data?.onboarding ?? {};

  const now = new Date();

  let nextEligibleDate: Date | null = null;

  // --------------------------------------------------
  // 1. ONBOARDING COMPLETION
  // --------------------------------------------------

  if (data?.onboardingCompleted !== true) {
    return {
      eligible: false,
      permanent: false,
      medicalReview: true,
      reason: 'Complete your health eligibility onboarding first.',
      nextEligibleDate: null,
    };
  }

  // --------------------------------------------------
  // 2. AGE
  // --------------------------------------------------

  const age =
    parseNumber(onboarding.age) ??
    parseNumber(data.age);

  if (age !== null) {
    if (age < 18) {
      return {
        eligible: false,
        permanent: false,
        medicalReview: false,
        reason:
          'You must be at least 18 years old to donate blood.',
        nextEligibleDate: null,
      };
    }

    if (age > 65) {
      return {
        eligible: false,
        permanent: false,
        medicalReview: false,
        reason:
          'Blood donation is currently restricted for donors above 65 years of age.',
        nextEligibleDate: null,
      };
    }
  }

  // --------------------------------------------------
  // 3. WEIGHT
  // --------------------------------------------------

  const weight =
    parseNumber(onboarding.weight) ??
    parseNumber(data.weight);

  if (weight !== null && weight < 55) {
    return {
      eligible: false,
      permanent: false,
      medicalReview: false,
      reason:
        'You must weigh at least 45 kg to donate blood.',
      nextEligibleDate: null,
    };
  }

  // --------------------------------------------------
  // 4. USER HAS BEEN TOLD THEY CANNOT DONATE
  // --------------------------------------------------

  const cannotDonate =
    isYes(onboarding.cannotDonate) ||
    isYes(data.cannotDonate);

  if (cannotDonate) {
    return {
      eligible: false,
      permanent: true,
      medicalReview: true,
      reason:
        'Your health information indicates that you have been advised not to donate blood.',
      nextEligibleDate: null,
    };
  }

  // --------------------------------------------------
  // 5. HIV/AIDS
  // --------------------------------------------------

  const hivAids =
    isYes(onboarding.hivAids) ||
    isYes(data.hivAids);

  if (hivAids) {
    return {
      eligible: false,
      permanent: true,
      medicalReview: false,
      reason:
        'You are currently not eligible to donate blood based on your HIV/AIDS history.',
      nextEligibleDate: null,
    };
  }

  // --------------------------------------------------
  // 6. HEPATITIS B / C
  // --------------------------------------------------

  const hepatitis =
    isYes(onboarding.hepatitis) ||
    isYes(data.hepatitis);

  if (hepatitis) {
    return {
      eligible: false,
      permanent: true,
      medicalReview: false,
      reason:
        'You are currently not eligible to donate blood based on your hepatitis B/C history.',
      nextEligibleDate: null,
    };
  }

  // --------------------------------------------------
  // 7. SERIOUS INFECTIOUS DISEASE
  // --------------------------------------------------

  const seriousInfectiousDisease =
    isYes(onboarding.seriousInfectiousDisease) ||
    isYes(data.seriousInfectiousDisease);

  if (seriousInfectiousDisease) {
    return {
      eligible: false,
      permanent: false,
      medicalReview: true,
      reason:
        'Your recent infectious disease history requires medical screening before blood donation.',
      nextEligibleDate: null,
    };
  }

  // --------------------------------------------------
  // 8. PREVIOUS BLOOD DONATION
  // --------------------------------------------------

  const lastDonationDate =
    parseDate(data.lastDonation) ??
    parseDate(data.lastDonationDate) ??
    parseDate(onboarding.lastDonationDate);

  if (lastDonationDate) {
    const nextDonationDate =
      addMonths(lastDonationDate, 3);

    if (isFutureDate(nextDonationDate)) {
      nextEligibleDate = laterDate(
        nextEligibleDate,
        nextDonationDate
      );
    }
  }

  // --------------------------------------------------
  // 9. EXISTING nextAvailableDate
  // --------------------------------------------------

  const storedNextAvailableDate =
    parseDate(data.nextAvailableDate);

  if (
    storedNextAvailableDate &&
    isFutureDate(storedNextAvailableDate)
  ) {
    nextEligibleDate = laterDate(
      nextEligibleDate,
      storedNextAvailableDate
    );
  }

  // --------------------------------------------------
  // 10. TATTOO / PIERCING / PERMANENT MAKEUP
  // --------------------------------------------------

  const tattooPiercingMakeup =
    isYes(onboarding.recentTattooPiercingMakeup) ||
    isYes(data.recentTattooPiercingMakeup);

  const tattooDate =
    parseDate(
      onboarding.tattooPiercingMakeupDate
    ) ??
    parseDate(data.tattooPiercingMakeupDate);

  if (tattooPiercingMakeup) {
    if (tattooDate) {
      // App screening rule:
      // 6-month waiting period after tattoo,
      // piercing or permanent makeup.
      const tattooEligibleDate =
        addMonths(tattooDate, 6);

      if (isFutureDate(tattooEligibleDate)) {
        nextEligibleDate = laterDate(
          nextEligibleDate,
          tattooEligibleDate
        );
      }
    } else {
      return {
        eligible: false,
        permanent: false,
        medicalReview: true,
        reason:
          'Please provide the date of your recent tattoo, piercing, or permanent makeup.',
        nextEligibleDate: null,
      };
    }
  }

  // --------------------------------------------------
  // 11. DENTAL TREATMENT
  // --------------------------------------------------

  const recentDentalTreatment =
    isYes(onboarding.recentDentalTreatment) ||
    isYes(data.recentDentalTreatment);

  const dentalDate =
    parseDate(
      onboarding.dentalTreatmentDate
    ) ??
    parseDate(data.dentalTreatmentDate);

  if (recentDentalTreatment) {
    if (dentalDate) {
      // App screening rule:
      // 6-month waiting period after recent dental treatment.
      const dentalEligibleDate =
        addMonths(dentalDate, 6);

      if (isFutureDate(dentalEligibleDate)) {
        nextEligibleDate = laterDate(
          nextEligibleDate,
          dentalEligibleDate
        );
      }
    } else {
      return {
        eligible: false,
        permanent: false,
        medicalReview: true,
        reason:
          'Please provide the date of your recent dental treatment.',
        nextEligibleDate: null,
      };
    }
  }

  // --------------------------------------------------
  // 12. TEMPORARY RESTRICTION EXISTS
  // --------------------------------------------------

  if (nextEligibleDate) {
    return {
      eligible: false,
      permanent: false,
      medicalReview: false,
      reason:
        'You are temporarily unavailable for blood donation.',
      nextEligibleDate,
    };
  }

  // --------------------------------------------------
  // 13. STORED AVAILABILITY
  // --------------------------------------------------

  if (
    data.isAvailable === false ||
    data.bloodStatus === 'Unavailable'
  ) {
    return {
      eligible: false,
      permanent: false,
      medicalReview: false,
      reason:
        'You are currently unavailable for blood donation.',
      nextEligibleDate: null,
    };
  }

  // --------------------------------------------------
  // 14. EVERYTHING IS CLEAR
  // --------------------------------------------------

  return {
    eligible: true,
    permanent: false,
    medicalReview: false,
    reason: null,
    nextEligibleDate: null,
  };
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
    const nextAvailable = addMonths(
      donationDate,
      3
    );

    const updatePayload: Record<string, any> = {
      lastDonation:
        donationDate.toISOString(),

      // Keep this field as well for compatibility
      // with existing profile/request logic.
      lastDonationDate:
        donationDate.toISOString(),

      totalDonations:
        currentTotal + 1,

      isAvailable: false,

      bloodStatus: 'Unavailable',

      nextAvailableDate:
        nextAvailable.toISOString(),

      // Keep a common eligibility field for the
      // Requests page and other UI components.
      nextEligibleDonationDate:
        nextAvailable.toISOString(),

      donationEligibilityStatus:
        'temporarily_unavailable',

      donationEligibilityReason:
        'You must wait 3 months after your completed blood donation.',

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
 * This dynamically evaluates:
 * - age
 * - weight
 * - medical restrictions
 * - donation waiting period
 * - tattoo/piercing waiting period
 * - dental-treatment waiting period
 *
 * Temporary restrictions automatically expire
 * once their waiting periods have ended.
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

    const eligibility =
      calculateEligibility(data);

    // --------------------------------------------------
    // Permanently unavailable / medical review
    // --------------------------------------------------

    if (
      eligibility.permanent ||
      eligibility.medicalReview
    ) {
      await updateAvailabilityFields(
        userRef,
        data,
        eligibility
      );

      return 'Unavailable';
    }

    // --------------------------------------------------
    // Temporary restriction
    // --------------------------------------------------

    if (eligibility.nextEligibleDate) {
      await updateAvailabilityFields(
        userRef,
        data,
        eligibility
      );

      return 'Unavailable';
    }

    // --------------------------------------------------
    // Eligible
    // --------------------------------------------------

    await updateAvailabilityFields(
      userRef,
      data,
      eligibility
    );

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
 * This function is used by donationService.ts before
 * allowing a donor to offer blood.
 *
 * Therefore this is the main eligibility gate.
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

    const eligibility =
      calculateEligibility(data);

    // Update stored availability so the rest of
    // the application reflects the same result.
    await updateAvailabilityFields(
      userRef,
      data,
      eligibility
    );

    return eligibility.eligible;
  } catch (error) {
    console.error(
      '[userService] Eligibility check failed:',
      error
    );

    // Fail closed:
    // if the eligibility check itself fails,
    // do NOT allow a blood offer.
    return false;
  }
}

/**
 * Keep Firestore availability fields synchronized
 * with the calculated eligibility.
 */
async function updateAvailabilityFields(
  userRef: ReturnType<typeof doc>,
  data: any,
  eligibility: {
    eligible: boolean;
    permanent: boolean;
    medicalReview: boolean;
    reason: string | null;
    nextEligibleDate: Date | null;
  }
): Promise<void> {
  const nextDate =
    eligibility.nextEligibleDate;

  const nextDateISO =
    nextDate
      ? nextDate.toISOString()
      : null;

  let status:
    | 'eligible'
    | 'temporarily_unavailable'
    | 'permanently_unavailable'
    | 'medical_review';

  if (eligibility.permanent) {
    status =
      'permanently_unavailable';
  } else if (eligibility.medicalReview) {
    status =
      'medical_review';
  } else if (nextDate) {
    status =
      'temporarily_unavailable';
  } else {
    status = 'eligible';
  }

  const shouldBeAvailable =
    eligibility.eligible;

  const shouldUpdate =
    data.isAvailable !== shouldBeAvailable ||
    data.donationEligibilityStatus !== status ||
    data.donationEligibilityReason !==
      eligibility.reason ||
    data.nextEligibleDonationDate !==
      nextDateISO;

  if (!shouldUpdate) {
    return;
  }

  const updatePayload: Record<string, any> = {
    isAvailable:
      shouldBeAvailable,

    bloodStatus:
      shouldBeAvailable
        ? 'Available'
        : 'Unavailable',

    donationEligibilityStatus:
      status,

    donationEligibilityReason:
      eligibility.reason,

    nextEligibleDonationDate:
      nextDateISO,

    updatedAt:
      serverTimestamp(),
  };

  await updateDoc(
    userRef,
    updatePayload
  );
}