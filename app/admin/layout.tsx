'use client';

import React from "react"

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';
import AdminNav from '@/components/admin/AdminNav';
import AdminSidebar from '@/components/admin/AdminSidebar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        console.log('ADMIN CHECK: NO FIREBASE USER');
        router.push('/auth/login');
        return;
      }
      
      console.log('ADMIN CHECK: USER FOUND', user.uid, user.email);

      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const profile = docSnap.data() as UserProfile;
          if (profile.role !== 'admin') {
            router.push('/dashboard');
            return;
          }
          setUserProfile(profile);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        router.push('/dashboard');
      } finally {
        setAuthLoading(false);
      }
    };

    if (!loading) {
      checkAdmin();
    }
  }, [user, loading, router]);

  if (loading || authLoading || !userProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
