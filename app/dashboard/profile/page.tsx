'use client';

import React from "react"

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { UserProfile } from '@/lib/types';
import { User, MapPin, Phone, Heart } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    college: '',
    year: '',
    medicalHistory: '',
    isAvailable: true,
    location: {
      address: '',
      latitude: 0,
      longitude: 0,
    }
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const profile = docSnap.data() as UserProfile;
          setUserProfile(profile);
          setFormData({
            name: profile.name,
            phoneNumber: profile.phoneNumber,
            college: profile.college,
            year: profile.year,
            medicalHistory: profile.medicalHistory || '',
            isAvailable: profile.isAvailable,
            location: profile.location,
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        toast({
          title: "Error",
          description: "Failed to load profile",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, toast]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      location: { ...prev.location, [name]: value }
    }));
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const docRef = doc(db, 'users', user.uid);
      await updateDoc(docRef, {
        ...formData,
        updatedAt: new Date().toISOString(),
      });

      toast({
        title: "Success",
        description: "Profile updated successfully!"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground">My Profile</h1>
        <p className="text-foreground/60 mt-2">Update your information and preferences</p>
      </div>

      <div className="space-y-6">
        {/* Personal Information */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Your basic profile information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                name="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                className="border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email (Read-only)</Label>
              <Input
                value={userProfile?.email || ''}
                disabled
                className="border-border bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bloodType">Blood Type (Read-only)</Label>
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-primary fill-primary" />
                <span className="text-lg font-semibold text-primary">
                  {userProfile?.bloodType}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location Information */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Location Information
            </CardTitle>
            <CardDescription>
              Your location helps us connect you with nearby donors/recipients
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="college">College/University</Label>
              <Input
                id="college"
                name="college"
                value={formData.college}
                onChange={handleInputChange}
                className="border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                name="address"
                value={formData.location.address}
                onChange={handleLocationChange}
                placeholder="Your full address"
                className="border-border"
              />
            </div>
          </CardContent>
        </Card>

        {/* Medical Information */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-primary" />
              Medical Information
            </CardTitle>
            <CardDescription>
              Your medical history and availability status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="medicalHistory">Medical History</Label>
              <Textarea
                id="medicalHistory"
                name="medicalHistory"
                placeholder="Any relevant medical conditions or allergies..."
                value={formData.medicalHistory}
                onChange={handleInputChange}
                className="border-border"
                rows={4}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-secondary/5 rounded-lg border border-border">
              <div>
                <p className="font-semibold text-foreground">Donation Availability</p>
                <p className="text-sm text-foreground/60">
                  {formData.isAvailable
                    ? 'You are available to donate'
                    : 'You are currently unavailable'}
                </p>
              </div>
              <Switch
                checked={formData.isAvailable}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, isAvailable: checked }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Account Statistics */}
        <Card className="border-border bg-secondary/5">
          <CardHeader>
            <CardTitle>Account Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-foreground/70">Total Donations</span>
              <span className="font-semibold text-foreground">{userProfile?.totalDonations || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground/70">Account Type</span>
              <span className="font-semibold text-foreground capitalize">{userProfile?.role}</span>
            </div>
            {userProfile?.lastDonation && (
              <div className="flex justify-between">
                <span className="text-foreground/70">Last Donation</span>
                <span className="font-semibold text-foreground">
                  {new Date(userProfile.lastDonation).toLocaleDateString()}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          size="lg"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
