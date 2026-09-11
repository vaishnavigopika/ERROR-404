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
import { BLOOD_TYPES, BloodType } from '@/lib/bloodCompatibility';

import {
  Heart,
  ArrowLeft,
  AlertCircle,
  Clock,
  MapPin,
} from 'lucide-react';

import Link from 'next/link';

function getTodayDate(): string {
  const today = new Date();

  return `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export default function NewRequestPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [profileExists, setProfileExists] = useState(false);

  const [formData, setFormData] = useState({
    bloodType: '',
    quantity: '1',
    urgency: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    reason: '',
    requiredDate: getTodayDate(),
    requiredTimeStart: '09:00',
    requiredTimeEnd: '12:00',

    // Donation location
    facilityName: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
  });

  const minDate = getTodayDate();

  useEffect(() => {
    const checkUserProfile = async () => {
      if (authLoading) return;

      if (!user?.uid) {
        setCheckingProfile(false);
        setProfileExists(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'users', user.uid));

        if (!snap.exists()) {
          setProfileExists(false);

          toast({
            title: 'Profile Not Found',
            description: 'Your user profile could not be found.',
            variant: 'destructive',
          });

          return;
        }

        setProfileExists(true);
      } catch (error) {
        console.error('Error checking user profile:', error);

        setProfileExists(false);

        toast({
          title: 'Error',
          description: 'Could not verify your user profile.',
          variant: 'destructive',
        });
      } finally {
        setCheckingProfile(false);
      }
    };

    checkUserProfile();
  }, [user?.uid, authLoading, toast]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const isValidQuantity =
    Number(formData.quantity) >= 1 &&
    Number(formData.quantity) <= 10;

  const isValidReason =
    formData.reason.trim().length >= 10;

  const isValidDate =
    Boolean(formData.requiredDate) &&
    formData.requiredDate >= minDate;

  const isValidTimeWindow =
    formData.requiredTimeStart < formData.requiredTimeEnd;

  const isValidLocation =
    formData.facilityName.trim().length > 0 &&
    formData.address.trim().length > 0 &&
    formData.city.trim().length > 0 &&
    formData.state.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.uid) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to create a request.',
        variant: 'destructive',
      });

      return;
    }

    if (!profileExists) {
      toast({
        title: 'Profile Required',
        description:
          'A registered user profile is required to create a blood request.',
        variant: 'destructive',
      });

      return;
    }

    // Blood type validation
    if (
      !formData.bloodType ||
      !BLOOD_TYPES.includes(formData.bloodType as BloodType)
    ) {
      toast({
        title: 'Missing Blood Type',
        description: 'Please select a valid blood type.',
        variant: 'destructive',
      });

      return;
    }

    // Quantity validation
    if (!isValidQuantity) {
      toast({
        title: 'Invalid Quantity',
        description: 'Units needed must be between 1 and 10.',
        variant: 'destructive',
      });

      return;
    }

    // Reason validation
    if (!isValidReason) {
      toast({
        title: 'Reason Too Short',
        description:
          'Please provide at least 10 characters explaining your request.',
        variant: 'destructive',
      });

      return;
    }

    // Date validation
    if (!isValidDate) {
      toast({
        title: 'Invalid Date',
        description:
          'Required date cannot be before today.',
        variant: 'destructive',
      });

      return;
    }

    // Time validation
    if (!isValidTimeWindow) {
      toast({
        title: 'Invalid Time Window',
        description:
          'The required start time must be earlier than the end time.',
        variant: 'destructive',
      });

      return;
    }

    // Location validation
    if (!isValidLocation) {
      toast({
        title: 'Missing Location',
        description:
          'Please provide the hospital/blood bank name, address, city, and state.',
        variant: 'destructive',
      });

      return;
    }

    setLoading(true);

    try {
      const quantity = Number(formData.quantity);

      const bloodRequest = {
        recipientId: user.uid,

        // Blood requirement
        bloodType: formData.bloodType as BloodType,
        unitsNeeded: quantity,
        quantity,

        // Request details
        unitsReceivedOutside: 0,
        urgency: formData.urgency,
        reason: formData.reason.trim(),

        // Required schedule
        requiredDate: formData.requiredDate,
        requiredTimeStart: formData.requiredTimeStart,
        requiredTimeEnd: formData.requiredTimeEnd,

        // Donation location
        location: {
          facilityName: formData.facilityName.trim(),
          address: formData.address.trim(),
          city: formData.city.trim(),
          state: formData.state.trim(),
          pincode: formData.pincode.trim(),
        },

        // Request status
        status: 'open' as const,
        matchedDonors: [],

        // Timestamps
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const requestRef = await addDoc(
        collection(db, 'bloodRequests'),
        bloodRequest
      );

      console.log(
        'Blood request created:',
        requestRef.id
      );

      toast({
        title: 'Request Created',
        description:
          'Your blood request has been posted successfully.',
      });

      router.push('/dashboard/requests');
    } catch (error: any) {
      console.error(
        'Error creating request:',
        error
      );

      toast({
        title: 'Creation Failed',
        description:
          error?.message ||
          'Could not create blood request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (checkingProfile || authLoading) {
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

  if (!user || !profileExists) {
    return (
      <div className="p-6 md:p-8 max-w-2xl mx-auto">

        <Card className="border-border">

          <CardContent className="pt-12 pb-12 text-center">

            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />

            <h2 className="text-xl font-semibold mb-2">
              Request Creation Unavailable
            </h2>

            <p className="text-muted-foreground mb-6">
              Please sign in with a registered BloodConnect
              account before creating a blood request.
            </p>

            <Button asChild variant="outline">
              <Link href="/dashboard/requests">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Requests
              </Link>
            </Button>

          </CardContent>

        </Card>

      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-2xl mx-auto">

      {/* Page Header */}
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
          Share the details of the blood you need so compatible
          donors can find your request.
        </p>

      </div>

      <Card className="border-border shadow-sm">

        <CardHeader>

          <CardTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-primary" />
            Request Information
          </CardTitle>

          <CardDescription>
            Set the amount needed, when the blood is required,
            and where the donor needs to donate.
          </CardDescription>

        </CardHeader>

        <CardContent>

          <form
            onSubmit={handleSubmit}
            className="space-y-6"
          >

            {/* Blood Type + Units */}
            <div className="grid sm:grid-cols-2 gap-5">

              {/* Blood Type */}
              <div className="space-y-2">

                <Label>
                  Blood Type Needed{' '}
                  <span className="text-red-500">*</span>
                </Label>

                <Select
                  value={formData.bloodType}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      bloodType: value,
                    }))
                  }
                >

                  <SelectTrigger>
                    <SelectValue placeholder="Select blood type" />
                  </SelectTrigger>

                  <SelectContent>

                    {BLOOD_TYPES.map((type) => (
                      <SelectItem
                        key={type}
                        value={type}
                      >
                        {type}
                      </SelectItem>
                    ))}

                  </SelectContent>

                </Select>

              </div>

              {/* Units */}
              <div className="space-y-2">

                <Label htmlFor="quantity">
                  Units Needed{' '}
                  <span className="text-red-500">*</span>
                </Label>

                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="1"
                  max="10"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  required
                />

              </div>

            </div>

            {/* Urgency */}
            <div className="space-y-2">

              <Label>
                Urgency{' '}
                <span className="text-red-500">*</span>
              </Label>

              <Select
                value={formData.urgency}
                onValueChange={(value: any) =>
                  setFormData((prev) => ({
                    ...prev,
                    urgency: value,
                  }))
                }
              >

                <SelectTrigger>
                  <SelectValue />
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

            {/* Reason */}
            <div className="space-y-2">

              <Label htmlFor="reason">
                Reason for Request{' '}
                <span className="text-red-500">*</span>
              </Label>

              <Textarea
                id="reason"
                name="reason"
                rows={4}
                placeholder="Briefly explain why blood is needed..."
                value={formData.reason}
                onChange={handleInputChange}
                required
                minLength={10}
              />

              <p className="text-xs text-muted-foreground">
                Minimum 10 characters.
              </p>

            </div>

            {/* Required Date / Time */}
            <div className="rounded-lg border border-border p-4 space-y-4">

              <div className="flex items-center gap-2 font-medium">

                <Clock className="w-4 h-4 text-primary" />

                When is the blood needed?

              </div>

              <p className="text-sm text-muted-foreground">
                This is the recipient/hospital&apos;s required
                time window. Donors do not choose this schedule.
              </p>

              <div className="grid sm:grid-cols-3 gap-4">

                {/* Required Date */}
                <div className="space-y-2 sm:col-span-1">

                  <Label htmlFor="requiredDate">
                    Required Date{' '}
                    <span className="text-red-500">*</span>
                  </Label>

                  <Input
                    id="requiredDate"
                    name="requiredDate"
                    type="date"
                    min={minDate}
                    value={formData.requiredDate}
                    onChange={handleInputChange}
                    required
                  />

                </div>

                {/* From */}
                <div className="space-y-2">

                  <Label htmlFor="requiredTimeStart">
                    From{' '}
                    <span className="text-red-500">*</span>
                  </Label>

                  <Input
                    id="requiredTimeStart"
                    name="requiredTimeStart"
                    type="time"
                    value={formData.requiredTimeStart}
                    onChange={handleInputChange}
                    required
                  />

                </div>

                {/* Until */}
                <div className="space-y-2">

                  <Label htmlFor="requiredTimeEnd">
                    Until{' '}
                    <span className="text-red-500">*</span>
                  </Label>

                  <Input
                    id="requiredTimeEnd"
                    name="requiredTimeEnd"
                    type="time"
                    value={formData.requiredTimeEnd}
                    onChange={handleInputChange}
                    required
                  />

                </div>

              </div>

            </div>

            {/* Donation Location */}
            <div className="rounded-lg border border-border p-4 space-y-5">

              <div className="flex items-center gap-2 font-medium">

                <MapPin className="w-4 h-4 text-primary" />

                Where is the blood needed?

              </div>

              <p className="text-sm text-muted-foreground">
                Enter the hospital or blood bank where the donor
                needs to go to donate the blood.
              </p>

              {/* Hospital / Blood Bank Name */}
              <div className="space-y-2">

                <Label htmlFor="facilityName">
                  Hospital / Blood Bank Name{' '}
                  <span className="text-red-500">*</span>
                </Label>

                <Input
                  id="facilityName"
                  name="facilityName"
                  type="text"
                  placeholder="Enter hospital or blood bank name"
                  value={formData.facilityName}
                  onChange={handleInputChange}
                  required
                />

              </div>

              {/* Address */}
              <div className="space-y-2">

                <Label htmlFor="address">
                  Location / Address{' '}
                  <span className="text-red-500">*</span>
                </Label>

                <Textarea
                  id="address"
                  name="address"
                  rows={3}
                  placeholder="Enter the complete address"
                  value={formData.address}
                  onChange={handleInputChange}
                  required
                />

              </div>

              {/* City + State */}
              <div className="grid sm:grid-cols-2 gap-5">

                {/* City */}
                <div className="space-y-2">

                  <Label htmlFor="city">
                    City{' '}
                    <span className="text-red-500">*</span>
                  </Label>

                  <Input
                    id="city"
                    name="city"
                    type="text"
                    placeholder="Enter city"
                    value={formData.city}
                    onChange={handleInputChange}
                    required
                  />

                </div>

                {/* State */}
                <div className="space-y-2">

                  <Label htmlFor="state">
                    State{' '}
                    <span className="text-red-500">*</span>
                  </Label>

                  <Input
                    id="state"
                    name="state"
                    type="text"
                    placeholder="Enter state"
                    value={formData.state}
                    onChange={handleInputChange}
                    required
                  />

                </div>

              </div>

              {/* PIN Code - OPTIONAL */}
              <div className="space-y-2">

                <Label htmlFor="pincode">
                  PIN Code
                </Label>

                <Input
                  id="pincode"
                  name="pincode"
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter PIN code (optional)"
                  value={formData.pincode}
                  onChange={handleInputChange}
                  maxLength={6}
                />

                <p className="text-xs text-muted-foreground">
                  Optional
                </p>

              </div>

            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading
                ? 'Creating Request...'
                : 'Create Blood Request'}
            </Button>

          </form>

        </CardContent>

      </Card>

    </div>
  );
}