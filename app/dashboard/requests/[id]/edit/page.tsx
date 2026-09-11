'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

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
import { updateBloodRequest } from '@/lib/services/donationService';

import {
  ArrowLeft,
  Save,
  Droplet,
  Clock,
  MapPin,
} from 'lucide-react';

import Link from 'next/link';

interface RequestLocation {
  facilityName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

interface EditableRequest {
  recipientId: string;
  bloodType: BloodType;
  unitsNeeded: number;
  quantity: number;
  unitsReceivedOutside?: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  requiredDate: string;
  requiredTimeStart?: string;
  requiredTimeEnd?: string;
  matchedDonors?: string[];
  status: 'open' | 'matched' | 'completed' | 'cancelled';

  // Hospital / Blood Bank donation location
  location?: RequestLocation;
}

function getTodayDate() {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function EditRequestPage() {
  const params = useParams<{ id: string }>();
  const requestId = params?.id;

  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [request, setRequest] = useState<EditableRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [outsideUnits, setOutsideUnits] = useState('0');

  const [form, setForm] = useState({
    bloodType: '' as string,
    unitsNeeded: '1',
    urgency: 'medium' as EditableRequest['urgency'],
    reason: '',
    requiredDate: getTodayDate(),
    requiredTimeStart: '09:00',
    requiredTimeEnd: '12:00',

    // Hospital / Blood Bank location
    facilityName: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
  });

  useEffect(() => {
    const load = async () => {
      if (!user?.uid || !requestId) return;

      try {
        const snap = await getDoc(
          doc(db, 'bloodRequests', requestId)
        );

        if (!snap.exists()) {
          throw new Error('Blood request not found.');
        }

        const data = snap.data() as EditableRequest;

        if (data.recipientId !== user.uid) {
          throw new Error(
            'You can edit only your own blood requests.'
          );
        }

        setRequest(data);

        setForm({
          bloodType: data.bloodType || '',
          unitsNeeded: String(
            data.unitsNeeded ?? data.quantity ?? 1
          ),
          urgency: data.urgency || 'medium',
          reason: data.reason || '',
          requiredDate:
            data.requiredDate || getTodayDate(),
          requiredTimeStart:
            data.requiredTimeStart || '09:00',
          requiredTimeEnd:
            data.requiredTimeEnd || '12:00',

          // IMPORTANT:
          // Only use the blood request's location.
          // Do NOT use recipient.location.
          facilityName:
            data.location?.facilityName || '',
          address:
            data.location?.address || '',
          city:
            data.location?.city || '',
          state:
            data.location?.state || '',
          pincode:
            data.location?.pincode || '',
        });

        setOutsideUnits(
          String(data.unitsReceivedOutside ?? 0)
        );
      } catch (error: any) {
        console.error(
          'Failed to load request:',
          error
        );

        toast({
          title: 'Unable to Edit Request',
          description:
            error?.message ||
            'Could not load this request.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.uid, requestId, toast]);

  const bloodConnectReceived =
    request?.matchedDonors?.length ?? 0;

  const newTotal =
    Number(form.unitsNeeded) || 0;

  const outside = Math.max(
    0,
    Number(outsideUnits) || 0
  );

  const remaining = useMemo(
    () =>
      Math.max(
        0,
        newTotal -
          bloodConnectReceived -
          outside
      ),
    [newTotal, bloodConnectReceived, outside]
  );

  const canChangeBloodType =
    bloodConnectReceived === 0;

  const handleSave = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (
      !user?.uid ||
      !requestId ||
      !request
    ) {
      return;
    }

    // -----------------------------
    // BASIC VALIDATION
    // -----------------------------

    if (
      !BLOOD_TYPES.includes(
        form.bloodType as BloodType
      )
    ) {
      toast({
        title: 'Invalid Blood Type',
        description:
          'Please select a valid blood type.',
        variant: 'destructive',
      });
      return;
    }

    if (newTotal < 1 || newTotal > 10) {
      toast({
        title: 'Invalid Quantity',
        description:
          'Units needed must be between 1 and 10.',
        variant: 'destructive',
      });
      return;
    }

    if (
      outside < 0 ||
      !Number.isInteger(outside)
    ) {
      toast({
        title: 'Invalid Outside Units',
        description:
          'Units received elsewhere must be a whole number.',
        variant: 'destructive',
      });
      return;
    }

    if (
      newTotal <
      bloodConnectReceived + outside
    ) {
      toast({
        title: 'Quantity Too Low',
        description: `Total requested units cannot be less than ${
          bloodConnectReceived + outside
        } units already received.`,
        variant: 'destructive',
      });
      return;
    }

    if (form.reason.trim().length < 10) {
      toast({
        title: 'Reason Too Short',
        description:
          'Please provide at least 10 characters.',
        variant: 'destructive',
      });
      return;
    }

    if (
      !form.requiredDate ||
      form.requiredDate < getTodayDate()
    ) {
      toast({
        title: 'Invalid Date',
        description:
          'Required date cannot be before today.',
        variant: 'destructive',
      });
      return;
    }

    if (
      form.requiredTimeStart >=
      form.requiredTimeEnd
    ) {
      toast({
        title: 'Invalid Time Window',
        description:
          'The start time must be earlier than the end time.',
        variant: 'destructive',
      });
      return;
    }

    // -----------------------------
    // LOCATION VALIDATION
    // -----------------------------

    if (!form.facilityName.trim()) {
      toast({
        title: 'Facility Name Required',
        description:
          'Please enter the hospital or blood bank name.',
        variant: 'destructive',
      });
      return;
    }

    if (!form.address.trim()) {
      toast({
        title: 'Address Required',
        description:
          'Please enter the hospital or blood bank address.',
        variant: 'destructive',
      });
      return;
    }

    if (!form.city.trim()) {
      toast({
        title: 'City Required',
        description:
          'Please enter the city.',
        variant: 'destructive',
      });
      return;
    }

    if (!form.state.trim()) {
      toast({
        title: 'State Required',
        description:
          'Please enter the state.',
        variant: 'destructive',
      });
      return;
    }

    // Pincode is intentionally optional.

    setSaving(true);

    try {
      await updateBloodRequest(
        requestId,
        user.uid,
        {
          bloodType: canChangeBloodType
            ? (form.bloodType as BloodType)
            : request.bloodType,

          unitsNeeded: newTotal,

          unitsReceivedOutside: outside,

          urgency: form.urgency,

          reason: form.reason.trim(),

          requiredDate: form.requiredDate,

          requiredTimeStart:
            form.requiredTimeStart,

          requiredTimeEnd:
            form.requiredTimeEnd,

          // --------------------------------
          // HOSPITAL / BLOOD BANK LOCATION
          // --------------------------------
          location: {
            facilityName:
              form.facilityName.trim(),

            address:
              form.address.trim(),

            city:
              form.city.trim(),

            state:
              form.state.trim(),

            // Optional field.
            // Save an empty string if not provided.
            pincode:
              form.pincode.trim(),
          },
        }
      );

      toast({
        title: 'Request Updated',
        description:
          'Your blood request has been updated successfully.',
      });

      router.push(
        `/dashboard/requests/${requestId}`
      );
    } catch (error: any) {
      console.error(
        'Failed to update request:',
        error
      );

      toast({
        title: 'Update Failed',
        description:
          error?.message ||
          'Could not update your request.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------
  // LOADING STATE
  // -----------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />

          <p>Loading request...</p>
        </div>
      </div>
    );
  }

  // -----------------------------
  // ERROR / NO REQUEST
  // -----------------------------

  if (!request) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4">
          Request could not be loaded.
        </p>

        <Button asChild>
          <Link href="/dashboard/requests">
            Back to Requests
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-3xl mx-auto">

      {/* --------------------------------
          HEADER
      -------------------------------- */}

      <div className="space-y-2">
        <Link
          href={`/dashboard/requests/${requestId}`}
          className="inline-flex items-center gap-2 text-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Request
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">
          Edit Blood Request
        </h1>

        <p className="text-muted-foreground">
          Update your requirement when your
          situation changes, including blood
          received outside BloodConnect.
        </p>
      </div>

      {/* --------------------------------
          REQUEST INFORMATION
      -------------------------------- */}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplet className="w-5 h-5 text-primary" />
            Request Information
          </CardTitle>

          <CardDescription>
            Blood already received is preserved
            in the request history.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleSave}
            className="space-y-6"
          >

            {/* BLOOD TYPE + UNITS */}

            <div className="grid sm:grid-cols-2 gap-5">

              <div className="space-y-2">
                <Label>
                  Blood Type
                </Label>

                <Select
                  value={form.bloodType}
                  disabled={!canChangeBloodType}
                  onValueChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      bloodType: v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
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

                {!canChangeBloodType && (
                  <p className="text-xs text-muted-foreground">
                    Blood type cannot be
                    changed after a donor
                    match.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="unitsNeeded">
                  Total Units Required
                </Label>

                <Input
                  id="unitsNeeded"
                  type="number"
                  min="1"
                  max="10"
                  value={form.unitsNeeded}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      unitsNeeded:
                        e.target.value,
                    }))
                  }
                />
              </div>

            </div>

            {/* --------------------------------
                RECEIVED UNITS
            -------------------------------- */}

            <div className="grid sm:grid-cols-3 gap-4 rounded-lg border p-4 bg-muted/20">

              <div>
                <p className="text-xs text-muted-foreground">
                  Received through BloodConnect
                </p>

                <p className="text-xl font-bold">
                  {bloodConnectReceived}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="outsideUnits">
                  Received elsewhere
                </Label>

                <Input
                  id="outsideUnits"
                  type="number"
                  min="0"
                  max="10"
                  value={outsideUnits}
                  onChange={(e) =>
                    setOutsideUnits(
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Still needed
                </p>

                <p className="text-xl font-bold text-primary">
                  {remaining}
                </p>
              </div>

            </div>

            {/* --------------------------------
                URGENCY
            -------------------------------- */}

            <div className="space-y-2">
              <Label>
                Urgency
              </Label>

              <Select
                value={form.urgency}
                onValueChange={(v: any) =>
                  setForm((p) => ({
                    ...p,
                    urgency: v,
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

            {/* --------------------------------
                REASON
            -------------------------------- */}

            <div className="space-y-2">
              <Label htmlFor="reason">
                Reason
              </Label>

              <Textarea
                id="reason"
                rows={4}
                value={form.reason}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    reason: e.target.value,
                  }))
                }
              />
            </div>

            {/* --------------------------------
                HOSPITAL / BLOOD BANK LOCATION
            -------------------------------- */}

            <div className="rounded-lg border p-5 space-y-5">

              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />

                <div>
                  <h3 className="font-semibold">
                    Donation Location
                  </h3>

                  <p className="text-sm text-muted-foreground">
                    Enter the hospital or blood
                    bank where the donor should
                    go for donation.
                  </p>
                </div>
              </div>

              {/* FACILITY NAME */}

              <div className="space-y-2">
                <Label htmlFor="facilityName">
                  Hospital / Blood Bank Name{' '}
                  <span className="text-destructive">
                    *
                  </span>
                </Label>

                <Input
                  id="facilityName"
                  placeholder="e.g. Amrita Hospital"
                  value={form.facilityName}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      facilityName:
                        e.target.value,
                    }))
                  }
                  required
                />
              </div>

              {/* ADDRESS */}

              <div className="space-y-2">
                <Label htmlFor="address">
                  Address{' '}
                  <span className="text-destructive">
                    *
                  </span>
                </Label>

                <Textarea
                  id="address"
                  rows={3}
                  placeholder="e.g. Ponekkara, AIMS Campus"
                  value={form.address}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      address:
                        e.target.value,
                    }))
                  }
                  required
                />
              </div>

