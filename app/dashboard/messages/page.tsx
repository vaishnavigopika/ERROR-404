'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  DonationConversation,
  DonationMessage,
  MAX_MESSAGE_LENGTH,
  messageService,
} from '@/lib/services/messageService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  MessageCircle,
  Send,
  User,
} from 'lucide-react';

interface Person {
  name?: string;
  email?: string;
}

interface DonationInfo {
  donorId: string;
  recipientId: string;
  requestId: string;
  status: string;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDonationId = searchParams.get('donationId');

  const [conversations, setConversations] = useState<DonationConversation[]>([]);
  const [selectedDonationId, setSelectedDonationId] = useState<string | null>(
    requestedDonationId,
  );
  const [selectedConversation, setSelectedConversation] =
    useState<DonationConversation | null>(null);
  const [messages, setMessages] = useState<DonationMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [personNames, setPersonNames] = useState<Record<string, string>>({});
  const [bloodTypes, setBloodTypes] = useState<Record<string, string>>({});
  const [donationInfo, setDonationInfo] = useState<DonationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Keep the URL donationId and selected chat synchronized.
  useEffect(() => {
    setSelectedDonationId(requestedDonationId);
  }, [requestedDonationId]);

  // Load the user's donation conversations in real time.
  useEffect(() => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = messageService.subscribeToDonationConversations(
      user.uid,
      (items) => {
        setConversations(items);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  // Open the donation conversation requested by the URL.
  useEffect(() => {
    if (!user || !requestedDonationId) return;

    let active = true;

    const openRequestedConversation = async () => {
      setChatLoading(true);
      setError(null);

      try {
        const donationSnap = await getDoc(
          doc(db, 'donations', requestedDonationId),
        );

        if (!donationSnap.exists()) {
          throw new Error('Donation record not found.');
        }

        const donation = donationSnap.data() as DonationInfo;

        if (donation.donorId !== user.uid && donation.recipientId !== user.uid) {
          throw new Error('You are not part of this donation conversation.');
        }

        if (donation.status === 'cancelled') {
          throw new Error('Messaging is unavailable for a cancelled donation.');
        }

        const conversation =
          await messageService.getOrCreateDonationConversation(
            requestedDonationId,
            user.uid,
          );

        if (!active) return;

        setDonationInfo(donation);
        setSelectedConversation(conversation);
        setSelectedDonationId(requestedDonationId);
      } catch (err: any) {
        console.error('Failed to open donation conversation:', err);
        if (!active) return;
        setDonationInfo(null);
        setSelectedConversation(null);
        setError(err?.message || 'Could not open this conversation.');
        toast({
          title: 'Unable to Open Conversation',
          description: err?.message || 'Could not open this conversation.',
          variant: 'destructive',
        });
      } finally {
        if (active) setChatLoading(false);
      }
    };

    openRequestedConversation();

    return () => {
      active = false;
    };
  }, [user, requestedDonationId, toast]);

  // Load the conversation selected from the inbox.
  useEffect(() => {
    if (!user || !selectedDonationId || requestedDonationId === selectedDonationId) {
      return;
    }

    const conversation = conversations.find(
      (item) => item.donationId === selectedDonationId,
    );

    if (conversation) {
      setSelectedConversation(conversation);
      setDonationInfo({
        donorId: conversation.donorId,
        recipientId: conversation.recipientId,
        requestId: conversation.requestId,
        status: 'active',
      });
    }
  }, [user, selectedDonationId, requestedDonationId, conversations]);

  // Subscribe to the selected donation's messages in real time.
  useEffect(() => {
    if (!user || !selectedDonationId) {
      setMessages([]);
      return;
    }

    const unsubscribe = messageService.subscribeToDonationMessages(
      selectedDonationId,
      user.uid,
      (items) => {
        setMessages(items);
        window.setTimeout(scrollToBottom, 50);
      },
    );

    messageService
      .markDonationMessagesAsRead(selectedDonationId, user.uid)
      .catch((err) => console.error('Failed to mark messages as read:', err));

    return () => unsubscribe();
  }, [user, selectedDonationId]);

  // Load participant and request information for the selected conversation.
  useEffect(() => {
    if (!selectedConversation) return;

    let active = true;

    const loadNames = async () => {
      const ids = [selectedConversation.donorId, selectedConversation.recipientId];
      const names: Record<string, string> = {};

      for (const id of ids) {
        if (!id || personNames[id]) continue;
        try {
          const snap = await getDoc(doc(db, 'users', id));
          if (snap.exists()) {
            const data = snap.data() as Person;
            names[id] = data.name || 'BloodConnect User';
          }
        } catch (err) {
          console.error('Failed to load user:', err);
        }
      }

      let bloodType = '';
      if (selectedConversation.requestId && !bloodTypes[selectedConversation.requestId]) {
        try {
          const requestSnap = await getDoc(
            doc(db, 'bloodRequests', selectedConversation.requestId),
          );
          if (requestSnap.exists()) {
            bloodType = String(requestSnap.data().bloodType || '');
          }
        } catch (err) {
          console.error('Failed to load request:', err);
        }
      }

      if (!active) return;
      if (Object.keys(names).length) {
        setPersonNames((prev) => ({ ...prev, ...names }));
      }
      if (bloodType) {
        setBloodTypes((prev) => ({
          ...prev,
          [selectedConversation.requestId]: bloodType,
        }));
      }
    };

    loadNames();

    return () => {
      active = false;
    };
  }, [selectedConversation, personNames, bloodTypes]);

  const otherUserId = useMemo(() => {
    if (!user || !selectedConversation) return null;
    return selectedConversation.donorId === user.uid
      ? selectedConversation.recipientId
      : selectedConversation.donorId;
  }, [user, selectedConversation]);

  const otherUserName = otherUserId
    ? personNames[otherUserId] || 'BloodConnect User'
    : 'Conversation';

  const selectedBloodType = selectedConversation
    ? bloodTypes[selectedConversation.requestId]
    : '';

  const handleSelectConversation = (conversation: DonationConversation) => {
    setSelectedDonationId(conversation.donationId);
    setSelectedConversation(conversation);
    setDonationInfo({
      donorId: conversation.donorId,
      recipientId: conversation.recipientId,
      requestId: conversation.requestId,
      status: 'active',
    });
    router.replace(
      `/dashboard/messages?donationId=${encodeURIComponent(conversation.donationId)}`,
    );
  };

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user || !selectedDonationId || !messageText.trim() || sending) return;

    if (messageText.trim().length > MAX_MESSAGE_LENGTH) {
      toast({
        title: 'Message Too Long',
        description: `Messages can contain a maximum of ${MAX_MESSAGE_LENGTH} characters.`,
        variant: 'destructive',
      });
      return;
    }

    setSending(true);

    try {
      await messageService.sendDonationMessage(
        selectedDonationId,
        user.uid,
        messageText,
      );
      setMessageText('');
      window.setTimeout(scrollToBottom, 50);
    } catch (err: any) {
      console.error('Failed to send message:', err);
      toast({
        title: 'Message Not Sent',
        description: err?.message || 'Could not send the message.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleBackToInbox = () => {
    setSelectedDonationId(null);
    setSelectedConversation(null);
    setDonationInfo(null);
    router.replace('/dashboard/messages');
  };

  if (!user) {
    return (
      <div className="p-8 text-center">
        <MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p>Please sign in to view your messages.</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-80px)] p-4 md:p-6 max-w-7xl mx-auto">
      <div className="h-full rounded-xl border bg-background overflow-hidden flex">
        {/* Inbox */}
        <aside
          className={`${selectedConversation ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] shrink-0 border-r flex-col`}
        >
          <div className="p-5 border-b">
            <h1 className="text-2xl font-bold">Messages</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Donor and recipient conversations
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Loading conversations...
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium">No conversations yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A conversation appears after a donor offer is made.
                </p>
              </div>
            ) : (
              conversations.map((conversation) => {
                const otherId =
                  conversation.donorId === user.uid
                    ? conversation.recipientId
                    : conversation.donorId;
                const active = conversation.donationId === selectedDonationId;

                return (
                  <button
                    key={conversation.donationId}
                    type="button"
                    onClick={() => handleSelectConversation(conversation)}
                    className={`w-full text-left rounded-lg p-3 border transition-colors ${
                      active
                        ? 'bg-primary/10 border-primary'
                        : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {personNames[otherId] || 'BloodConnect User'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {conversation.lastMessage || 'Start the conversation'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Chat */}
        <main
          className={`${selectedConversation ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col`}
        >
          {!selectedConversation ? (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <MessageCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
                <h2 className="text-xl font-semibold">Select a conversation</h2>
                <p className="text-muted-foreground mt-2">
                  Choose a donor or recipient conversation from the left.
                </p>
              </div>
            </div>
          ) : (
            <>
              <header className="border-b p-4 flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={handleBackToInbox}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>

                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>

                <div className="min-w-0">
                  <h2 className="font-semibold truncate">{otherUserName}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedBloodType
                      ? `${selectedBloodType} blood request`
                      : 'BloodConnect donation'}
                  </p>
                </div>
              </header>

              {error && (
                <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
                {chatLoading ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    Opening conversation...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center">
                    <div>
                      <MessageCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="font-medium">No messages yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Start the conversation with {otherUserName}.
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map((message) => {
                    const mine = message.senderId === user.uid;

                    return (
                      <div
                        key={message.id}
                        className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 ${
                            mine
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-background border rounded-bl-sm'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {message.content}
                          </p>
                          <p
                            className={`text-[10px] mt-1 text-right ${
                              mine
                                ? 'text-primary-foreground/70'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {formatMessageTime(message.createdAt)}
                            {mine && message.isRead ? ' • Read' : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t p-3 sm:p-4">
                <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      value={messageText}
                      onChange={(event) => setMessageText(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                      placeholder="Type a message..."
                      maxLength={MAX_MESSAGE_LENGTH}
                      disabled={sending || chatLoading || !donationInfo}
                    />
                    <div className="text-[11px] text-muted-foreground text-right mt-1">
                      {messageText.length}/{MAX_MESSAGE_LENGTH}
                    </div>
                  </div>
                  <Button
                    type="submit"
                    size="icon"
                    disabled={sending || chatLoading || !messageText.trim() || !donationInfo}
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
