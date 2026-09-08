'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';

import {
  collection,
  addDoc,
  doc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';

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
import { Textarea } from '@/components/ui/textarea';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useToast } from '@/hooks/use-toast';

import {
  BLOOD_TYPES,
  BloodType,
} from '@/lib/bloodCompatibility';

import {
  Heart,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';

import Link from 'next/link';


// ============================================================
// HELPERS
// ============================================================

function getTodayDate(): string {
  const today = new Date();

  const year = today.getFullYear();

  const month = String(
    today.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    today.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


// ============================================================
// PAGE
// ============================================================

export default function NewRequestPage() {

  const router = useRouter();

  const { user } = useAuth();

  const { toast } = useToast();


  const [loading, setLoading] =
    useState(false);

  const [checkingProfile, setCheckingProfile] =
    useState(true);

  const [isRecipient, setIsRecipient] =
    useState(false);


  const [formData, setFormData] =
    useState({
      bloodType: '',
      quantity: '1',
      urgency:
        'medium' as
          | 'low'
          | 'medium'
          | 'high'
          | 'critical',
      reason: '',
      requiredDate:
        getTodayDate(),
    });


  const minDate =
    getTodayDate();


  // ==========================================================
  // CHECK USER ROLE
  // ==========================================================

  useEffect(() => {

    const checkUserProfile =
      async () => {

        if (!user?.uid) {

          setCheckingProfile(false);

          return;
        }


        try {

          const userRef =
            doc(
              db,
              'users',
              user.uid
            );


          const userSnap =
            await getDoc(
              userRef
            );


          if (
            !userSnap.exists()
          ) {

            toast({
              title:
                'Profile Not Found',

              description:
                'Your user profile could not be found.',

              variant:
                'destructive',
            });

            setIsRecipient(
              false
            );

            return;
          }


          const userData =
            userSnap.data();


          if (
            userData.role ===
            'recipient'
          ) {

            setIsRecipient(
              true
            );

          } else {

            setIsRecipient(
              false
            );

            toast({
              title:
                'Access Restricted',

              description:
                'Only recipients can create blood requests.',

              variant:
                'destructive',
            });
          }

        } catch (
          error
        ) {

          console.error(
            'Error checking user profile:',
            error
          );

          toast({
            title:
              'Error',

            description:
              'Could not verify your account type.',

            variant:
              'destructive',
          });

          setIsRecipient(
            false
          );

        } finally {

          setCheckingProfile(
            false
          );
        }
      };


    checkUserProfile();

  }, [
    user?.uid,
    toast,
  ]);


  // ==========================================================
  // INPUT HANDLERS
  // ==========================================================

  const handleInputChange =
    (
      e: React.ChangeEvent<
        HTMLInputElement |
        HTMLTextAreaElement
      >
    ) => {

      const {
        name,
        value,
      } = e.target;


      setFormData(
        (prev) => ({
          ...prev,
          [name]:
            value,
        })
      );
    };


  const handleSelectChange =
    (
      name: string,
      value: string
    ) => {

      setFormData(
        (prev) => ({
          ...prev,
          [name]:
            value,
        })
      );
    };


  // ==========================================================
  // FORM VALIDATION
  // ==========================================================

  const quantity =
    Number(
      formData.quantity
    );


  const isValidQuantity =
    Number.isInteger(
      quantity
    ) &&
    quantity >= 1 &&
    quantity <= 10;


  const isValidReason =
    formData.reason.trim().length >= 10;


  const isValidDate =
    Boolean(
      formData.requiredDate &&
      formData.requiredDate >=
        minDate
    );


  const isFormValid =
    Boolean(
      formData.bloodType &&
      isValidQuantity &&
      isValidReason &&
      isValidDate
    );


  // ==========================================================
  // SUBMIT
  // ==========================================================

  const handleSubmit =
    async (
      e: React.FormEvent
    ) => {

      e.preventDefault();


      if (
        !user?.uid
      ) {

        toast({
          title:
            'Authentication Required',

          description:
            'Please sign in to create a request.',

          variant:
            'destructive',
        });

        return;
      }


      if (
        !isRecipient
      ) {

        toast({
          title:
            'Access Restricted',

          description:
            'Only recipients can create blood requests.',

          variant:
            'destructive',
        });

        return;
      }


      if (
        !formData.bloodType
      ) {

        toast({
          title:
            'Missing Blood Type',

          description:
            'Please select the blood type you need.',

          variant:
            'destructive',
        });

        return;
      }


      if (
        !BLOOD_TYPES.includes(
          formData.bloodType as BloodType
        )
      ) {

        toast({
          title:
            'Invalid Blood Type',

          description:
            'Please select a valid blood type.',

          variant:
            'destructive',
        });

        return;
      }


      if (
        !isValidQuantity
      ) {

        toast({
          title:
            'Invalid Quantity',

          description:
            'Units needed must be between 1 and 10.',

          variant:
            'destructive',
        });

        return;
      }


      if (
        !isValidReason
      ) {

        toast({
          title:
            'Reason Too Short',

          description:
            'Please provide at least 10 characters explaining your request.',

          variant:
            'destructive',
        });

        return;
      }


      if (
        !isValidDate
      ) {

        toast({
          title:
            'Invalid Date',

          description:
            'Required date cannot be before today.',

          variant:
            'destructive',
        });

        return;
      }


      setLoading(
        true
      );


      try {

        // =====================================================
        // CREATE BLOOD REQUEST
        // =====================================================

        const bloodRequest = {

          // ---------------------------------------------------
          // OWNER
          // ---------------------------------------------------

          recipientId:
            user.uid,


          // ---------------------------------------------------
          // BLOOD REQUIREMENT
          // ---------------------------------------------------

          bloodType:
            formData.bloodType as BloodType,

          // Original number of units requested.
          // This value NEVER changes.
          unitsNeeded:
            quantity,

          // Remaining number of units needed.
          // This decreases as donors offer blood.
          quantity:
            quantity,


          // ---------------------------------------------------
          // REQUEST DETAILS
          // ---------------------------------------------------

          urgency:
            formData.urgency,

          reason:
            formData.reason.trim(),

          requiredDate:
            formData.requiredDate,


          // ---------------------------------------------------
          // REQUEST STATUS
          // ---------------------------------------------------

          status:
            'open' as const,

          matchedDonors:
            [],


          // ---------------------------------------------------
          // TIMESTAMPS
          // ---------------------------------------------------

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        };


        const requestRef =
          await addDoc(
            collection(
              db,
              'bloodRequests'
            ),
            bloodRequest
          );


        console.log(
          'Blood request created:',
          requestRef.id
        );


        // =====================================================
        // SUCCESS
        // =====================================================

        toast({
          title:
            'Request Created',

          description:
            'Your blood request has been posted successfully.',
        });


        router.push(
          '/dashboard/requests'
        );


      } catch (
        error: any
      ) {

        console.error(
          'Error creating request:',
          error
        );


        toast({
          title:
            'Creation Failed',

          description:
            error?.message ||
            'Could not create blood request. Please try again.',

          variant:
            'destructive',
        });


      } finally {

        setLoading(
          false
        );
      }
    };


  // ==========================================================
  // LOADING / PROFILE CHECK
  // ==========================================================

  if (
    checkingProfile
  ) {

    return (

      <div className="flex items-center justify-center min-h-[60vh]">

        <div className="text-center space-y-4">

          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />

          <p className="text-muted-foreground">
            Checking your account...
          </p>

        </div>

      </div>
    );
  }


  // ==========================================================
  // NOT A RECIPIENT
  // ==========================================================

  if (
    !isRecipient
  ) {

    return (

      <div className="p-6 md:p-8 max-w-2xl mx-auto">

        <Card className="border-border">

          <CardContent className="pt-12 pb-12 text-center">

            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />


            <h2 className="text-xl font-semibold mb-2">

              Request Creation Unavailable

            </h2>


            <p className="text-muted-foreground mb-6">

              Only registered recipients can create
              blood requests.

            </p>


            <Button
              asChild
              variant="outline"
            >

              <Link
                href="/dashboard/requests"
              >

                <ArrowLeft className="w-4 h-4 mr-2" />

                Back to Requests

              </Link>

            </Button>

          </CardContent>

        </Card>

      </div>
    );
  }


  // ==========================================================
  // MAIN UI
  // ==========================================================

  return (

    <div className="p-6 md:p-8 space-y-8 max-w-2xl mx-auto">

      {/* ================================================== */}
      {/* HEADER */}
      {/* ================================================== */}

      <div className="space-y-2">

        <Link
          href="/dashboard/requests"
          className="inline-flex items-center gap-2 text-primary hover:underline"
        >

          <ArrowLeft className="w-4 h-4" />

          Back to Requests

        </Link>


        <h1 className="text-3xl font-bold tracking-tight">

          Create Blood Request

        </h1>


        <p className="text-muted-foreground">

          Share the details of the blood you need so
          compatible donors can find your request.

        </p>

      </div>


      {/* ================================================== */}
      {/* FORM */}
      {/* ================================================== */}

      <Card className="border-border shadow-sm">

        <CardHeader>

          <CardTitle className="flex items-center gap-2">

            <Heart className="w-5 h-5 text-primary" />

            Request Information

          </CardTitle>


          <CardDescription>

            Provide accurate information to help donors
            understand your requirement.

          </CardDescription>

        </CardHeader>


        <CardContent>

          <form
            onSubmit={
              handleSubmit
            }
            className="space-y-6"
          >

            {/* ================================================= */}
            {/* BLOOD TYPE */}
            {/* ================================================= */}

            <div className="space-y-2">

              <Label htmlFor="bloodType">

                Blood Type Required *

              </Label>


              <Select
                value={
                  formData.bloodType
                }
                onValueChange={
                  (value) =>
                    handleSelectChange(
                      'bloodType',
                      value
                    )
                }
                required
              >

                <SelectTrigger
                  id="bloodType"
                >

                  <SelectValue
                    placeholder="Select blood type"
                  />

                </SelectTrigger>


                <SelectContent>

                  {BLOOD_TYPES.map(
                    (type) => (

                      <SelectItem
                        key={type}
                        value={type}
                      >

                        {type}

                      </SelectItem>

                    )
                  )}

                </SelectContent>

              </Select>

            </div>


            {/* ================================================= */}
            {/* QUANTITY + URGENCY */}
            {/* ================================================= */}

            <div className="grid md:grid-cols-2 gap-6">

              {/* QUANTITY */}

              <div className="space-y-2">

                <Label htmlFor="quantity">

                  Units Needed *

                </Label>


                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={
                    formData.quantity
                  }
                  onChange={
                    handleInputChange
                  }
                  required
                />


                <p className="text-xs text-muted-foreground">

                  Each donor can contribute 1 unit.

                </p>

              </div>


              {/* URGENCY */}

              <div className="space-y-2">

                <Label htmlFor="urgency">

                  Urgency Level *

                </Label>


                <Select
                  value={
                    formData.urgency
                  }
                  onValueChange={
                    (value) =>
                      handleSelectChange(
                        'urgency',
                        value
                      )
                  }
                  required
                >

                  <SelectTrigger
                    id="urgency"
                  >

                    <SelectValue
                      placeholder="Select urgency"
                    />

                  </SelectTrigger>


                  <SelectContent>

                    <SelectItem value="low">
                      Low
                    </SelectItem>

                    <SelectItem value="medium">
                      Medium
                    </SelectItem>

                    <SelectItem value="high">
                      High
                    </SelectItem>

                    <SelectItem value="critical">
                      Critical
                    </SelectItem>

                  </SelectContent>

                </Select>

              </div>

            </div>


            {/* ================================================= */}
            {/* REQUIRED DATE */}
            {/* ================================================= */}

            <div className="space-y-2">

              <Label htmlFor="requiredDate">

                Date Needed By *

              </Label>


              <Input
                id="requiredDate"
                name="requiredDate"
                type="date"
                min={
                  minDate
                }
                value={
                  formData.requiredDate
                }
                onChange={
                  handleInputChange
                }
                required
              />


              <p className="text-xs text-muted-foreground">

                Select today or a future date.

              </p>

            </div>


            {/* ================================================= */}
            {/* REASON */}
            {/* ================================================= */}

            <div className="space-y-2">

              <Label htmlFor="reason">

                Reason for Request *

              </Label>


              <Textarea
                id="reason"
                name="reason"
                placeholder="e.g., Major surgery, thalassemia treatment, accident..."
                value={
                  formData.reason
                }
                onChange={
                  handleInputChange
                }
                className="min-h-[120px]"
                required
              />


              <p className="text-xs text-muted-foreground">

                Please provide enough information for
                donors to understand the urgency and
                purpose of the request.

              </p>

            </div>


            {/* ================================================= */}
            {/* BUTTONS */}
            {/* ================================================= */}

            <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t">

              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:flex-none sm:w-32"
                asChild
                disabled={
                  loading
                }
              >

                <Link
                  href="/dashboard/requests"
                >

                  Cancel

                </Link>

              </Button>


              <Button
                type="submit"
                disabled={
                  loading ||
                  !isFormValid
                }
                className="flex-1 bg-primary hover:bg-primary/90"
              >

                {loading ? (

                  <span className="flex items-center gap-2">

                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />

                    Creating...

                  </span>

                ) : (

                  'Create Request'

                )}

              </Button>

            </div>

          </form>

        </CardContent>

      </Card>


      {/* ================================================== */}
      {/* INFORMATION */}
      {/* ================================================== */}

      <Card className="bg-muted/40 border-border">

        <CardHeader className="pb-3">

          <CardTitle className="text-base">

            Important Notes

          </CardTitle>

        </CardHeader>


        <CardContent className="text-sm text-muted-foreground space-y-2">

          <p>
            • Your request will be visible to donors
            with compatible blood types.
          </p>

          <p>
            • Each donor can offer one unit of blood
            per active donation.
          </p>

          <p>
            • Donors can coordinate with you through
            the messaging system.
          </p>

          <p>
            • Always follow proper medical protocols
            and screening requirements for transfusions.
          </p>

          <p>
            • You can track your request and donor
            offers from the requests section.
          </p>

        </CardContent>

      </Card>

    </div>
  );
}