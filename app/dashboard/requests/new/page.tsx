'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { BLOOD_TYPES, BloodType } from '@/lib/bloodCompatibility';
import { Heart, ArrowLeft, AlertCircle, Clock } from 'lucide-react';
import Link from 'next/link';

function getTodayDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
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
    requiredTimeStart: '',
    requiredTimeEnd: '',
  });

  const minDate = getTodayDate();

  const isTodaySelected =
    formData.requiredDate === minDate;

  const currentTime = getCurrentTime();

  const minStartTime =
    isTodaySelected ? currentTime : undefined;

  const minEndTime =
    formData.requiredTimeStart ||
    (isTodaySelected ? currentTime : undefined);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const isValidQuantity = Number(formData.quantity) >= 1 && Number(formData.quantity) <= 10;
  const isValidReason = formData.reason.trim().length >= 10;
  const isValidDate =
    Boolean(formData.requiredDate) &&
    formData.requiredDate >= minDate;

  const hasSelectedTimes =
    Boolean(
      formData.requiredTimeStart &&
      formData.requiredTimeEnd
    );

  const isValidTimeWindow =
    hasSelectedTimes &&
    formData.requiredTimeStart <
      formData.requiredTimeEnd;

  const isValidCurrentTime =
    !isTodaySelected ||
    !formData.requiredTimeStart ||
    formData.requiredTimeStart >= currentTime;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.uid) {
      toast({ title: 'Authentication Required', description: 'Please sign in to create a request.', variant: 'destructive' });
      return;
    }
    if (!profileExists) {
      toast({ title: 'Profile Required', description: 'A registered user profile is required to create a blood request.', variant: 'destructive' });
      return;
    }
    if (!formData.bloodType || !BLOOD_TYPES.includes(formData.bloodType as BloodType)) {
      toast({ title: 'Missing Blood Type', description: 'Please select a valid blood type.', variant: 'destructive' });
      return;
    }
    if (!isValidQuantity) {
      toast({ title: 'Invalid Quantity', description: 'Units needed must be between 1 and 10.', variant: 'destructive' });
      return;
    }
    if (!isValidReason) {
      toast({ title: 'Reason Too Short', description: 'Please provide at least 10 characters explaining your request.', variant: 'destructive' });
      return;
    }
    if (!isValidDate) {
      toast({ title: 'Invalid Date', description: 'Required date cannot be before today.', variant: 'destructive' });
      return;
    }
    if (!hasSelectedTimes) {
      toast({
        title: 'Time Required',
        description: 'Please select both a start time and an end time.',
        variant: 'destructive',
      });
      return;
    }

    if (!isValidCurrentTime) {
      toast({
        title: 'Time Has Passed',
        description: 'Please select a time that has not already passed today.',
        variant: 'destructive',
      });
      return;
    }

    if (!isValidTimeWindow) {
      toast({
        title: 'Invalid Time Window',
        description: 'The required start time must be earlier than the end time.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const quantity = Number(formData.quantity);
      const bloodRequest = {
        recipientId: user.uid,
        bloodType: formData.bloodType as BloodType,
        unitsNeeded: quantity,
        quantity,
        unitsReceivedOutside: 0,
        urgency: formData.urgency,
        reason: formData.reason.trim(),
        requiredDate: formData.requiredDate,
        requiredTimeStart: formData.requiredTimeStart,
        requiredTimeEnd: formData.requiredTimeEnd,
        status: 'open' as const,
        matchedDonors: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const requestRef = await addDoc(collection(db, 'bloodRequests'), bloodRequest);
      console.log('Blood request created:', requestRef.id);

      toast({ title: 'Request Created', description: 'Your blood request has been posted successfully.' });
      router.push('/dashboard/requests');
    } catch (error: any) {
      console.error('Error creating request:', error);
      toast({
        title: 'Creation Failed',
        description: error?.message || 'Could not create blood request. Please try again.',
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
          <p className="text-muted-foreground">Checking your account...</p>
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
            <h2 className="text-xl font-semibold mb-2">Request Creation Unavailable</h2>
            <p className="text-muted-foreground mb-6">
              Please sign in with a registered BloodConnect account before creating a blood request.
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
      <div className="space-y-2">
        <Link href="/dashboard/requests" className="inline-flex items-center gap-2 text-primary hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Requests
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Create Blood Request</h1>
        <p className="text-muted-foreground">Share the details of the blood you need so compatible donors can find your request.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Heart className="w-5 h-5 text-primary" />Request Information</CardTitle>
          <CardDescription>Set the amount needed and when the recipient/hospital needs the blood.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Blood Type Needed</Label>
                <Select value={formData.bloodType} onValueChange={(value) => setFormData((prev) => ({ ...prev, bloodType: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select blood type" /></SelectTrigger>
                  <SelectContent>{BLOOD_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity">Units Needed</Label>
                <Input id="quantity" name="quantity" type="number" min="1" max="10" value={formData.quantity} onChange={handleInputChange} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Urgency</Label>
              <Select value={formData.urgency} onValueChange={(value: any) => setFormData((prev) => ({ ...prev, urgency: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Request</Label>
              <Textarea id="reason" name="reason" rows={4} placeholder="Briefly explain why blood is needed..." value={formData.reason} onChange={handleInputChange} />
              <p className="text-xs text-muted-foreground">Minimum 10 characters.</p>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center gap-2 font-medium"><Clock className="w-4 h-4 text-primary" />When is the blood needed?</div>
              <p className="text-sm text-muted-foreground">This is the recipient/hospital's required time window. Donors do not choose this schedule.</p>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="requiredDate">Required Date</Label>
                  <Input id="requiredDate" name="requiredDate" type="date" min={minDate} value={formData.requiredDate} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requiredTimeStart">From</Label>
                  <Input
                    id="requiredTimeStart"
                    name="requiredTimeStart"
                    type="time"
                    min={minStartTime}
                    value={formData.requiredTimeStart}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requiredTimeEnd">Until</Label>
                  <Input
                    id="requiredTimeEnd"
                    name="requiredTimeEnd"
                    type="time"
                    min={minEndTime}
                    value={formData.requiredTimeEnd}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              {isTodaySelected && (
                <p className="text-xs text-muted-foreground">
                  Since you selected today, time that have already passed cannot be selected.
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating Request...' : 'Create Blood Request'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
