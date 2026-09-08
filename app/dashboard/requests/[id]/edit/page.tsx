'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { BLOOD_TYPES, BloodType } from '@/lib/bloodCompatibility';
import { updateBloodRequest } from '@/lib/services/donationService';
import { ArrowLeft, Save, Droplet, Clock } from 'lucide-react';
import Link from 'next/link';

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
}

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  });

  useEffect(() => {
    const load = async () => {
      if (!user?.uid || !requestId) return;
      try {
        const snap = await getDoc(doc(db, 'bloodRequests', requestId));
        if (!snap.exists()) throw new Error('Blood request not found.');
        const data = snap.data() as EditableRequest;
        if (data.recipientId !== user.uid) throw new Error('You can edit only your own blood requests.');

        setRequest(data);
        setForm({
          bloodType: data.bloodType || '',
          unitsNeeded: String(data.unitsNeeded ?? data.quantity ?? 1),
          urgency: data.urgency || 'medium',
          reason: data.reason || '',
          requiredDate: data.requiredDate || getTodayDate(),
          requiredTimeStart: data.requiredTimeStart || '09:00',
          requiredTimeEnd: data.requiredTimeEnd || '12:00',
        });
        setOutsideUnits(String(data.unitsReceivedOutside ?? 0));
      } catch (error: any) {
        console.error('Failed to load request:', error);
        toast({ title: 'Unable to Edit Request', description: error?.message || 'Could not load this request.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.uid, requestId, toast]);

  const bloodConnectReceived = request?.matchedDonors?.length ?? 0;
  const newTotal = Number(form.unitsNeeded) || 0;
  const outside = Math.max(0, Number(outsideUnits) || 0);
  const remaining = useMemo(() => Math.max(0, newTotal - bloodConnectReceived - outside), [newTotal, bloodConnectReceived, outside]);
  const canChangeBloodType = bloodConnectReceived === 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !requestId || !request) return;

    if (!BLOOD_TYPES.includes(form.bloodType as BloodType)) {
      toast({ title: 'Invalid Blood Type', description: 'Please select a valid blood type.', variant: 'destructive' });
      return;
    }
    if (newTotal < 1 || newTotal > 10) {
      toast({ title: 'Invalid Quantity', description: 'Units needed must be between 1 and 10.', variant: 'destructive' });
      return;
    }
    if (outside < 0 || !Number.isInteger(outside)) {
      toast({ title: 'Invalid Outside Units', description: 'Units received elsewhere must be a whole number.', variant: 'destructive' });
      return;
    }
    if (newTotal < bloodConnectReceived + outside) {
      toast({ title: 'Quantity Too Low', description: `Total requested units cannot be less than ${bloodConnectReceived + outside} units already received.`, variant: 'destructive' });
      return;
    }
    if (form.reason.trim().length < 10) {
      toast({ title: 'Reason Too Short', description: 'Please provide at least 10 characters.', variant: 'destructive' });
      return;
    }
    if (!form.requiredDate || form.requiredDate < getTodayDate()) {
      toast({ title: 'Invalid Date', description: 'Required date cannot be before today.', variant: 'destructive' });
      return;
    }
    if (form.requiredTimeStart >= form.requiredTimeEnd) {
      toast({ title: 'Invalid Time Window', description: 'The start time must be earlier than the end time.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await updateBloodRequest(requestId, user.uid, {
        bloodType: canChangeBloodType ? (form.bloodType as BloodType) : request.bloodType,
        unitsNeeded: newTotal,
        unitsReceivedOutside: outside,
        urgency: form.urgency,
        reason: form.reason.trim(),
        requiredDate: form.requiredDate,
        requiredTimeStart: form.requiredTimeStart,
        requiredTimeEnd: form.requiredTimeEnd,
      });
      toast({ title: 'Request Updated', description: 'Your blood request has been updated successfully.' });
      router.push(`/dashboard/requests/${requestId}`);
    } catch (error: any) {
      console.error('Failed to update request:', error);
      toast({ title: 'Update Failed', description: error?.message || 'Could not update your request.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-center"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" /><p>Loading request...</p></div></div>;
  if (!request) return <div className="p-8 text-center"><p className="mb-4">Request could not be loaded.</p><Button asChild><Link href="/dashboard/requests">Back to Requests</Link></Button></div>;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-2xl mx-auto">
      <div className="space-y-2">
        <Link href={`/dashboard/requests/${requestId}`} className="inline-flex items-center gap-2 text-primary hover:underline"><ArrowLeft className="w-4 h-4" />Back to Request</Link>
        <h1 className="text-3xl font-bold tracking-tight">Edit Blood Request</h1>
        <p className="text-muted-foreground">Update your requirement when your situation changes, including blood received outside BloodConnect.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Droplet className="w-5 h-5 text-primary" />Request Information</CardTitle>
          <CardDescription>Blood already received is preserved in the request history.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Blood Type</Label>
                <Select value={form.bloodType} disabled={!canChangeBloodType} onValueChange={(v) => setForm((p) => ({ ...p, bloodType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BLOOD_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                </Select>
                {!canChangeBloodType && <p className="text-xs text-muted-foreground">Blood type cannot be changed after a donor match.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitsNeeded">Total Units Required</Label>
                <Input id="unitsNeeded" type="number" min="1" max="10" value={form.unitsNeeded} onChange={(e) => setForm((p) => ({ ...p, unitsNeeded: e.target.value }))} />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 rounded-lg border p-4 bg-muted/20">
              <div><p className="text-xs text-muted-foreground">Received through BloodConnect</p><p className="text-xl font-bold">{bloodConnectReceived}</p></div>
              <div className="space-y-2"><Label htmlFor="outsideUnits">Received elsewhere</Label><Input id="outsideUnits" type="number" min="0" max="10" value={outsideUnits} onChange={(e) => setOutsideUnits(e.target.value)} /></div>
              <div><p className="text-xs text-muted-foreground">Still needed</p><p className="text-xl font-bold text-primary">{remaining}</p></div>
            </div>

            <div className="space-y-2">
              <Label>Urgency</Label>
              <Select value={form.urgency} onValueChange={(v: any) => setForm((p) => ({ ...p, urgency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
              </Select>
            </div>

            <div className="space-y-2"><Label htmlFor="reason">Reason</Label><Textarea id="reason" rows={4} value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} /></div>

            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center gap-2 font-medium"><Clock className="w-4 h-4 text-primary" />Required date and time</div>
              <p className="text-sm text-muted-foreground">This is the recipient/hospital's requested window. The donor does not choose the schedule.</p>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Date</Label><Input type="date" min={getTodayDate()} value={form.requiredDate} onChange={(e) => setForm((p) => ({ ...p, requiredDate: e.target.value }))} /></div>
                <div className="space-y-2"><Label>From</Label><Input type="time" value={form.requiredTimeStart} onChange={(e) => setForm((p) => ({ ...p, requiredTimeStart: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Until</Label><Input type="time" value={form.requiredTimeEnd} onChange={(e) => setForm((p) => ({ ...p, requiredTimeEnd: e.target.value }))} /></div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? 'Saving Changes...' : 'Save Changes'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