              {/* CITY + STATE */}

              <div className="grid sm:grid-cols-2 gap-4">

                <div className="space-y-2">
                  <Label htmlFor="city">
                    City{' '}
                    <span className="text-destructive">
                      *
                    </span>
                  </Label>

                  <Input
                    id="city"
                    placeholder="e.g. Kochi"
                    value={form.city}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        city:
                          e.target.value,
                      }))
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">
                    State{' '}
                    <span className="text-destructive">
                      *
                    </span>
                  </Label>

                  <Input
                    id="state"
                    placeholder="e.g. Kerala"
                    value={form.state}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        state:
                          e.target.value,
                      }))
                    }
                    required
                  />
                </div>

              </div>

              {/* PINCODE */}

              <div className="space-y-2">
                <Label htmlFor="pincode">
                  Pincode
                </Label>

                <Input
                  id="pincode"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 682041"
                  value={form.pincode}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      pincode:
                        e.target.value,
                    }))
                  }
                />

                <p className="text-xs text-muted-foreground">
                  Optional
                </p>
              </div>

            </div>

            {/* --------------------------------
                REQUIRED DATE / TIME
            -------------------------------- */}

            <div className="rounded-lg border p-4 space-y-4">

              <div className="flex items-center gap-2 font-medium">
                <Clock className="w-4 h-4 text-primary" />

                Required date and time
              </div>

              <p className="text-sm text-muted-foreground">
                This is the recipient/hospital's
                requested window. The donor does
                not choose the schedule.
              </p>

              <div className="grid sm:grid-cols-3 gap-4">

                <div className="space-y-2">
                  <Label>
                    Date
                  </Label>

                  <Input
                    type="date"
                    min={getTodayDate()}
                    value={form.requiredDate}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        requiredDate:
                          e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    From
                  </Label>

                  <Input
                    type="time"
                    value={
                      form.requiredTimeStart
                    }
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        requiredTimeStart:
                          e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    Until
                  </Label>

                  <Input
                    type="time"
                    value={
                      form.requiredTimeEnd
                    }
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        requiredTimeEnd:
                          e.target.value,
                      }))
                    }
                  />
                </div>

              </div>
            </div>

            {/* --------------------------------
                SAVE
            -------------------------------- */}

            <Button
              type="submit"
              className="w-full"
              disabled={saving}
            >
              <Save className="w-4 h-4 mr-2" />

              {saving
                ? 'Saving Changes...'
                : 'Save Changes'}
            </Button>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}