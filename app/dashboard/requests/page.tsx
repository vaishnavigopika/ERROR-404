'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BloodRequest, UserProfile } from '@/lib/types';
import { Droplet, Calendar, AlertCircle, User } from 'lucide-react';
import Link from 'next/link';

const urgencyColors = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

const statusColors = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  matched: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

export default function RequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [recipientNames, setRecipientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRequests = async () => {
      if (!user) return;

      try {
        const requestsRef = collection(db, 'bloodRequests');
        const q = query(requestsRef, where('status', '==', 'open'));
        const querySnapshot = await getDocs(q);

        const allRequests = querySnapshot.docs.map(doc => ({id: 
          doc.id,
          ...doc.data()
        })) as BloodRequest[];
        setRequests(allRequests);

        // Fetch recipient names
        const usersRef = collection(db, 'users');
        const names: Record<string, string> = {};

        for (const request of allRequests) {
          if (!names[request.recipientId]) {
            const userQuery = query(usersRef, where('id', '==', request.recipientId));
            const userDocs = await getDocs(userQuery);
            if (!userDocs.empty) {
              const userData = userDocs.docs[0].data() as UserProfile;
              names[request.recipientId] = userData.name;
            }
          }
        }

        setRecipientNames(names);
      } catch (error) {
        console.error('Error fetching requests:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-foreground">Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Blood Requests</h1>
          <p className="text-foreground/60 mt-2">
            {requests.length} active request{requests.length !== 1 ? 's' : ''} in your network
          </p>
        </div>
        <Link href="/dashboard/requests/new">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            Create Request
          </Button>
        </Link>
      </div>

      {requests.length === 0 ? (
        <Card className="border-border">
          <CardContent className="pt-12 text-center">
            <Droplet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No active requests
            </h3>
            <p className="text-foreground/60 mb-4">
              There are currently no open blood requests
            </p>
            <Link href="/dashboard/requests/new">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                Create a Request
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map(request => (
            <Card key={request.id} className="border-border overflow-hidden hover:shadow-lg transition-shadow">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle className="text-lg">
                        {recipientNames[request.recipientId] || 'Loading...'}
                      </CardTitle>
                      <Badge className="bg-primary/20 text-primary border-primary/30">
                        {request.bloodType}
                      </Badge>
                    </div>
                    <CardDescription>{request.reason}</CardDescription>
                  </div>
                  <div className="text-right">
                    <Badge className={`${urgencyColors[request.urgency]}`}>
                      {request.urgency.charAt(0).toUpperCase() + request.urgency.slice(1)} Priority
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-3 text-foreground/70">
                    <Droplet className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{request.quantity} units needed</span>
                  </div>
                  <div className="flex items-center gap-3 text-foreground/70">
                    <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>Needed by {new Date(request.requiredDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-3 text-foreground/70">
                    <AlertCircle className="w-4 h-4 text-primary flex-shrink-0" />
                    <Badge className={`${statusColors[request.status]}`}>
                      {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    </Badge>
                  </div>
                  {request.matchedDonors.length > 0 && (
                    <div className="flex items-center gap-3 text-foreground/70">
                      <User className="w-4 h-4 text-primary flex-shrink-0" />
                      <span>{request.matchedDonors.length} donor{request.matchedDonors.length !== 1 ? 's' : ''} matched</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-border flex gap-2">
                  <Button variant="outline" className="flex-1 border-border bg-transparent" size="sm">
                    View Details
                  </Button>
                  {request.status === 'open' && (
                    <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" size="sm">
                      Offer Blood
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
