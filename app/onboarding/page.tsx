'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  Heart,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { isUserEligibleToDonate } from '@/lib/services/userService';


// ============================================================
// TYPES
// ============================================================

type YesNo = 'yes' | 'no' | '';


// ============================================================
// ONBOARDING CONTENT
// ============================================================

function OnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const role =
    searchParams.get('role') || 'donor';

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [checkingProfile, setCheckingProfile] =
    useState(true);

  // ============================================================
  // FORM DATA
  // ============================================================

  const [formData, setFormData] = useState({
    age: '',
    weight: '',

    donatedBefore: '' as YesNo,
    lastDonationDate: '',

    cannotDonate: '' as YesNo,

    hivAids: '' as YesNo,
    hepatitis: '' as YesNo,
    seriousInfectiousDisease: '' as YesNo,

    recentTattooPiercingMakeup: '' as YesNo,
    tattooPiercingMakeupDate: '',

    recentDentalTreatment: '' as YesNo,
    dentalTreatmentDate: '',
  });


  // ============================================================
  // CHECK USER
  // ============================================================

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace('/auth/login');
      return;
    }

    const checkProfile = async () => {
      try {
        const userRef = doc(
          db,
          'users',
          user.uid
        );

        const userSnap =
          await getDoc(userRef);

        if (!userSnap.exists()) {
          toast({
            title: 'Profile not found',
            description:
              'Your account profile could not be found.',
            variant: 'destructive',
          });

          router.replace('/auth/login');
          return;
        }

        const data =
          userSnap.data();

        // If onboarding has already been completed,
        // don't make the user fill it again.
        if (
          data.onboardingCompleted === true
        ) {
          router.replace('/dashboard');
          return;
        }
      } catch (error) {
        console.error(
          'Error checking onboarding profile:',
          error
        );

        toast({
          title: 'Error',
          description:
            'Could not load your profile. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setCheckingProfile(false);
      }
    };

    checkProfile();
  }, [
    user,
    authLoading,
    router,
    toast,
  ]);


  // ============================================================
  // INPUT HANDLER
  // ============================================================

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const {
      name,
      value,
    } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };


  // ============================================================
  // YES / NO HANDLER
  // ============================================================

  const handleYesNoChange = (
    field: keyof typeof formData,
    value: YesNo
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,

      // Clear previous donation date
      // when the user selects No.
      ...(field === 'donatedBefore' &&
      value === 'no'
        ? {
            lastDonationDate: '',
          }
        : {}),

      // Clear tattoo/piercing date
      // when the user selects No.
      ...(field ===
        'recentTattooPiercingMakeup' &&
      value === 'no'
        ? {
            tattooPiercingMakeupDate: '',
          }
        : {}),

      // Clear dental date
      // when the user selects No.
      ...(field ===
        'recentDentalTreatment' &&
      value === 'no'
        ? {
            dentalTreatmentDate: '',
          }
        : {}),
    }));
  };


  // ============================================================
  // VALIDATE STEP ONE
  // ============================================================

  const validateStepOne = () => {
    const age = Number(formData.age);
    const weight = Number(formData.weight);

    if (!formData.age.trim()) {
      toast({
        title: 'Age Required',
        description:
          'Please enter your age.',
        variant: 'destructive',
      });

      return false;
    }

    if (
      !Number.isFinite(age) ||
      age <= 0 ||
      age > 120
    ) {
      toast({
        title: 'Invalid Age',
        description:
          'Please enter a valid age.',
        variant: 'destructive',
      });

      return false;
    }

    if (!formData.weight.trim()) {
      toast({
        title: 'Weight Required',
        description:
          'Please enter your weight.',
        variant: 'destructive',
      });

      return false;
    }

    if (
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      toast({
        title: 'Invalid Weight',
        description:
          'Please enter a valid weight.',
        variant: 'destructive',
      });

      return false;
    }

    if (!formData.donatedBefore) {
      toast({
        title: 'Answer Required',
        description:
          'Please answer whether you have donated blood before.',
        variant: 'destructive',
      });

      return false;
    }

    if (
      formData.donatedBefore === 'yes' &&
      !formData.lastDonationDate
    ) {
      toast({
        title: 'Date Required',
        description:
          'Please enter the date of your last blood donation.',
        variant: 'destructive',
      });

      return false;
    }

    if (
      formData.lastDonationDate &&
      new Date(
        formData.lastDonationDate
      ).getTime() > Date.now()
    ) {
      toast({
        title: 'Invalid Donation Date',
        description:
          'The last donation date cannot be in the future.',
        variant: 'destructive',
      });

      return false;
    }

    if (!formData.cannotDonate) {
      toast({
        title: 'Answer Required',
        description:
          'Please answer whether you have ever been told that you cannot donate blood.',
        variant: 'destructive',
      });

      return false;
    }

    return true;
  };


  // ============================================================
  // VALIDATE STEP TWO
  // ============================================================

  const validateStepTwo = () => {
    const questions = [
      {
        value: formData.hivAids,
        message:
          'Please answer the HIV/AIDS question.',
      },
      {
        value: formData.hepatitis,
        message:
          'Please answer the hepatitis question.',
      },
      {
        value:
          formData.seriousInfectiousDisease,
        message:
          'Please answer the infectious disease question.',
      },
      {
        value:
          formData.recentTattooPiercingMakeup,
        message:
          'Please answer the tattoo, piercing, or permanent makeup question.',
      },
      {
        value:
          formData.recentDentalTreatment,
        message:
          'Please answer the dental treatment question.',
      },
    ];

    for (const question of questions) {
      if (!question.value) {
        toast({
          title: 'Answer Required',
          description:
            question.message,
          variant: 'destructive',
        });

        return false;
      }
    }

    // Tattoo / piercing date
    if (
      formData.recentTattooPiercingMakeup ===
        'yes' &&
      !formData.tattooPiercingMakeupDate
    ) {
      toast({
        title: 'Date Required',
        description:
          'Please enter the date of your recent tattoo, piercing, or permanent makeup.',
        variant: 'destructive',
      });

      return false;
    }

    // Dental date
    if (
      formData.recentDentalTreatment ===
        'yes' &&
      !formData.dentalTreatmentDate
    ) {
      toast({
        title: 'Date Required',
        description:
          'Please enter the date of your recent dental treatment.',
        variant: 'destructive',
      });

      return false;
    }

    // Dates cannot be in the future.
    if (
      formData.tattooPiercingMakeupDate &&
      new Date(
        formData.tattooPiercingMakeupDate
      ).getTime() > Date.now()
    ) {
      toast({
        title: 'Invalid Date',
        description:
          'The tattoo/piercing date cannot be in the future.',
        variant: 'destructive',
      });

      return false;
    }

    if (
      formData.dentalTreatmentDate &&
      new Date(
        formData.dentalTreatmentDate
      ).getTime() > Date.now()
    ) {
      toast({
        title: 'Invalid Date',
        description:
          'The dental treatment date cannot be in the future.',
        variant: 'destructive',
      });

      return false;
    }

    return true;
  };


  // ============================================================
  // NEXT
  // ============================================================

  const handleNext = () => {
    if (!validateStepOne()) {
      return;
    }

    setStep(2);
  };


  // ============================================================
  // BACK
  // ============================================================

  const handleBack = () => {
    setStep(1);
  };


  // ============================================================
  // SAVE ONBOARDING
  // ============================================================

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (!validateStepTwo()) {
      return;
    }

    if (!user) {
      toast({
        title: 'Not Logged In',
        description:
          'Please log in again before completing onboarding.',
        variant: 'destructive',
      });

      router.replace('/auth/login');
      return;
    }

    setSaving(true);

    try {
      const userRef = doc(
        db,
        'users',
        user.uid
      );

      // ========================================================
      // SAVE ALL ONBOARDING ANSWERS
      // ========================================================

      await updateDoc(userRef, {
        onboarding: {
          age: Number(formData.age),

          weight: Number(formData.weight),

          donatedBefore:
            formData.donatedBefore === 'yes',

          lastDonationDate:
            formData.donatedBefore === 'yes'
              ? formData.lastDonationDate
              : null,

          cannotDonate:
            formData.cannotDonate === 'yes',

          hivAids:
            formData.hivAids === 'yes',

          hepatitis:
            formData.hepatitis === 'yes',

          seriousInfectiousDisease:
            formData.seriousInfectiousDisease ===
            'yes',

          recentTattooPiercingMakeup:
            formData.recentTattooPiercingMakeup ===
            'yes',

          tattooPiercingMakeupDate:
            formData.recentTattooPiercingMakeup ===
              'yes'
              ? formData.tattooPiercingMakeupDate
              : null,

          recentDentalTreatment:
            formData.recentDentalTreatment ===
            'yes',

          dentalTreatmentDate:
            formData.recentDentalTreatment ===
              'yes'
              ? formData.dentalTreatmentDate
              : null,
        },

        onboardingCompleted: true,

        updatedAt:
          serverTimestamp(),
      });


      // ========================================================
      // IMMEDIATELY CALCULATE ELIGIBILITY
      // ========================================================
      //
      // This is important.
      //
      // It makes the saved onboarding answers immediately
      // affect:
      //
      //   isAvailable
      //   bloodStatus
      //   nextEligibleDonationDate
      //   donationEligibilityStatus
      //   donationEligibilityReason
      //
      // So a new donor who selected "Yes" for a recent
      // piercing will immediately become unavailable.
      //

      await isUserEligibleToDonate(
        user.uid
      );


      // ========================================================
      // SUCCESS
      // ========================================================

      toast({
        title: 'Onboarding Complete',
        description:
          'Your health information has been saved successfully.',
      });

      router.replace('/dashboard');

    } catch (error: any) {
      console.error(
        'Onboarding save error:',
        error
      );

      toast({
        title: 'Could Not Save',
        description:
          error?.message ||
          'There was a problem saving your information.',
        variant: 'destructive',
      });

    } finally {
      setSaving(false);
    }
  };


  // ============================================================
  // YES / NO BUTTON
  // ============================================================

  const YesNoOption = ({
    field,
    value,
  }: {
    field: keyof typeof formData;
    value: 'yes' | 'no';
  }) => {
    const selected =
      formData[field] === value;

    return (
      <button
        type="button"
        disabled={saving}
        onClick={() =>
          handleYesNoChange(
            field,
            value
          )
        }
        className={`
          flex flex-1 items-center gap-3
          rounded-lg border px-4 py-3
          text-left text-sm
          transition-all
          ${
            selected
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-background hover:bg-secondary/10'
          }
        `}
      >
        <span
          className={`
            flex h-5 w-5 shrink-0
            items-center justify-center
            rounded border
            ${
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/40'
            }
          `}
        >
          {selected && (
            <CheckCircle2 className="h-4 w-4" />
          )}
        </span>

        <span>
          {value === 'yes'
            ? 'Yes'
            : 'No'}
        </span>
      </button>
    );
  };


  // ============================================================
  // LOADING
  // ============================================================

  if (
    authLoading ||
    checkingProfile
  ) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />

          <p className="text-foreground">
            Loading...
          </p>
        </div>
      </div>
    );
  }


  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10 flex items-center justify-center p-4">

      <Card className="border-border max-w-2xl w-full">

        {/* ======================================================
            HEADER
        ====================================================== */}

        <CardHeader className="text-center space-y-4">

          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Heart className="w-7 h-7 text-primary fill-primary" />
            </div>
          </div>

          <div>
            <CardTitle className="text-2xl">
              Blood Donation Health Screening
            </CardTitle>

            <CardDescription className="mt-2">
              Please answer the following questions
              honestly to help us understand your
              eligibility.
            </CardDescription>
          </div>

          {/* PROGRESS */}

          <div className="flex items-center gap-2 pt-2">

            <div
              className={`
                h-2 flex-1 rounded-full
                ${
                  step >= 1
                    ? 'bg-primary'
                    : 'bg-secondary'
                }
              `}
            />

            <div
              className={`
                h-2 flex-1 rounded-full
                ${
                  step >= 2
                    ? 'bg-primary'
                    : 'bg-secondary'
                }
              `}
            />

          </div>

          <p className="text-xs text-muted-foreground">
            Step {step} of 2
          </p>

        </CardHeader>


        {/* ======================================================
            STEP 1
        ====================================================== */}

        {step === 1 && (
          <CardContent>

            <div className="space-y-6">

              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  🩸 Basic Eligibility
                </h2>

                <p className="text-sm text-muted-foreground mt-1">
                  Please provide your basic eligibility information.
                </p>
              </div>


              {/* Q1 */}

              <div className="space-y-2">

                <Label htmlFor="age">
                  What is your age? *
                </Label>

                <Input
                  id="age"
                  name="age"
                  type="number"
                  min="1"
                  max="120"
                  placeholder="Enter your age"
                  value={formData.age}
                  onChange={handleInputChange}
                  disabled={saving}
                />

              </div>


              {/* Q2 */}

              <div className="space-y-2">

                <Label htmlFor="weight">
                  What is your weight? *
                </Label>

                <Input
                  id="weight"
                  name="weight"
                  type="number"
                  min="1"
                  step="0.1"
                  placeholder="Enter your weight in kg"
                  value={formData.weight}
                  onChange={handleInputChange}
                  disabled={saving}
                />

                <p className="text-xs text-muted-foreground">
                  Please enter your weight in kilograms (kg).
                </p>

              </div>


              {/* Q3 */}

              <div className="space-y-3">

                <Label>
                  Have you donated blood before? *
                </Label>

                <div className="flex flex-col sm:flex-row gap-2">

                  <YesNoOption
                    field="donatedBefore"
                    value="yes"
                  />

                  <YesNoOption
                    field="donatedBefore"
                    value="no"
                  />

                </div>

              </div>


              {/* Q4 */}

              {formData.donatedBefore === 'yes' && (
                <div className="space-y-2">

                  <Label htmlFor="lastDonationDate">
                    If yes, when was your last blood donation? *
                  </Label>

                  <Input
                    id="lastDonationDate"
                    name="lastDonationDate"
                    type="date"
                    value={formData.lastDonationDate}
                    onChange={handleInputChange}
                    disabled={saving}
                    max={
                      new Date()
                        .toISOString()
                        .split('T')[0]
                    }
                  />

                </div>
              )}


              {/* Q5 */}

              <div className="space-y-3">

                <Label>
                  Have you ever been told that you cannot donate blood? *
                </Label>

                <div className="flex flex-col sm:flex-row gap-2">

                  <YesNoOption
                    field="cannotDonate"
                    value="yes"
                  />

                  <YesNoOption
                    field="cannotDonate"
                    value="no"
                  />

                </div>

              </div>


              {/* NEXT */}

              <Button
                type="button"
                onClick={handleNext}
                disabled={saving}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Continue

                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>

            </div>

          </CardContent>
        )}


        {/* ======================================================
            STEP 2
        ====================================================== */}

        {step === 2 && (
          <CardContent>

            {/* ==================================================
                SIMPLE BACK AT TOP
            ================================================== */}

            <button
              type="button"
              onClick={handleBack}
              disabled={saving}
              className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>


            <form
              onSubmit={handleSubmit}
              className="space-y-6"
            >

              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  🦠 Infections &amp; Medical History
                </h2>

                <p className="text-sm text-muted-foreground mt-1">
                  Please answer each question before continuing.
                </p>
              </div>


              {/* Q12 */}

              <div className="space-y-3">

                <Label>
                  Have you ever been diagnosed with HIV/AIDS? *
                </Label>

                <div className="flex flex-col sm:flex-row gap-2">

                  <YesNoOption
                    field="hivAids"
                    value="yes"
                  />

                  <YesNoOption
                    field="hivAids"
                    value="no"
                  />

                </div>

              </div>


              {/* Q13 */}

              <div className="space-y-3">

                <Label>
                  Have you ever had hepatitis B or hepatitis C? *
                </Label>

                <div className="flex flex-col sm:flex-row gap-2">

                  <YesNoOption
                    field="hepatitis"
                    value="yes"
                  />

                  <YesNoOption
                    field="hepatitis"
                    value="no"
                  />

                </div>

              </div>


              {/* Q14 */}

              <div className="space-y-3">

                <Label>
                  Have you recently had or been exposed to a serious infectious disease? *
                </Label>

                <div className="flex flex-col sm:flex-row gap-2">

                  <YesNoOption
                    field="seriousInfectiousDisease"
                    value="yes"
                  />

                  <YesNoOption
                    field="seriousInfectiousDisease"
                    value="no"
                  />

                </div>

              </div>


              {/* Q15 */}

              <div className="space-y-3">

                <Label>
                  Have you received a tattoo, piercing, or permanent makeup recently? *
                </Label>

                <div className="flex flex-col sm:flex-row gap-2">

                  <YesNoOption
                    field="recentTattooPiercingMakeup"
                    value="yes"
                  />

                  <YesNoOption
                    field="recentTattooPiercingMakeup"
                    value="no"
                  />

                </div>


                {/* Tattoo date appears only when Yes */}

                {formData.recentTattooPiercingMakeup ===
                  'yes' && (
                  <div className="space-y-2 pt-1">

                    <Label htmlFor="tattooPiercingMakeupDate">
                      When did you receive the tattoo, piercing, or permanent makeup? *
                    </Label>

                    <Input
                      id="tattooPiercingMakeupDate"
                      name="tattooPiercingMakeupDate"
                      type="date"
                      value={
                        formData.tattooPiercingMakeupDate
                      }
                      onChange={handleInputChange}
                      disabled={saving}
                      max={
                        new Date()
                          .toISOString()
                          .split('T')[0]
                      }
                    />

                    <p className="text-xs text-muted-foreground">
                      Your donation eligibility will be
                      evaluated based on this date.
                    </p>

                  </div>
                )}

              </div>


              {/* Q16 */}

              <div className="space-y-3">

                <Label>
                  Have you recently undergone dental treatment? *
                </Label>

                <div className="flex flex-col sm:flex-row gap-2">

                  <YesNoOption
                    field="recentDentalTreatment"
                    value="yes"
                  />

                  <YesNoOption
                    field="recentDentalTreatment"
                    value="no"
                  />

                </div>


                {/* Dental date appears only when Yes */}

                {formData.recentDentalTreatment ===
                  'yes' && (
                  <div className="space-y-2 pt-1">

                    <Label htmlFor="dentalTreatmentDate">
                      When did you undergo the dental treatment? *
                    </Label>

                    <Input
                      id="dentalTreatmentDate"
                      name="dentalTreatmentDate"
                      type="date"
                      value={
                        formData.dentalTreatmentDate
                      }
                      onChange={handleInputChange}
                      disabled={saving}
                      max={
                        new Date()
                          .toISOString()
                          .split('T')[0]
                      }
                    />

                    <p className="text-xs text-muted-foreground">
                      Your donation eligibility will be
                      evaluated based on this date.
                    </p>

                  </div>
                )}

              </div>


              {/* ==================================================
                  COMPLETE ONBOARDING - CENTERED
              ================================================== */}

              <div className="flex justify-center pt-4">

                <Button
                  type="submit"
                  disabled={saving}
                  className="min-w-[220px] bg-primary text-primary-foreground hover:bg-primary/90"
                >

                  {saving ? (
                    <span className="flex items-center gap-2">

                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />

                      Saving...

                    </span>
                  ) : (
                    <span className="flex items-center gap-2">

                      <CheckCircle2 className="h-4 w-4" />

                      Complete Onboarding

                    </span>
                  )}

                </Button>

              </div>

            </form>

          </CardContent>
        )}

      </Card>

    </div>
  );
}


// ============================================================
// PAGE
// ============================================================

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">

          <div className="text-center">

            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />

            <p className="text-foreground">
              Loading...
            </p>

          </div>

        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}