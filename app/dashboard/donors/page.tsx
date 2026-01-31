'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  DocumentData,
  QuerySnapshot,
  doc,
  getDoc
} from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Heart, MapPin, Phone, Mail, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { getCompatibleDonors } from '@/lib/bloodCompatibility';
import { UserProfile } from '@/lib/types';
import { toast } from 'sonner';

export default function DonorsPage() {
  const { user } = useAuth();
  const [donors, setDonors] = useState<UserProfile[]>([]);
  const [filteredDonors, setFilteredDonors] = useState<UserProfile[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    // 1. Fetch current user's profile (to know their blood type)
    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const profile = snap.data() as UserProfile;
        setUserProfile(profile);

        // 2. Fetch compatible donors in real-time
        const compatibleTypes = getCompatibleDonors(profile.bloodType);

        const donorsQuery = query(
          collection(db, 'users'),
          where('role', '==', 'donor'),
          where('isAvailable', '==', true),
          where('bloodType', 'in', compatibleTypes)
        );

        const unsubDonors = onSnapshot(donorsQuery, (snapshot: QuerySnapshot<DocumentData>) => {
          const loadedDonors = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() } as UserProfile))
            .filter((donor) => donor.id !== user.uid); // exclude self

          setDonors(loadedDonors);
          setFilteredDonors(loadedDonors);
          setLoading(false);
        }, (err) => {
          console.error('Error fetching donors:', err);
          toast.error('Failed to load donors');
          setLoading(false);
        });

        return () => unsubDonors();
      } else {
        setLoading(false);
      }
    }, (err) => {
      console.error('Error fetching user profile:', err);
      toast.error('Failed to load your profile');
      setLoading(false);
    });

    return () => unsubUser();
  }, [user?.uid]);

  // Client-side search filter
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredDonors(donors);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = donors.filter((donor) =>
      donor.name?.toLowerCase().includes(term) ||
      donor.bloodType?.toLowerCase().includes(term) ||
      donor.college?.toLowerCase().includes(term)
    );

    setFilteredDonors(filtered);
  }, [searchTerm, donors]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Finding compatible donors...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Find Blood Donors</h1>
          <p className="text-muted-foreground mt-2">
            Compatible donors for your blood type {userProfile?.bloodType || '—'}
          </p>
        </div>

        <Input
          placeholder="Search by name, blood type, or college..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md border-border"
        />
      </div>

      {filteredDonors.length === 0 ? (
        <Card className="border-border bg-muted/30">
          <CardContent className="pt-12 pb-12 text-center space-y-4">
            <Heart className="w-16 h-16 text-muted-foreground/50 mx-auto" />
            <h3 className="text-xl font-semibold">No compatible donors found</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {searchTerm
                ? 'Try different search terms'
                : 'Check back later when more donors become available'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDonors.map((donor) => (
            <Card key={donor.id} className="border-border hover:shadow-lg transition-all duration-200">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{donor.name || 'Anonymous Donor'}</CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className="text-primary border-primary/50 bg-primary/10">
                        {donor.bloodType || '—'}
                      </Badge>
                      {donor.isAvailable && (
                        <span className="text-xs text-green-600 font-medium">Available now</span>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-3 text-sm text-muted-foreground">
                  {donor.college && (
                    <div className="flex items-center gap-3">
                      <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                      <span>{donor.college}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Heart className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{donor.totalDonations || 0} donations</span>
                  </div>
                  {donor.phoneNumber && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                      <span>{donor.phoneNumber}</span>
                    </div>
                  )}
                  {donor.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                      <span>{donor.email}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-border flex gap-3">
                  <Link href={`/dashboard/messages?userId=${donor.id}`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Message
                    </Button>
                  </Link>
                  <Button className="flex-1 bg-primary hover:bg-primary/90" size="sm">
                    <Heart className="w-4 h-4 mr-2" />
                    Connect
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}